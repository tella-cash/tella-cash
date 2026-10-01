import { SITE } from "@/lib/data/site";

/**
 * The wa.me link that sends tella a prefilled message, which is how a
 * WhatsApp number proves it is the one being linked. The mirror of
 * lib/telegram/deep-link.ts: the other app's link completes the handshake.
 */
export function whatsappMessageLink(text: string): string {
  return `https://wa.me/${SITE.whatsappNumber}?text=${encodeURIComponent(text)}`;
}
