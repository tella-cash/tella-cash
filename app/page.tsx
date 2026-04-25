import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/sections/hero";
import { FeatureSection } from "@/components/sections/feature-section";
import { SecuritySection } from "@/components/sections/security-section";
import { EverydayUsageSection } from "@/components/sections/everyday-usage-section";
import { FaqSection } from "@/components/sections/faq-section";
import { InstantBlockSection } from "@/components/sections/instant-block-section";
import {
  TransferIllustration,
  SpendingIllustration,
  SupportIllustration,
  ContextIllustration,
} from "@/components/illustrations/phone-illustrations";

/**
 * HomePage
 *
 * Top-level landing route. Composes every section in display order. The
 * feature trio (Transfer / Spending / Support / Context) reuses
 * `FeatureSection` so layout, typography, and CTA placement stay locked.
 *
 * Section IDs:
 *   - #use-cases  → EverydayUsageSection
 *   - #features   → first FeatureSection (Transfer)
 *   - #security   → SecuritySection
 *   - #faqs       → FaqSection
 *
 * These match the in-page nav links defined in `lib/data/site.ts`.
 */
export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />

        <FeatureSection
          id="features"
          eyebrow="Offramp"
          heading={
            <>
              USDC to Naira, <em className="not-italic text-pago-700">stress-free.</em>
            </>
          }
          description="Tell UPAY how much USDC you want to sell. It quotes the live rate, you confirm, and your Nigerian bank account is credited in seconds — receipt included, all inside the chat."
          visual={<TransferIllustration />}
        />

        <FeatureSection
          eyebrow="Live Rates"
          heading={
            <>
              Always the rate{" "}
              <em className="not-italic text-pago-700">you deserve.</em>
            </>
          }
          description={`Check the going rate any time — "what's the rate?" — and UPAY quotes you the live market price with our competitive spread. The number you see is the number you get.`}
          visual={<SpendingIllustration />}
          reverse
          toneClassName="bg-cream-100/60"
        />

        <FeatureSection
          eyebrow="Settlement"
          heading={
            <>
              Near-zero.{" "}
              <em className="not-italic text-pago-700">Every time.</em>
            </>
          }
          description="UPAY settles on ARC — a blockchain purpose-built for near-zero second finality. Your Naira does not queue. Most offramps complete before you put your phone down."
          visual={<SupportIllustration />}
        />

        <FeatureSection
          eyebrow="Seamless Repeat"
          heading={
            <>
              Set your bank once,{" "}
              <em className="not-italic text-pago-700">offramp forever.</em>
            </>
          }
          description={`UPAY remembers your bank account so repeat offramps are a single message away. "sell 200 USDC" — same bank, live rate, instant settlement. Done.`}
          visual={<ContextIllustration />}
          reverse
          toneClassName="bg-cream-100/60"
        />

        <SecuritySection />
        <EverydayUsageSection />
        <FaqSection />
        <InstantBlockSection />
      </main>
      <Footer />
    </>
  );
}
