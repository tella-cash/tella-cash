import type { ReactNode } from "react";
import { Reveal } from "@/components/interactive/reveal";
import { cn } from "@/lib/utils/cn";

interface FeatureSectionProps {
  id?: string;
  index:string;
  heading: ReactNode;
  description: string;
  visual: ReactNode;
  reverse?: boolean;
  toneClassName?: string;
}

export function FeatureSection({
  id,
  index,
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
        "sticky -top-[var(--feature-stick-top)] overflow-hidden bg-surface-50 min-h-[calc(100vh-var(--feature-stick-top))] h-full",
        toneClassName,
      )}
    >
      <div className="mx-auto grid h-full max-w-7xl items-center gap-8 lg:gap-20 px-6 lg:grid-cols-2 lg:gap-24">
        <Reveal
          from={reverse ? "right" : "left"}
          className={cn("max-w-xl", reverse && "lg:order-2 lg:ml-auto")}
        >
          <div className="flex gap-2 items-center mt-4">
            <span className="text-white bg-[#0057FF] w-[39px] h-[30px] rounded-full text-center">{index}</span>
            <h2 className="text-[16px] lg:text-[20px] font-normal leading-[1.02] tracking-[-0.03em] text-[#00256B]">
              {heading}
            </h2>
          </div>

          <p className="mt-6 text-[13px] lg:text-[16px] leading-relaxed text-ink-500">
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
