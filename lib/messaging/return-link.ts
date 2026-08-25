import type { tellaUser } from "@/lib/supabase/types";
import { PROVIDERS } from "./providers";
import type { MessageProvider } from "./processed-messages";

/**
 * Where to send someone back to when they finish on the web.
 *
 * A confirm link, a PIN reset and an unfreeze all end the same way: the user
 * is on a page, the job is done, and the receipt is waiting in a chat. The
 * question is WHICH chat, and until now every one of these pages answered
 * "WhatsApp" — built from `user.whatsapp_channel`, which records the last
 * WhatsApp provider seen and knows nothing about Telegram.
 *
 * That is a real dead end rather than a cosmetic one. Someone who started a
 * send in Telegram, tapped through to the confirm page and succeeded was
 * then pushed into WhatsApp: a different app, possibly holding no tella
 * conversation at all, and definitely not the one their receipt was about to
 * arrive in. The chat they were already in was one tap away and we sent them
 * somewhere else.
 *
 * So the originating channel is recorded when the link is minted — on
 * SendPayload.origin and on the security token's payload — and resolved
 * here. The fallback remains the user row, which is correct for every link
 * minted before this existed and for anything that genuinely has no origin.
 */

export interface ReturnTarget {
  /** Null when the channel has nothing configured to link back to. */
  url: string | null;
  /** "WhatsApp", "Telegram" — for the button and the redirect notice. */
  label: string;
}

export function returnTarget(
  user: tellaUser,
  origin: MessageProvider | null | undefined,
): ReturnTarget {
  // Guarded the same way, and for the same reason: `user.whatsapp_channel`
  // is a database column, and a lookup that can return Object.prototype is
  // a lookup that can throw on the next line.
  const id = origin ?? user.whatsapp_channel;
  const provider = Object.hasOwn(PROVIDERS, id) ? PROVIDERS[id] : PROVIDERS.meta;
  return { url: provider.returnUrl(), label: provider.label };
}

/**
 * Narrow an untrusted jsonb value to a provider id.
 *
 * Object.hasOwn, not `in`. `"constructor" in PROVIDERS` is true — `in` walks
 * the prototype chain — so the obvious version accepts "constructor",
 * "toString" and friends, hands back Object.prototype as if it were a
 * provider, and crashes the page on `.returnUrl()`. The value comes out of a
 * jsonb column, so it is exactly as trustworthy as whatever wrote it.
 */
export function asProvider(value: unknown): MessageProvider | null {
  return typeof value === "string" && Object.hasOwn(PROVIDERS, value)
    ? (value as MessageProvider)
    : null;
}
