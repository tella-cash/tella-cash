import { timingSafeEqual } from "node:crypto";
import { encodeChoiceData, type Choice } from "@/lib/agent/menus";

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

/**
 * Translate the app's neutral emphasis markup into something Telegram draws.
 *
 * The core composes one string for every channel and marks emphasis the
 * WhatsApp way, with *asterisks*. Meta and Twilio render that natively;
 * Telegram shows the asterisks literally unless told otherwise.
 *
 * HTML rather than MarkdownV2, deliberately. MarkdownV2 requires escaping
 * eighteen characters, several of which appear in ordinary beneficiary
 * names and wallet addresses, and a single missed one fails the entire
 * send with a 400. HTML needs three, and they are escaped first so that a
 * name containing "&" or "<" cannot break the message — which is exactly
 * the class of bug the original "no parse_mode at all" comment was avoiding.
 */
export function toTelegramHtml(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*([^*\n]+)\*/g, "<b>$1</b>");
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
    text: toTelegramHtml(body),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

/**
 * Tap-to-choose options, as an inline keyboard.
 *
 * Inline rather than a reply keyboard on purpose: a reply keyboard replaces
 * the user's compose bar until dismissed, which is an intrusive thing to do
 * to someone who might want to type "send 5 to chidi" next.
 *
 * The tap arrives back as a callback_query carrying `id`, and the route
 * resolves it to the choice's title before handing it to the core — so by
 * the time anything downstream sees it, a tap is indistinguishable from the
 * user having typed the button's label. That is the contract in
 * lib/agent/menus.ts, honoured here.
 */
export async function sendTelegramChoices({
  to,
  body,
  choices,
}: {
  to: string;
  body: string;
  choices: Choice[];
}): Promise<string | null> {
  // Null rather than a truncated button. callback_data is capped at 64 bytes,
  // and a beneficiary name clipped to fit comes back as a title that matches
  // no saved recipient — on this flow, that is a send aimed at nobody. The
  // renderer degrades the whole set to text, which still works: the titles
  // arrive as a line the user can type back.
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (const c of choices) {
    const data = encodeChoiceData(c);
    if (data === null) {
      console.warn("[telegram] choice set not drawable as buttons", { title: c.title });
      return null;
    }
    // One per row: these are sentences, not icons, and Telegram truncates
    // side-by-side buttons hard on narrow screens.
    rows.push([{ text: c.title, callback_data: data }]);
  }

  return callTelegram("sendMessage", {
    chat_id: to,
    text: toTelegramHtml(body),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: rows },
  });
}

/** A single tap-to-open URL button. */
export async function sendTelegramLink({
  to,
  body,
  label,
  url,
}: {
  to: string;
  body: string;
  label: string;
  url: string;
}): Promise<string> {
  return callTelegram("sendMessage", {
    chat_id: to,
    text: toTelegramHtml(body),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: label, url }]] },
  });
}

/**
 * Acknowledge a tapped inline button.
 *
 * Not optional politeness: Telegram spins a loading indicator on the button
 * until this is called, and leaves it spinning for a while if it never is.
 * A tap that is never acknowledged is the single most confusing failure this
 * channel can produce — the button looks like it is working, for about half
 * a minute, and then simply stops. Nothing appears in the chat to say why.
 *
 * `text` renders as a transient toast over the chat. It is for the case where
 * there is no chat message to send: an update we cannot route has no user
 * turn to reply to, and a toast says something happened without pretending
 * to have understood what the button meant.
 */
export async function answerTelegramCallback(
  callbackId: string,
  text?: string,
): Promise<void> {
  try {
    await callTelegram("answerCallbackQuery", {
      callback_query_id: callbackId,
      ...(text ? { text } : {}),
    });
  } catch (err) {
    // The tap has already been recorded; failing to clear the spinner is
    // cosmetic and must not abort handling the message it produced.
    console.error("[telegram] answerCallbackQuery failed", err);
  }
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
    ...(caption ? { caption: toTelegramHtml(caption), parse_mode: "HTML" } : {}),
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
