import { NextResponse, after } from "next/server";
import twilio from "twilio";
import { sendWhatsAppMessage } from "@/lib/twilio/client";
import { handleIncomingMessage } from "@/lib/agent/handler";
import { findOrCreateUser } from "@/lib/users/repository";
import { provisionWalletForUser } from "@/lib/wallet/provision";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
 * If the handler flags a wallet-provisioning side effect, fire it after the
 * primary reply is sent and follow up with a separate message containing
 * the address (or a failure note) once it resolves.
 */
async function processMessageAsync(
  fromNumber: string,
  userMessage: string,
  payload: TwilioWebhookPayload,
) {
  const { user, isNew } = await findOrCreateUser({
    whatsappNumber: fromNumber,
  });

  const { reply, sideEffect } = await handleIncomingMessage({
    user,
    text: userMessage,
    isNew,
  });

  await sendWhatsAppMessage({ to: fromNumber, body: reply });

  // Handle post-reply side effects. We send the primary reply first so the
  // user sees acknowledgement immediately, then deliver the wallet address
  // (or a failure note) as a follow-up message.
  if (sideEffect?.kind === "provision_wallet") {
    const success = await provisionWalletForUser(sideEffect.userId);

    if (success) {
      // Re-fetch the user so we have the freshly-saved wallet_address.
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("upay_users")
        .select("wallet_address")
        .eq("id", sideEffect.userId)
        .single();

      const address = (data as { wallet_address: string } | null)
        ?.wallet_address;
      if (address) {
        await sendWhatsAppMessage({
          to: fromNumber,
          body: [
            "✅ Your wallet is ready!",
            "",
            `Address: \`${address}\``,
            "",
            "Send USDC to this address on Arc to fund your account. Try \"what's my balance?\" once you have funds.",
          ].join("\n"),
        });
      }
    } else {
      await sendWhatsAppMessage({
        to: fromNumber,
        body: "I couldn't set up your wallet just now — I'll retry automatically. You can keep using UPay in the meantime.",
      });
    }
  }
}