import type { Choice } from "@/lib/agent/menus";

const GRAPH_API_VERSION = "v21.0";

interface SendWhatsAppMessageArgs {
  to: string;
  body: string;
}

function normalizeRecipient(to: string): string {
  return to.replace(/^whatsapp:/, "").replace(/^\+/, "");
}

async function postToGraph(
  recipient: string,
  message: Record<string, unknown>,
  label: string,
): Promise<string> {
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error(
      "Missing META_WHATSAPP_ACCESS_TOKEN or META_WHATSAPP_PHONE_NUMBER_ID",
    );
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipient,
        ...message,
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Meta send failed (${res.status}): ${errText}`);
  }

  const payload = (await res.json()) as {
    messages?: Array<{ id: string }>;
  };
  const id = payload.messages?.[0]?.id ?? "";
  console.log(`[meta] sent ${label}`, { id, to: recipient });
  return id;
}

/**
 * Sends a plain-text WhatsApp message through Meta's Graph API.
 *
 * `to` accepts either Twilio-style `whatsapp:+234...` or bare `+234.../234...`
 * — Meta wants bare E.164 digits, so we strip the prefix and the leading `+`.
 */
export async function sendWhatsAppMessage({
  to,
  body,
}: SendWhatsAppMessageArgs): Promise<string> {
  return postToGraph(
    normalizeRecipient(to),
    { type: "text", text: { body } },
    "text",
  );
}

interface SendWhatsAppImageArgs {
  to: string;
  imageUrl: string;
  caption?: string;
}

/**
 * Sends an image message via Meta's Graph API, referencing the image by a
 * publicly reachable HTTPS URL rather than uploading raw bytes — Meta fetches
 * it directly, same approach as Twilio's `mediaUrl`.
 */
export async function sendWhatsAppImage({
  to,
  imageUrl,
  caption,
}: SendWhatsAppImageArgs): Promise<string> {
  return postToGraph(
    normalizeRecipient(to),
    {
      type: "image",
      image: { link: imageUrl, ...(caption ? { caption } : {}) },
    },
    "image",
  );
}

/**
 * Quick-reply buttons: Meta's widget for a small option set.
 *
 * Capped at three by the Cloud API, which is why lib/messaging/render.ts
 * routes anything larger to the list picker instead. The titles come from
 * lib/agent/menus.ts, so a tap comes back as `title` and resolves through
 * the same tier-0 classifier as typed text — see fast-path.ts.
 */
/** Meta's caps on the text a tappable option may carry. */
const BUTTON_TITLE_MAX = 20;
const LIST_TITLE_MAX = 24;

export async function sendWhatsAppButtons({
  to,
  body,
  choices,
}: SendWhatsAppMessageArgs & { choices: Choice[] }): Promise<string | null> {
  // Meta rejects titles over 20 characters with a 400 that names no field, so
  // this used to truncate. That was safe while every title was written into
  // menus.ts and none came close to the cap — and stopped being safe the
  // moment the guided send flow started offering the user's own beneficiary
  // names, which isValidBeneficiaryLabel allows up to 30 characters.
  //
  // A truncated title is not a cosmetic loss here. Meta echoes back the title
  // it DREW, the core matches that against saved beneficiaries, and a clipped
  // name matches none of them — so the user taps a recipient and the bot says
  // it has never heard of them. Returning null instead degrades the whole set
  // to a line of plain text (lib/messaging/render.ts), where the full names
  // are readable and typing one back works.
  const tooLong = choices.slice(0, 3).find((c) => c.title.length > BUTTON_TITLE_MAX);
  if (tooLong) {
    console.warn("[meta] choice set not drawable as buttons", { title: tooLong.title });
    return null;
  }

  return postToGraph(
    normalizeRecipient(to),
    {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: choices.slice(0, 3).map((c) => ({
            type: "reply",
            reply: { id: c.id, title: c.title },
          })),
        },
      },
    },
    "buttons",
  );
}

/** List picker: the fuller menu, with descriptions. */
export async function sendWhatsAppList({
  to,
  body,
  choices,
}: SendWhatsAppMessageArgs & { choices: Choice[] }): Promise<string | null> {
  // Same rule as the buttons above, at the list widget's own cap. See there
  // for why a clipped title is a correctness problem and not a cosmetic one.
  const tooLong = choices.slice(0, 10).find((c) => c.title.length > LIST_TITLE_MAX);
  if (tooLong) {
    console.warn("[meta] choice set not drawable as a list", { title: tooLong.title });
    return null;
  }

  return postToGraph(
    normalizeRecipient(to),
    {
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: body },
        action: {
          button: "Menu",
          sections: [
            {
              title: "Options",
              rows: choices.slice(0, 10).map((c) => ({
                id: c.id,
                title: c.title,
                ...(c.description ? { description: c.description } : {}),
              })),
            },
          ],
        },
      },
    },
    "list",
  );
}

/**
 * A message with one tap-to-open URL button, via Meta's `cta_url` type.
 *
 * Generalised from the confirm-send special case it started as: the core no
 * longer names a token, it names a label and a URL, and this draws it.
 */
export async function sendWhatsAppLink({
  to,
  body,
  label,
  url,
}: SendWhatsAppMessageArgs & { label: string; url: string }): Promise<string> {
  return postToGraph(
    normalizeRecipient(to),
    {
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: body },
        action: {
          name: "cta_url",
          parameters: { display_text: label, url },
        },
      },
    },
    "link cta",
  );
}
