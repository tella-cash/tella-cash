import type { tellaUser } from "@/lib/supabase/types";
import { sendWhatsAppMessage as sendViaTwilio } from "@/lib/twilio/client";
import { sendWhatsAppMessage as sendViaMeta } from "@/lib/meta/client";

/**
 * Send a plain-text WhatsApp notification to a user from outside the
 * inbound webhook flow (payment-received, send receipts) — routes through
 * whichever provider the user last messaged tella on, since Twilio and
 * Meta are separate numbers/APIs and a user is only reachable on one.
 */
export async function notifyUser({
  user,
  body,
}: {
  user: tellaUser;
  body: string;
}): Promise<string> {
  const send = user.whatsapp_channel === "meta" ? sendViaMeta : sendViaTwilio;
  return send({ to: user.whatsapp_number, body });
}
