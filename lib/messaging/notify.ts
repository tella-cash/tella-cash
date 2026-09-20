import type { tellaUser } from "@/lib/supabase/types";
import { TelegramBlockedError } from "@/lib/telegram/client";
import { listChannels, markChannelUnverified, type UserChannel } from "./channels";
import { PROVIDERS, type Provider } from "./providers";

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
 * Notifications are text only, and that is a policy rather than a limit.
 * The providers can all draw options and links now — see providers.ts — but
 * an unsolicited message with buttons on it, fanned out to three devices, is
 * a prompt nobody asked for. Tappable widgets belong on replies to something
 * the user just sent, which go through lib/messaging/render.ts instead.
 */

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
    // The legacy shape is built from whatsapp_number, which a channel-rooted
    // account does not have. For those the channel table is not a mirror of
    // the columns, it is the only record — so an empty result here means
    // genuinely unreachable, and inventing a target from a null id would send
    // the message to the string "null".
    const legacy = legacyChannel(user);
    return legacy ? [legacy] : [];
  }

  if (scope === "primary") {
    return [verified.find((c) => c.is_primary) ?? verified[0]];
  }

  return verified;
}

/** The pre-channel-table shape, or null when the account never had one. */
function legacyChannel(user: tellaUser): UserChannel | null {
  if (!user.whatsapp_number) return null;
  return {
    id: "legacy",
    user_id: user.id,
    provider: user.whatsapp_channel,
    external_id: user.whatsapp_number,
    display_name: null,
    username: null,
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
      PROVIDERS[channel.provider].sendText({ to: channel.external_id, body }),
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
      PROVIDERS[channel.provider].sendText({ to: channel.external_id, body }),
    ),
  );

  return countDelivered(user, targets, results, "text");
}

/**
 * Send an image, or the words if the image can't be sent.
 *
 * This lives per channel rather than around the whole fan-out because the
 * channels fail independently: WhatsApp can take the picture while Telegram,
 * which has to fetch or receive it, cannot. Falling back only when every
 * channel failed would leave the one that broke with nothing.
 *
 * A blocked chat is rethrown untouched. The text would be refused for the
 * same reason, and countDelivered needs the original error to take the
 * channel out of the fan-out.
 */
export async function sendImageOrText(
  provider: Pick<Provider, "id" | "sendImage" | "sendText">,
  {
    to,
    imageUrl,
    caption,
    fallbackBody,
  }: { to: string; imageUrl: string; caption?: string; fallbackBody?: string },
): Promise<string> {
  try {
    return await provider.sendImage({ to, imageUrl, caption });
  } catch (err) {
    if (err instanceof TelegramBlockedError) throw err;

    const body = fallbackBody ?? caption;
    if (!body) throw err;

    console.error("[notify] image failed, sending text instead", {
      provider: provider.id,
      err,
    });
    return provider.sendText({ to, body });
  }
}

export async function notifyUserWithImage({
  user,
  imageUrl,
  caption,
  fallbackBody,
}: {
  user: tellaUser;
  imageUrl: string;
  caption?: string;
  /** What to send where the image can't be. Defaults to the caption. */
  fallbackBody?: string;
}): Promise<number> {
  const targets = await resolveTargets(user, "all");

  const results = await Promise.allSettled(
    targets.map((channel) =>
      sendImageOrText(PROVIDERS[channel.provider], {
        to: channel.external_id,
        imageUrl,
        caption,
        fallbackBody,
      }),
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
