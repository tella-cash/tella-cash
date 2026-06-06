export const SITE = {
  brandName: "tella",
  legalName: "BELIEF INTEGRATED GLOBAL",
  whatsappLink:
    "https://wa.me/14155238886?text=" + encodeURIComponent("join oil-needs"),
  twitterUrl: "https://x.com/",
  facebookUrl: "#",
  termsUrl: "/terms",
  privacyUrl: "/privacy",
  dataDeletionUrl: "/data-deletion",
} as const;

export const NAV_LINKS = [
  { label: "Use Cases", href: "#use-cases" },
  { label: "Features", href: "#features" },
  { label: "Security", href: "#security" },
  { label: "FAQ", href: "#faqs" },
] as const;
