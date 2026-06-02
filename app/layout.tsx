import type { Metadata } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono, Newsreader } from "next/font/google";
import "@/app/globals.css";
import { SmoothScroll } from "@/components/interactive/smooth-scroll";
import { CustomCursor } from "@/components/interactive/custom-cursor";

/**
 * Inter — body text. Variable weight so we don't need to load multiple
 * weights as separate files. Modern, neutral, and trusted in fintech.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

/**
 * Instrument Serif — display headings only. Single weight, italic optional.
 * Pairs the serif's editorial weight with Inter's clean body text — a
 * combination Mercury, Stripe, and Linear have all leaned on.
 */
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

/**
 * JetBrains Mono — used sparingly for inline code, transaction references,
 * wallet addresses. Adds technical credibility where appropriate.
 */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// Newsreader — closest free match to Suisse Works.
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-works",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tella — USDC to Naira, by message",
  description:
    "Send USDC and receive Naira straight from a WhatsApp chat. No app to install, no menus to learn — just write.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} ${newsreader.variable}`}
    >
      <head>
        <meta
          name="facebook-domain-verification"
          content="a29vfcnfljyix4jzf8nj06d2ulnh8m"
        />
      </head>
      <body className="relative min-h-screen overflow-x-hidden">
        <SmoothScroll>
          <CustomCursor />
          {children}
        </SmoothScroll>
      </body>
    </html>
  );
}
