import { NextResponse } from "next/server";
import twilio from "twilio";
import { sendWhatsAppMessage } from "@/lib/twilio/client";
import { handleIncomingMessage } from "@/lib/agent/handler";

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

  // Fire-and-forget — do NOT await
  void processMessageAsync(fromNumber, userMessage, payload).catch((err) => {
    console.error("[whatsapp] processing error", err);
  });

  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    { status: 200, headers: { "Content-Type": "text/xml" } },
  );
}

async function processMessageAsync(
  fromNumber: string,
  userMessage: string,
  payload: TwilioWebhookPayload,
) {
  const reply = await handleIncomingMessage({
    fromNumber,
    text: userMessage,
    profileName: payload.ProfileName,
  });

  await sendWhatsAppMessage({ to: fromNumber, body: reply });
}