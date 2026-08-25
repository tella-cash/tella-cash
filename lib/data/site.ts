/**
 * ⚠️ ACTION REQUIRED before real customers.
 *
 * `privacyEmail` and `legalEmail` are placeholders. They are rendered as
 * live mailto: links in the privacy policy, terms, and data-deletion page —
 * the addresses a user is told to write to in order to exercise their data
 * rights. An @example.com address there is not a cosmetic gap: NDPR and GDPR
 * both require a working contact route, and right now every such request
 * goes nowhere.
 *
 * They were hardcoded in four separate files; they live here so replacing
 * them is one edit rather than a search.
 */
const PLACEHOLDER_EMAIL = "privacy@example.com";

// The bot username also drives the server-side Telegram deep link in
// lib/agent/handler.ts (TELEGRAM_BOT_USERNAME), but that var isn't visible
// to client components — anything read here needs the NEXT_PUBLIC_ prefix
// to make it into the browser bundle. Until it's set, telegramLink is null
// and callers skip rendering the Telegram CTA rather than link to nothing.
const TELEGRAM_BOT_USERNAME = (
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? ""
).replace(/^@/, "");

export const SITE = {
  brandName: "tella",
  legalName: "TELLA CORE LTD",
  whatsappNumber: "2349043580863",
  whatsappLink:
    "https://wa.me/2349043580863?text=" + encodeURIComponent("Hi tella"),
  telegramLink: TELEGRAM_BOT_USERNAME
    ? `https://t.me/${TELEGRAM_BOT_USERNAME}`
    : (null as string | null),

  // TODO: replace with the real inbox before launch.
  privacyEmail: PLACEHOLDER_EMAIL,
  legalEmail: "legal@example.com",

  // Social links are omitted rather than pointed at dead URLs. twitterUrl
  // was "https://x.com/" — the bare site, rendered in the footer as though
  // it were a profile — and facebookUrl was "#". A link that goes nowhere
  // reads as an abandoned product. Set these to real profiles to bring the
  // icons back; the footer skips whichever is null.
  twitterUrl: null as string | null,
  facebookUrl: null as string | null,

  termsUrl: "/terms",
  privacyUrl: "/privacy",
  dataDeletionUrl: "/data-deletion",
} as const;

/** True while the contact addresses are still placeholders. */
export const HAS_PLACEHOLDER_CONTACT =
  SITE.privacyEmail.endsWith("@example.com") ||
  SITE.legalEmail.endsWith("@example.com");

export const NAV_LINKS = [
  { label: "Use Cases", href: "#use-cases" },
  { label: "Features", href: "#features" },
  { label: "Security", href: "#security" },
  { label: "FAQ", href: "#faqs" },
] as const;