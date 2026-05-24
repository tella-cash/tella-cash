import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/sections/hero";
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

        <div
          className="relative"
          style={{ ["--feature-stick-top" as string]: "220px" }}
        >
          {/* Sticky header — pins below the navbar while the feature cards stack underneath */}
          <div className="sticky top-[45px] z-10 bg-[#E6EEFF]">
            <div className="px-[10px] sm:px-[72px] pt-10 pb-[24px]">
              <h2 className="text-[36px] font-medium text-ink-900">
                Built for daily use.
              </h2>
              <p className="mt-2 text-base text-ink-500">
                Four small moments that make Tella feel like part of the conversation.
              </p>
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
