import { NextResponse, after } from "next/server";
import {
  verifyTelegramSecret,
  sendTelegramMessage,
  answerTelegramCallback,
} from "@/lib/telegram/client";
import { handleInbound } from "@/lib/messaging/inbound";
import { titleForCallbackData } from "@/lib/agent/menus";
import { upsertChannel, ChannelOwnedByAnotherUserError } from "@/lib/messaging/channels";
import { loadResetContext, consumeResetToken } from "@/lib/security/reset-tokens";
import { notifyUserPrimary } from "@/lib/messaging/notify";
import { raiseAlert } from "@/lib/observability/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/telegram
 *
 * Same shape as both WhatsApp webhooks: verify, ack 200 immediately, do the
 * work in after(). Deliberately so — three inbound routes behaving three
 * different ways is how one of them ends up with a subtle difference nobody
 * remembers making, which is exactly what happened here: this route used to
 * call a bespoke read-only handler while the others called the agent.
 *
 * Telegram does NOT sign request bodies the way Twilio and Meta do. The only
 * thing separating a real update from anyone who guessed this URL is the
 * secret token echoed back in X-Telegram-Bot-Api-Secret-Token, set at
 * setWebhook time. Verified in constant time, failing closed when unset.
 */

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; type: string };
    from?: { id: number; username?: string; first_name?: string };
  };
  /** A tapped inline-keyboard button. See lib/telegram/client.ts. */
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number; type: string } };
    from?: { id: number; username?: string };
  };
}

