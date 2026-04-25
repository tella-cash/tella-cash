import type { ReactNode } from "react";
import { CtaButton } from "@/components/ui/cta-button";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { cn } from "@/lib/utils/cn";
import { SITE } from "@/lib/data/site";

interface FeatureSectionProps {
  /** Anchor id used for in-page nav (#features etc.). */
  id?: string;
  eyebrow: string;
  /** Headline supports rich text — pass a fragment with highlighted spans. */
  heading: ReactNode;
  description: string;
  /** The phone-mockup illustration column. */
  visual: ReactNode;
  /** Whether to flip the layout (visual on the left). */
  reverse?: boolean;
  /** Optional background tint override — defaults to plain cream. */
  toneClassName?: string;
}

/**
 * FeatureSection
 *
 * Reusable two-column feature section used by Transfer, Spending, Support,
 * and Context. Centralizing this layout means tweaks to gutter, vertical
 * rhythm, or eyebrow position propagate everywhere consistently.
 *
 * The `reverse` prop alternates the visual side without breaking source order
 * (text always renders first in DOM for accessibility), using grid order
 * utilities on large screens only.
 */
export function FeatureSection({
  id,
  eyebrow,
  heading,
  description,
  visual,
  reverse = false,
  toneClassName,
}: FeatureSectionProps) {
  return (
    <section
      id={id}
      className={cn("relative py-24 lg:py-32", toneClassName)}
    >
      <div className="mx-auto grid max-w-7xl items-center gap-16 px-6 lg:grid-cols-2 lg:gap-24">
        <div
          className={cn(
            "max-w-xl",
            reverse && "lg:order-2 lg:ml-auto",
          )}
        >
          <SectionEyebrow>{eyebrow}</SectionEyebrow>
          <h2 className="mt-4 font-display text-4xl font-medium leading-[1.05] tracking-tight text-ink-900 sm:text-5xl lg:text-[3.75rem]">
            {heading}
          </h2>
          <p className="mt-6 text-lg text-ink-700">{description}</p>
          <div className="mt-8">
            <CtaButton href={SITE.whatsappLink} target="_blank" rel="noopener">
              Try it out
            </CtaButton>
          </div>
        </div>

        <div className={cn("relative", reverse && "lg:order-1")}>{visual}</div>
      </div>
    </section>
  );
}
