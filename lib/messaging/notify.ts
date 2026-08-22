import type { tellaUser } from "@/lib/supabase/types";
import {
  sendWhatsAppMessage as sendViaTwilio,
  sendWhatsAppImage as sendImageViaTwilio,
} from "@/lib/twilio/client";
import {
  sendWhatsAppMessage as sendViaMeta,
  sendWhatsAppImage as sendImageViaMeta,
} from "@/lib/meta/client";
import { sendTelegramMessage, sendTelegramImage, TelegramBlockedError } from "@/lib/telegram/client";
import { listChannels, markChannelUnverified, type UserChannel } from "./channels";
import type { MessageProvider } from "./processed-messages";

/**
 * Outbound messaging, across however many channels a user has linked.
 *
 * This replaces a two-way ternary on `user.whatsapp_channel`. The ternary was
 * fine while a user had exactly one channel; it stops being fine the moment
 * the question changes from "which provider" to "which of their devices
 * should hear about this", and those are different questions for different
 * messages.
 *
 * THE FAN-OUT POLICY, which is the actual decision in this file:
 *
 *   notifyUser        → EVERY verified channel.
 *   notifyUserPrimary → the primary channel only.
 *
 * Security notices, receipts and inbound-payment alerts go everywhere,
 * because the whole point of a second channel is that the first one may be in
 * someone else's hands. A user whose phone was stolen should learn about the
 * transfer on their laptop, and "we told the device the thief is holding" is
 * not a notification.
 *
 * Conversational replies go to the primary only, because answering "balance"
 * on three devices is noise, not safety.
 *
 * Interactive messages (buttons, list pickers, confirm CTAs) are deliberately
 * NOT here. That is the one place the providers genuinely diverge — Twilio
 * needs pre-provisioned Content Template SIDs and silently degrades to plain
 * text, Meta builds JSON inline, Telegram has its own keyboard shape — and
 * flattening that into a shared interface would mean the lowest common
 * denominator everywhere. The inbound webhook routes keep composing those
 * themselves.
 */

interface TextArgs {
  to: string;
  body: string;
}

interface ImageArgs {
  to: string;
  imageUrl: string;
  caption?: string;
}

interface ChannelClient {
  sendText(args: TextArgs): Promise<string>;
  sendImage(args: ImageArgs): Promise<string>;
}

const CLIENTS: Record<MessageProvider, ChannelClient> = {
  twilio: {
    sendText: ({ to, body }) => sendViaTwilio({ to, body }),
    sendImage: ({ to, imageUrl, caption }) => sendImageViaTwilio({ to, imageUrl, caption }),
  },
  meta: {
    sendText: ({ to, body }) => sendViaMeta({ to, body }),
    sendImage: ({ to, imageUrl, caption }) => sendImageViaMeta({ to, imageUrl, caption }),
  },
  telegram: {
    sendText: ({ to, body }) => sendTelegramMessage({ to, body }),
    sendImage: ({ to, imageUrl, caption }) => sendTelegramImage({ to, imageUrl, caption }),
  },
};

/**
 * Channels to deliver to, with a fallback for users who predate the channel
 * table or whose backfill row is missing. The legacy columns are still
 * written, so falling back to them is correct rather than merely defensive.
 */
async function resolveTargets(
  user: tellaUser,
  scope: "all" | "primary",
): Promise<UserChannel[]> {
  let channels: UserChannel[] = [];
  try {
    channels = await listChannels(user.id);
  } catch (err) {
    console.error("[notify] channel lookup failed, using legacy columns", {
      userId: user.id,
      err,
    });
  }

  const verified = channels.filter((c) => c.verified_at !== null);

  if (verified.length === 0) {
    return [legacyChannel(user)];
  }

  if (scope === "primary") {
    return [verified.find((c) => c.is_primary) ?? verified[0]];
  }

  return verified;
}

/** The pre-channel-table shape, synthesised so callers need no special case. */
function legacyChannel(user: tellaUser): UserChannel {
  return {
    id: "legacy",
    user_id: user.id,
    provider: user.whatsapp_channel,
    external_id: user.whatsapp_number,
    display_name: null,
    is_primary: true,
    verified_at: null,
    last_inbound_at: null,
    created_at: user.created_at,
  };
}

/**
 * Send to every verified channel.
 *
 * Promise.allSettled, not Promise.all: one dead channel must not stop the
 * others. A user who blocked the Telegram bot still needs the WhatsApp
 * message saying their account was frozen, and that is exactly the moment
 * this would otherwise fail.
 *
 * Resolves to the number of channels that accepted the message. Zero means
 * the user was not reached at all, which callers on the security path should
 * treat as significant.
 */
export async function notifyUser({
  user,
  body,
}: {
  user: tellaUser;
  body: string;
}): Promise<number> {
  const targets = await resolveTargets(user, "all");

  const results = await Promise.allSettled(
    targets.map((channel) =>
      CLIENTS[channel.provider].sendText({ to: channel.external_id, body }),
    ),
  );

  return countDelivered(user, targets, results, "text");
}

/** Conversational replies. One channel, the primary. */
export async function notifyUserPrimary({
  user,
  body,
}: {
  user: tellaUser;
  body: string;
}): Promise<number> {
  const targets = await resolveTargets(user, "primary");

  const results = await Promise.allSettled(
    targets.map((channel) =>
      CLIENTS[channel.provider].sendText({ to: channel.external_id, body }),
    ),
  );

  return countDelivered(user, targets, results, "text");
}

export async function notifyUserWithImage({
  user,
  imageUrl,
  caption,
}: {
  user: tellaUser;
  imageUrl: string;
  caption?: string;
}): Promise<number> {
  const targets = await resolveTargets(user, "all");

  const results = await Promise.allSettled(
    targets.map((channel) =>
      CLIENTS[channel.provider].sendImage({ to: channel.external_id, imageUrl, caption }),
    ),
  );

  return countDelivered(user, targets, results, "image");
}

function countDelivered(
  user: tellaUser,
  targets: UserChannel[],
  results: PromiseSettledResult<string>[],
  kind: string,
): number {
  let delivered = 0;

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      delivered++;
      return;
    }

    const channel = targets[i];
    console.error("[notify] delivery failed", {
      userId: user.id,
      provider: channel.provider,
      kind,
      err: result.reason,
    });

    // A blocked bot fails identically forever. Take it out of the fan-out
    // rather than paying for that failure on every future message.
    if (result.reason instanceof TelegramBlockedError && channel.id !== "legacy") {
      void markChannelUnverified(channel.id);
    }
  });

  if (delivered === 0) {
    console.error("[notify] user not reached on any channel", { userId: user.id, kind });
  }

  return delivered;
}
