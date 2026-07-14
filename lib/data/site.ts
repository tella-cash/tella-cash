export const SITE = {
  brandName: "tella",
  legalName: "TELLA CORE LTD",
  whatsappLink:
    "https://wa.me/2349043580863?text=" + encodeURIComponent("Hi tella"),
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