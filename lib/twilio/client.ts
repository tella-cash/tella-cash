import twilio from "twilio";
import { buildConfirmUrl } from "@/lib/confirm/url";

let _client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (_client) return _client;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error(
      "Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN environment variables",
    );
  }
  _client = twilio(sid, token);
  return _client;
}

interface SendWhatsAppMessageArgs {
  to: string;
  body: string;
}

export async function sendWhatsAppMessage({
  to,
  body,
}: SendWhatsAppMessageArgs): Promise<string> {
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) {
    throw new Error("Missing TWILIO_WHATSAPP_FROM environment variable");
  }

  const message = await getClient().messages.create({ from, to, body });
  console.log("[twilio] sent", { sid: message.sid, to });
  return message.sid;
}

/**
 * Send an interactive message backed by a pre-created Content Template.
 *
 * WhatsApp interactive messages (quick-reply buttons, list picker) can't be
 * built inline — they're sent by referencing a Content Template SID, with
 * the body text passed as variable {{1}}. We create those templates once via
 * `create-content-templates.ts` and store their SIDs in env.
 *
 * Both menus carry classifier-friendly button/row titles (e.g. "Balance"),
 * so when a user taps one, the inbound message body routes through the same
 * sendam-ai /decode call as typed text — no separate payload handling needed.
 *
 * If the template SID isn't configured yet, we fall back to a plain-text
 * message so the agent keeps working before the templates are provisioned.
 */
async function sendContentTemplate(
  to: string,
  body: string,
  contentSid: string | undefined,
  label: string,
): Promise<string> {
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) {
    throw new Error("Missing TWILIO_WHATSAPP_FROM environment variable");
  }

  if (!contentSid) {
    // Not provisioned — degrade gracefully to text.
    return sendWhatsAppMessage({ to, body });
  }

  const message = await getClient().messages.create({
    from,
    to,
    contentSid,
    contentVariables: JSON.stringify({ "1": body }),
  });
  console.log(`[twilio] sent ${label}`, { sid: message.sid, to });
  return message.sid;
}

/** Quick-reply buttons (max 3): the fast triage menu. */
export function sendWhatsAppButtons({
  to,
  body,
}: SendWhatsAppMessageArgs): Promise<string> {
  return sendContentTemplate(
    to,
    body,
    process.env.TWILIO_MENU_CONTENT_SID,
    "buttons",
  );
}

/** List picker: the fuller menu with more options + descriptions. */
export function sendWhatsAppList({
  to,
  body,
}: SendWhatsAppMessageArgs): Promise<string> {
  return sendContentTemplate(
    to,
    body,
    process.env.TWILIO_LIST_CONTENT_SID,
    "list",
  );
}

/**
 * Send a confirm-send message with a tap-to-open "Confirm send" URL button
 * (WhatsApp call-to-action), so the user lands on the confirm page in one
 * tap instead of fishing a raw link out of the text.
 *
 * The CTA template bakes in the base URL and takes the token as a variable:
 *   body  → {{1}}
 *   url   → <APP_BASE_URL>/confirm/{{2}}
 *
 * If TWILIO_CONFIRM_CONTENT_SID isn't provisioned yet, fall back to a plain
 * text message with the full link appended — same destination, less polish.
 */
export async function sendWhatsAppConfirm({
  to,
  body,
  token,
}: SendWhatsAppMessageArgs & { token: string }): Promise<string> {
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) {
    throw new Error("Missing TWILIO_WHATSAPP_FROM environment variable");
  }

  const contentSid = process.env.TWILIO_CONFIRM_CONTENT_SID;
  if (!contentSid) {
    return sendWhatsAppMessage({
      to,
      body: `${body}\n\n${buildConfirmUrl(token)}`,
    });
  }

  const message = await getClient().messages.create({
    from,
    to,
    contentSid,
    contentVariables: JSON.stringify({ "1": body, "2": token }),
  });
  console.log("[twilio] sent confirm cta", { sid: message.sid, to });
  return message.sid;
}