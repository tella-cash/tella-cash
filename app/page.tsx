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
            heading={
              <>
                Type the amount.{" "}
                <span className="italic text-accent-500">Type the name.</span>{" "}
                That's the whole flow.
              </>
            }
            description="No recipient lookups, no copy-pasted addresses, no IBAN forms. Tell UPay what you want to do in plain English. It confirms before any money moves."
            visual={<SendIllustration />}
          />

          <FeatureSection
            heading={
              <>
                A balance you can{" "}
                <span className="italic text-accent-500">just ask for.</span>
              </>
            }
            description="Open WhatsApp. Type 'balance.' That's the whole product. No dashboards, no apps to install, no expired sessions."
            visual={<BalanceIllustration />}
            reverse
          />

          <FeatureSection
            heading={
              <>
                Money lands in your chat,{" "}
                <span className="italic text-accent-500">not a separate inbox.</span>
              </>
            }
            description="Incoming payments arrive as messages. New balance, sender's name, transaction reference — all there, in the same thread you already check."
            visual={<ReceiveIllustration />}
          />

          <FeatureSection
            heading={
              <>
                It remembers,{" "}
                <span className="italic text-accent-500">so you don't have to.</span>
              </>
            }
            description="Reference earlier conversations naturally. 'Send him the same as last week' resolves to the right person, the right amount, the right wallet."
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
