import { SITE } from "@/lib/data/site";

/**
 * The wa.me link that sends tella a prefilled message, which is how a
 * WhatsApp number proves it is the one being linked. The mirror of
 * lib/telegram/deep-link.ts: the other app's link completes the handshake.
 */
/**
 * What a new Telegram chat's "yes, I have a WhatsApp account" button sends
 * from the existing WhatsApp account. The ordinary "link telegram" request, so
 * it meets the same gates (a factor first, then the PIN on the web).
 */
export const LINK_TELEGRAM_TEXT = "link telegram";

export function whatsappMessageLink(text: string): string {
  return `https://wa.me/${SITE.whatsappNumber}?text=${encodeURIComponent(text)}`;
}
