/**
 * Single source of truth for static site data — brand name, CTAs, nav.
 * Swap these values when reskinning for a real product.
 */

export const SITE = {
  brandName: "UPAY",
  /**
   * Replace this with your real WhatsApp Business link before shipping.
   * Format: https://wa.me/<number>?text=<urlEncodedMessage>
   */
  whatsappLink: "https://wa.me/0000000000?text=Hi%20UPAY",
  twitterUrl: "https://x.com/",
  facebookUrl: "#",
  termsUrl: "/terms",
  privacyUrl: "/privacy",
} as const;

export const NAV_LINKS = [
  { label: "Use Cases", href: "#use-cases" },
  { label: "Features", href: "#features" },
  { label: "Security", href: "#security" },
  { label: "Ambassadors", href: "/ambassadors" },
  { label: "FAQ", href: "#faqs" },
] as const;
