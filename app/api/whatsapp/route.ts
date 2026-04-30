import { NextResponse, after } from "next/server";
import twilio from "twilio";
import { sendWhatsAppMessage } from "@/lib/twilio/client";
import { handleIncomingMessage } from "@/lib/agent/handler";
import { findOrCreateUser } from "@/lib/users/repository";

interface TwilioWebhookPayload {
  From: string;
  To: string;
  Body: string;
  MessageSid: string;
  NumMedia: string;
  ProfileName?: string;
}

export async function POST(request: Request) {
  const signature = request.headers.get("x-twilio-signature") ?? "";
  const url = process.env.TWILIO_WEBHOOK_URL!;
  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN!,
    signature,
    url,
    params,
  );

  if (!isValid && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const payload = params as unknown as TwilioWebhookPayload;
  const fromNumber = payload.From;
  const userMessage = payload.Body ?? "";

  console.log("[whatsapp] incoming", {
    sid: payload.MessageSid,
    from: fromNumber,
    profile: payload.ProfileName,
    preview: userMessage.slice(0, 80),
  });

  // Defer processing until after the response is sent. On Vercel, `after()`
  // keeps the function alive past the response so async work doesn't get
  // frozen mid-flight.
  after(async () => {
    try {
      await processMessageAsync(fromNumber, userMessage, payload);
    } catch (err) {
      console.error("[whatsapp] processing error", err);
    }
  });

  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    { status: 200, headers: { "Content-Type": "text/xml" } },
  );
}

/**
 * Run the agent and send the reply back through Twilio's REST API.
 *
 * Kept separate from the request handler so the webhook can ack with 200
 * immediately. Failures here are logged but don't surface to Twilio —
 * Twilio just sees the empty TwiML response we already returned.
 */
async function processMessageAsync(
  fromNumber: string,
  userMessage: string,
  payload: TwilioWebhookPayload,
) {
  // 1. Look up or create the user. New rows start in 'awaiting_name' state.
  const { user, isNew } = await findOrCreateUser({
    whatsappNumber: fromNumber,
  });

  // 2. Generate a reply based on user state and message content.
  const reply = await handleIncomingMessage({
    user,
    text: userMessage,
    isNew,
  });

  // 3. Send the reply back to the user via Twilio.
  await sendWhatsAppMessage({
    to: fromNumber,
    body: reply,
  });
}