export async function POST(request: Request) {
  if (!verifyTelegramSecret(request.headers.get("x-telegram-bot-api-secret-token"))) {
    raiseAlert({
      kind: "webhook_signature_failed",
      message: "Rejected an unverified Telegram update.",
      context: { source: "telegram" },
    });
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const inbound = extractInbound(update);
  if (!inbound) {
    // An update this route cannot act on. If it was a tapped button, the
    // spinner is ALREADY turning on the user's screen and the only thing that
    // stops it is answerCallbackQuery — returning here without one leaves the
    // button loading until Telegram gives up on its own, which is exactly
    // what "it looks like it's going to open, then nothing happens" is.
    //
    // Two live paths reach here with a callback in hand: an id we no longer
    // render (extractInbound logs it), and a callback_query whose `message`
    // Telegram omits because the message it belongs to is more than 48 hours
    // old. Neither is safe to guess at — a retired button on a wallet must
    // not be interpreted — but both must still be answered.
    const orphaned = update.callback_query?.id;
    if (orphaned) {
      after(() =>
        answerTelegramCallback(
          orphaned,
          "That button is from an older message. Send /help for the current menu.",
        ),
      );
    }
    return NextResponse.json({ ok: true });
  }

  console.log("[telegram] incoming", {
    id: inbound.messageId,
    tapped: inbound.tapped,
    chars: inbound.text.length,
  });

  after(async () => {
    // Clears the button's spinner. Done first because Telegram gives it only
    // a few seconds, and the agent can take longer than that.
    if (inbound.callbackId) await answerTelegramCallback(inbound.callbackId);

    if (inbound.startToken) {
      await linkAccount({
        chatId: inbound.chatId,
        token: inbound.startToken,
        username: inbound.username,
      });
      return;
    }

    try {
      await handleInbound({
        provider: "telegram",
        externalId: inbound.chatId,
        text: inbound.text,
        messageId: inbound.messageId,
      });
    } catch (err) {
      console.error("[telegram] inbound failed", { id: inbound.messageId, err });
    }
  });

  return NextResponse.json({ ok: true });
}

interface InboundUpdate {
  chatId: string;
  text: string;
  messageId: string;
  username: string | null;
  tapped: boolean;
  callbackId: string | null;
  /** Set when this is the `/start <token>` linking handshake. */
  startToken: string | null;
}

/**
 * Flatten Telegram's two inbound shapes into one.
 *
 * A tapped inline button arrives as a callback_query carrying the choice's
 * id, not its label. Resolving it back to the title here is what keeps the
 * promise made in lib/agent/menus.ts: by the time anything downstream sees
 * it, a tap is indistinguishable from the user having typed the button.
 */
function extractInbound(update: TelegramUpdate): InboundUpdate | null {
  const cb = update.callback_query;
  if (cb?.data && cb.message) {
    const title = titleForCallbackData(cb.data);
    // An id we no longer render — an old message tapped after a deploy that
    // renamed it. Acknowledged rather than answered, since guessing what a
    // retired button used to mean is exactly the wrong move on a wallet.
    if (!title) {
      console.warn("[telegram] unknown callback id", { data: cb.data });
      return null;
    }
    return {
      chatId: String(cb.message.chat.id),
      text: title,
      // Deduped on the callback id, not the message id: the same message can
      // be tapped more than once and each tap is a real, separate intent.
      messageId: `cb:${cb.id}`,
      username: cb.from?.username ?? null,
      tapped: true,
      callbackId: cb.id,
      startToken: null,
    };
  }

  const message = update.message;
  // Only plain text in private chats. A group chat containing a wallet bot is
  // not something to serve balances into by accident.
  if (!message?.text || message.chat.type !== "private") return null;

  const trimmed = message.text.trim();

  // `/start <token>` is the linking handshake, and the one thing that must
  // run before the user is resolved — by definition there is no user yet.
  const startMatch = /^\/start\s+(\S+)$/.exec(trimmed);

  return {
    chatId: String(message.chat.id),
    text: trimmed,
    messageId: String(update.update_id),
    username: message.from?.username ?? null,
    tapped: false,
    callbackId: null,
    startToken: startMatch ? startMatch[1] : null,
  };
}

/**
 * Bind this Telegram chat to the account that minted the token.
 *
 * Consuming the token here rather than on the WhatsApp side is the point:
 * whoever completes this demonstrably controls both the account that asked
 * and the Telegram chat that answered. A token consumed on the way out would
 * only prove the first.
 */
async function linkAccount({
  chatId,
  token,
  username,
}: {
  chatId: string;
  token: string;
  username: string | null;
}): Promise<void> {
  const ctx = await loadResetContext(token, "link_telegram");
  if (!ctx) {
    await sendTelegramMessage({
      to: chatId,
      body: "That link is invalid or has expired. Ask tella on WhatsApp for a new one.",
    });
    return;
  }

  // Single-use, atomically. Two taps on the same deep link resolve to one
  // winner, the same way a confirm link does.
  const consumed = await consumeResetToken(ctx.token.id);
  if (!consumed) {
    await sendTelegramMessage({ to: chatId, body: "That link has already been used." });
    return;
  }

  try {
    await upsertChannel({
      userId: ctx.user.id,
      provider: "telegram",
      externalId: chatId,
      displayName: username,
      // Never primary on linking. Conversational replies stay where the user
      // already is; this channel is for notifications and the kill switch until
      // they say otherwise.
      isPrimary: false,
      verified: true,
    });
  } catch (err) {
    // This chat already belongs to a different tella account. Taking it would
    // silently strip a notification channel from whoever holds that one, so
    // say so instead. The token is already consumed, which is correct: it was
    // used, it just did not succeed, and a fresh one costs one message.
    if (err instanceof ChannelOwnedByAnotherUserError) {
      console.warn("[telegram] chat already linked to another account", {
        userId: ctx.user.id,
      });
      await sendTelegramMessage({
        to: chatId,
        body: [
          "This Telegram account is already connected to a different tella wallet.",
          "",
          "Unlink it from that wallet first, then ask for a new link here.",
        ].join("\n"),
      });
      return;
    }
    throw err;
  }

  await sendTelegramMessage({
    to: chatId,
    body: [
      "✅ Linked. This Telegram account is now connected to your tella wallet.",
      "",
      "You'll get alerts here as well as on WhatsApp, and you can check your balance or freeze your account any time.",
      "",
      "Try /help to see what I do here.",
    ].join("\n"),
  });

  // Announced on the channels they already had. Adding a way to reach an
  // account is a security-relevant change, and the owner hears about it
  // wherever they are — the same doctrine as the PIN-reset notice.
  try {
    await notifyUserPrimary({
      user: ctx.user,
      body: [
        "🔗 A Telegram account was just linked to your tella wallet.",
        "",
        "If this wasn't you, reply *freeze* immediately.",
      ].join("\n"),
    });
  } catch (err) {
    console.error("[telegram] link notification failed", { userId: ctx.user.id, err });
  }

  console.log("[telegram] account linked", { userId: ctx.user.id });
}
