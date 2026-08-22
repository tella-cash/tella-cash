import { timingSafeEqual } from "node:crypto";

/**
 * Telegram Bot API client.
 *
 * Mirrors the shape of lib/meta/client.ts: a bare fetch per call, no
 * persistent client, config from env. Only the two verbs the messaging layer
 * shares across providers live here — interactive keyboards stay out, for the
 * reason lib/messaging/notify.ts explains.
 */

const API_BASE = "https://api.telegram.org";

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN environment variable");
  return token;
}

/**
 * Thrown when the user has blocked the bot, or deleted the chat.
 *
 * Distinct from a generic failure because it is permanent: every future send
 * to that chat fails the same way. The notifier uses it to take the channel
 * out of the fan-out rather than retrying forever.
 */
export class TelegramBlockedError extends Error {
  constructor(description: string) {
    super(`Telegram chat unreachable: ${description}`);
    this.name = "TelegramBlockedError";
  }
}

interface TelegramResponse {
  ok: boolean;
  result?: { message_id: number };
  description?: string;
  error_code?: number;
}

async function callTelegram(
  method: string,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(`${API_BASE}/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as TelegramResponse;

  if (!data.ok) {
    const description = data.description ?? "unknown error";

    // 403 covers "bot was blocked by the user", "user is deactivated" and
    // "chat not found" — all permanent from our side.
    if (data.error_code === 403 || /blocked|deactivated|chat not found/i.test(description)) {
      throw new TelegramBlockedError(description);
    }

    throw new Error(`Telegram ${method} failed: ${description}`);
  }

  return String(data.result?.message_id ?? "");
}

export async function sendTelegramMessage({
  to,
  body,
}: {
  to: string;
  body: string;
}): Promise<string> {
  return callTelegram("sendMessage", {
    chat_id: to,
    text: body,
    // The bot writes its own copy, so parsing is not needed and Markdown
    // would turn an unescaped underscore in a beneficiary name into a
    // formatting error that fails the whole send.
    disable_web_page_preview: true,
  });
}

export async function sendTelegramImage({
  to,
  imageUrl,
  caption,
}: {
  to: string;
  imageUrl: string;
  caption?: string;
}): Promise<string> {
  return callTelegram("sendPhoto", {
    chat_id: to,
    photo: imageUrl,
    ...(caption ? { caption } : {}),
  });
}

/**
 * Verify an inbound webhook.
 *
 * Telegram does not sign request bodies. Instead the secret token given at
 * setWebhook time is echoed back in this header on every delivery, so this is
 * the only thing separating a real update from anyone who guessed the URL.
 * Compared in constant time, and fails closed when unset, matching how the
 * Meta route treats its app secret.
 */
export function verifyTelegramSecret(headerValue: string | null): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) {
    console.error("[telegram] TELEGRAM_WEBHOOK_SECRET is not set — refusing");
    return false;
  }
  if (!headerValue) return false;

  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
