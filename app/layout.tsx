import type { Metadata } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import "@/app/globals.css";

/**
 * Display font — used for headings and large numerics. Variable axis lets
 * us pull thin elegance for big hero text without loading multiple weights.
 */
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

/**
 * Body font — humanist sans with friendlier counters than Inter, which
 * suits a consumer fintech voice better than something more corporate.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pago — Your AI Money Companion on WhatsApp",
  description:
    "Move money, settle bills, and understand your spending with a quick chat. Pago is a personal financial assistant that lives in WhatsApp.",
};

/**
 * RootLayout
 *
 * App Router root. Owns the html/body shell, font variables, and global CSS.
 * Keep this file lean — it should not import section-level components.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${bricolage.variable} ${jakarta.variable}`}>
      <body className="relative min-h-screen overflow-x-hidden">{children}</body>
    </html>
  );
}
