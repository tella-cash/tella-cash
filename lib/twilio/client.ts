import twilio from "twilio";

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