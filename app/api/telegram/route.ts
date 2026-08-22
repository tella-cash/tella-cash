import { NextResponse, after } from "next/server";
import { verifyTelegramSecret, sendTelegramMessage } from "@/lib/telegram/client";
import { handleTelegramCommand } from "@/lib/telegram/handler";
import { claimMessage, releaseMessage } from "@/lib/messaging/processed-messages";
import { findChannel, upsertChannel } from "@/lib/messaging/channels";
import { findUserById } from "@/lib/users/repository";
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
 * remembers making.
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

  const message = update.message;
  // Only plain text in private chats. A group chat containing a wallet bot is
  // not something to serve balances into by accident.
  if (!message?.text || message.chat.type !== "private") {
    return NextResponse.json({ ok: true });
  }

  const chatId = String(message.chat.id);
  const text = message.text;
  const updateId = String(update.update_id);

  console.log("[telegram] incoming", { updateId, chars: text.length });

  after(async () => {
    const claimed = await claimMessage({ provider: "telegram", messageId: updateId });
    if (!claimed) {
      console.log("[telegram] duplicate delivery ignored", { updateId });
      return;
    }

    try {
      await processUpdate({ chatId, text, username: message.from?.username ?? null });
    } catch (err) {
      console.error("[telegram] processing error", err);
      await releaseMessage({ provider: "telegram", messageId: updateId });
    }
  });

  return NextResponse.json({ ok: true });
}

async function processUpdate({
  chatId,
  text,
  username,
}: {
  chatId: string;
  text: string;
  username: string | null;
}): Promise<void> {
  const trimmed = text.trim();

  // `/start <token>` is the linking handshake. The token was minted on an
  // already-authenticated channel and is consumed HERE, on the Telegram side,
  // which is what proves control of both ends at once.
  const startMatch = /^\/start\s+(\S+)$/.exec(trimmed);
  if (startMatch) {
    await linkAccount({ chatId, token: startMatch[1], username });
    return;
  }

  const channel = await findChannel("telegram", chatId);
  if (!channel || !channel.verified_at) {
    await sendTelegramMessage({
      to: chatId,
      body: [
        "This Telegram account isn't linked to a tella wallet yet.",
        "",
        'Message tella on WhatsApp and say "link telegram" — I\'ll send you a link that connects the two.',
      ].join("\n"),
    });
    return;
  }

  const user = await findUserById(channel.user_id);
  if (!user) {
    await sendTelegramMessage({ to: chatId, body: "I couldn't find that account." });
    return;
  }

  const reply = await handleTelegramCommand({ user, text: trimmed });
  await sendTelegramMessage({ to: chatId, body: reply.text });
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
