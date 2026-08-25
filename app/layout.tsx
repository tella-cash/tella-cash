import type { Metadata } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono, Newsreader } from "next/font/google";
import { MotionConfig } from "framer-motion";
import "@/app/globals.css";
import { SmoothScroll } from "@/components/interactive/smooth-scroll";

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

const title = "Tella - Stablecoin payments, by message";
const description =
  "A messaging-based payment interface. Send and manage USDC straight from WhatsApp or Telegram - no app to install, no menus to learn. Just write.";

export const metadata: Metadata = {
  metadataBase: process.env.APP_BASE_URL
    ? new URL(process.env.APP_BASE_URL)
    : undefined,
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    siteName: "tella",
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
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
        <meta name="facebook-domain-verification" content="nam5vl9755j1i63x1s6ziul42qp2p9" />
      </head>
      <body className="relative min-h-screen overflow-x-hidden">
        <MotionConfig reducedMotion="user">
          <SmoothScroll>
            {children}
          </SmoothScroll>
        </MotionConfig>
      </body>
    </html>
  );
}
