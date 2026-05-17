import type { ReactNode } from "react";
import { Reveal } from "@/components/interactive/reveal";
import { cn } from "@/lib/utils/cn";

interface FeatureSectionProps {
  id?: string;
  heading: ReactNode;
  description: string;
  visual: ReactNode;
  reverse?: boolean;
  toneClassName?: string;
}

export function FeatureSection({
  id,
  heading,
  description,
  visual,
  reverse = false,
  toneClassName,
}: FeatureSectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "sticky top-[var(--feature-stick-top)] overflow-hidden bg-surface-50 min-h-[calc(100vh-var(--feature-stick-top))] lg:h-[calc(100vh-var(--feature-stick-top))]",
        toneClassName,
      )}
    >
      <div className="mx-auto grid h-full max-w-7xl items-center gap-20 px-6 lg:grid-cols-2 lg:gap-24">
        <Reveal
          from={reverse ? "right" : "left"}
          className={cn("max-w-xl", reverse && "lg:order-2 lg:ml-auto")}
        >
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
