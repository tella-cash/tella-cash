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
          eyebrow="Transfer"
          heading={
            <>
              Send money, <em className="not-italic text-pago-700">stress-free.</em>
            </>
          }
          description="Move funds to a friend, a vendor, or your own savings account in a single message. Pago resolves the recipient, validates the bank, and shows you a receipt — all inside the chat."
          visual={<TransferIllustration />}
        />

        <FeatureSection
          eyebrow="Spending Analysis"
          heading={
            <>
              Know where{" "}
              <em className="not-italic text-pago-700">your money</em> goes.
            </>
          }
          description={`Ask casually — "how much on transport this month?" — and Pago breaks it down. No spreadsheets, no budgeting apps, no setup.`}
          visual={<SpendingIllustration />}
          reverse
          toneClassName="bg-cream-100/60"
        />

        <FeatureSection
          eyebrow="Self Support"
          heading={
            <>
              Help, without{" "}
              <em className="not-italic text-pago-700">the wait.</em>
            </>
          }
          description="No call centers, no hold music. Pago answers questions instantly, walks you through fixes, and only escalates to a human when it actually needs to."
          visual={<SupportIllustration />}
        />

        <FeatureSection
          eyebrow="Context Aware"
          heading={
            <>
              It remembers, so{" "}
              <em className="not-italic text-pago-700">you don't have to.</em>
            </>
          }
          description={`Pago keeps thread of who you've paid, when, and for what. Reference earlier conversations naturally — "send him the same as last week" — and it just works.`}
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
