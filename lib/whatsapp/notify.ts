import type { tellaUser } from "@/lib/supabase/types";
import {
  sendWhatsAppMessage as sendViaTwilio,
  sendWhatsAppImage as sendImageViaTwilio,
} from "@/lib/twilio/client";
import {
  sendWhatsAppMessage as sendViaMeta,
  sendWhatsAppImage as sendImageViaMeta,
} from "@/lib/meta/client";

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

/**
 * Send a WhatsApp image notification (e.g. a rendered "money received" card)
 * from outside the inbound webhook flow. Same provider-routing rule as
 * `notifyUser` — Twilio and Meta are separate numbers/APIs, a user is only
 * reachable on whichever one they last messaged tella on.
 */
export async function notifyUserWithImage({
  user,
  imageUrl,
  caption,
}: {
  user: tellaUser;
  imageUrl: string;
  caption?: string;
}): Promise<string> {
  const send =
    user.whatsapp_channel === "meta" ? sendImageViaMeta : sendImageViaTwilio;
  return send({ to: user.whatsapp_number, imageUrl, caption });
}
