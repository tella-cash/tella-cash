import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/sections/hero";
import { Reveal } from "@/components/interactive/reveal";
import { MaskReveal } from "@/components/interactive/mask-reveal";
import { FeatureSection } from "@/components/sections/feature-section";
import { SecuritySection } from "@/components/sections/security-section";
import { UseCasesSection } from "@/components/sections/use-cases-section";
import { FaqSection } from "@/components/sections/faq-section";
import { ClosingCta } from "@/components/sections/closing-cta";
import {
  SendIllustration,
  BalanceIllustration,
  ReceiveIllustration,
  ContextIllustration,
} from "@/components/illustrations/feature-illustrations";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />

        <div className="relative bg-[#E6EEFF] md:min-h-screen">
          {/* Sticky header — pins below the navbar while the feature cards stack underneath */}
          <div className="relative z-10 bg-[#E6EEFF] md:sticky md:top-[72px]">
            <div className="mx-auto max-w-[1440px] px-3 pb-6 pt-5 md:px-[72px] md:pt-10">
              <MaskReveal
                as="h2"
                text="How it works"
                className="max-w-[760px] text-[32px] md:text-[52px] lg:text-[60px] font-medium leading-[1.04] tracking-[-0.02em] text-black"
              />
              <Reveal delay={0.15}>
                <p className="mt-4 max-w-[680px] text-base leading-relaxed text-ink-700 md:text-xl">
                  From message to money in seconds. Send, receive, and track
                  stablecoins directly from WhatsApp using simple natural
                  language.
                </p>
              </Reveal>
            </div>
          </div>

          <FeatureSection
            id="features"
            index='1'
            heading='Send money like a message'
            description="Just type what you want to do. Tella understands, confirms, and moves your money no forms, no addresses."
            visual={<SendIllustration />}
          />

          <FeatureSection
            index='2'
            heading='Your balance, one message away'
            description="Ask for your balance in WhatsApp and get instant updates no apps, dashboards, or complicated interfaces."
            visual={<BalanceIllustration />}
            reverse
          />

          <FeatureSection
            index='3'
            heading='Payments that arrives like messages'
            description="Receive instant USDC payments directly in WhatsApp with sender details, transaction updates, and balance confirmations in one conversation."
            visual={<ReceiveIllustration />}
          />

          <FeatureSection
            index='4'
            heading='Talk naturally. Tella understands'
            description="Send money the way you naturally speak. Tella understands context, remembers past transactions, and confirms before anything moves."
            visual={<ContextIllustration />}
            reverse
          />
        </div>

        <SecuritySection />
        <UseCasesSection />
        <FaqSection />
        <ClosingCta />
      </main>
      <Footer />
    </>
  );
}
