import type { ReactNode } from "react";
import { Reveal } from "@/components/interactive/reveal";
import { cn } from "@/lib/utils/cn";

interface FeatureSectionProps {
  id?: string;
  /** Section index, used for the small numeric tag (01, 02, etc.). */
  index: string;
  eyebrow: string;
  /** Headline accepts ReactNode so callers can mix italics/highlights. */
  heading: ReactNode;
  description: string;
  visual: ReactNode;
  reverse?: boolean;
  toneClassName?: string;
}

/**
 * FeatureSection
 *
 * Two-column section template for product features. The numeric tag
 * (01 / 02 / 03 …) sits above the eyebrow as a small editorial flourish —
 * a Mercury-style detail that signals "this is one of a series" without
 * needing visible navigation.
 *
 * Reveal animations stagger between the text and visual columns by 0.15s
 * so the eye lands on the heading first, then the supporting visual.
 */
export function FeatureSection({
  id,
  index,
  eyebrow,
  heading,
  description,
  visual,
  reverse = false,
  toneClassName,
}: FeatureSectionProps) {
  return (
    <section id={id} className={cn("relative py-32 lg:py-40", toneClassName)}>
      <div className="mx-auto grid max-w-7xl items-center gap-20 px-6 lg:grid-cols-2 lg:gap-24">
        <Reveal
          from={reverse ? "right" : "left"}
          className={cn("max-w-xl", reverse && "lg:order-2 lg:ml-auto")}
        >
          <div className="flex items-center gap-4 text-xs font-mono text-ink-400">
            <span>{index}</span>
            <span className="h-px w-8 bg-ink-300" />
            <span className="uppercase tracking-[0.2em]">{eyebrow}</span>
          </div>

          <h2 className="mt-8 text-[clamp(2.25rem,4.5vw,4rem)] font-normal leading-[1.02] tracking-[-0.03em] text-ink-900">
            {heading}
          </h2>

          <p className="mt-6 text-lg leading-relaxed text-ink-500">
            {description}
          </p>
        </Reveal>

        <Reveal
          from={reverse ? "left" : "right"}
          delay={0.15}
          className={cn("relative", reverse && "lg:order-1")}
        >
          {visual}
        </Reveal>
      </div>
    </section>
  );
}
