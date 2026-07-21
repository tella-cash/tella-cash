import { buildConfirmUrl } from "@/lib/confirm/url";

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
 * Quick-reply buttons (max 3): the fast triage menu.
 *
 * Titles/ids mirror the Twilio `twilio/quick-reply` template
 * (see create-content-templates.ts) so a tap routes through the same
 * intent classifier as typed text.
 */
export async function sendWhatsAppButtons({
  to,
  body,
}: SendWhatsAppMessageArgs): Promise<string> {
  return postToGraph(
    normalizeRecipient(to),
    {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: [
            { type: "reply", reply: { id: "balance", title: "Balance" } },
            { type: "reply", reply: { id: "address", title: "My address" } },
            { type: "reply", reply: { id: "send", title: "Send" } },
          ],
        },
      },
    },
    "buttons",
  );
}

/**
 * List picker: the fuller menu with more options + descriptions. Mirrors
 * the Twilio `twilio/list-picker` template.
 */
export async function sendWhatsAppList({
  to,
  body,
}: SendWhatsAppMessageArgs): Promise<string> {
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
              rows: [
                { id: "balance", title: "Balance", description: "Check your USDC balance" },
                { id: "address", title: "My address", description: "Get your wallet address" },
                { id: "send", title: "Send USDC", description: "Send to a number, address, or saved name" },
                { id: "history", title: "History", description: "See your recent transactions" },
                { id: "how", title: "How it works", description: "Learn how tella works" },
                { id: "safe", title: "Is it safe?", description: "How your money is protected" },
              ],
            },
          ],
        },
      },
    },
    "list",
  );
}

/**
 * Send a confirm-send message with a tap-to-open "Confirm send" URL button,
 * via Meta's `cta_url` interactive type. Mirrors Twilio's confirm CTA
 * template — same destination (the /confirm/{token} page), one tap away.
 */
export async function sendWhatsAppConfirm({
  to,
  body,
  token,
}: SendWhatsAppMessageArgs & { token: string }): Promise<string> {
  return postToGraph(
    normalizeRecipient(to),
    {
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: body },
        action: {
          name: "cta_url",
          parameters: {
            display_text: "Confirm send",
            url: buildConfirmUrl(token),
          },
        },
      },
    },
    "confirm cta",
  );
}
