import twilio from "twilio";
import { buildConfirmUrl } from "@/lib/confirm/url";
import { QUICK_CHOICES, MENU_CHOICES, type Choice } from "@/lib/agent/menus";

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

interface SendWhatsAppImageArgs {
  to: string;
  imageUrl: string;
  caption?: string;
}

export async function sendWhatsAppImage({
  to,
  imageUrl,
  caption,
}: SendWhatsAppImageArgs): Promise<string> {
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) {
    throw new Error("Missing TWILIO_WHATSAPP_FROM environment variable");
  }

  const message = await getClient().messages.create({
    from,
    to,
    mediaUrl: [imageUrl],
    ...(caption ? { body: caption } : {}),
  });
  console.log("[twilio] sent image", { sid: message.sid, to });
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

/**
 * Twilio can only draw the option sets it has Content Templates provisioned
 * for, and provisioning one is a manual step outside this repo. So this
 * returns null — "I cannot render this" — rather than pretending, and
 * lib/messaging/render.ts falls back to plain text with the options listed.
 *
 * That null is the honest shape of the constraint. Twilio serves 2 users
 * against Meta's 63, and the standing decision is that no new Content SIDs
 * get provisioned for it; a channel that cannot draw a widget should say so
 * once, here, rather than have every caller remember.
 */
export async function sendWhatsAppChoices({
  to,
  body,
  choices,
}: SendWhatsAppMessageArgs & { choices: Choice[] }): Promise<string | null> {
  const ids = choices.map((c) => c.id).join(",");

  const sid =
    ids === QUICK_CHOICES.map((c) => c.id).join(",")
      ? process.env.TWILIO_MENU_CONTENT_SID
      : ids === MENU_CHOICES.map((c) => c.id).join(",")
        ? process.env.TWILIO_LIST_CONTENT_SID
        : undefined;

  if (!sid) return null;

  return sendContentTemplate(to, body, sid, "choices");
}

/**
 * A tap-to-open URL button.
 *
 * The provisioned CTA template bakes APP_BASE_URL in and takes only the
 * confirm token as a variable, so it can address exactly one destination:
 *   body → {{1}},  url → <APP_BASE_URL>/confirm/{{2}}
 *
 * Anything else returns null and degrades to a plain message with the link
 * appended. Same destination, less polish, no lying about what the template
 * can point at.
 */
export async function sendWhatsAppLink({
  to,
  body,
  url,
}: SendWhatsAppMessageArgs & { label: string; url: string }): Promise<string | null> {
  const contentSid = process.env.TWILIO_CONFIRM_CONTENT_SID;
  if (!contentSid) return null;

  const token = confirmToken(url);
  if (!token) return null;

  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) {
    throw new Error("Missing TWILIO_WHATSAPP_FROM environment variable");
  }

  const message = await getClient().messages.create({
    from,
    to,
    contentSid,
    contentVariables: JSON.stringify({ "1": body, "2": token }),
  });
  console.log("[twilio] sent link cta", { sid: message.sid, to });
  return message.sid;
}

/** The token, if this URL is one the CTA template can actually address. */
function confirmToken(url: string): string | null {
  const prefix = buildConfirmUrl("");
  if (!url.startsWith(prefix)) return null;
  const token = url.slice(prefix.length);
  return token.length > 0 && !token.includes("/") ? token : null;
}
