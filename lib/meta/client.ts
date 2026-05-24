const GRAPH_API_VERSION = "v21.0";

interface SendWhatsAppMessageArgs {
  to: string;
  body: string;
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
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error(
      "Missing META_WHATSAPP_ACCESS_TOKEN or META_WHATSAPP_PHONE_NUMBER_ID",
    );
  }

  const recipient = to.replace(/^whatsapp:/, "").replace(/^\+/, "");

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
        type: "text",
        text: { body },
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
  console.log("[meta] sent", { id, to: recipient });
  return id;
}
