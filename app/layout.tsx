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
  title: "UPAY — Offramp USDC to Naira on WhatsApp",
  description:
    "Convert USDC to Nigerian Naira and receive it in any bank account — all from a WhatsApp message. Powered by ARC. Near-zero second finality.",
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
