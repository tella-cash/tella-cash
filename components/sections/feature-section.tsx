"use client";

import type { ReactNode } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/interactive/reveal";
import { cn } from "@/lib/utils/cn";

interface FeatureSectionProps {
  id?: string;
  index: string;
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
  const ref = useRef<HTMLElement | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const cardX = useTransform(
    scrollYProgress,
    [0, 0.24, 0.72, 1],
    [-120, 0, 0, 160],
  );
  const cardScale = useTransform(
    scrollYProgress,
    [0, 0.24, 0.72, 1],
    [0.94, 1, 1, 0.86],
  );
  const cardOpacity = useTransform(
    scrollYProgress,
    [0, 0.18, 0.72, 1],
    [0, 1, 1, 0],
  );
  const cardBlur = useTransform(
    scrollYProgress,
    [0, 0.18, 0.78, 1],
    [6, 0, 0, 8],
  );
  const cardFilter = useTransform(cardBlur, (value) => `blur(${value}px)`);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(query.matches);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return (
    <section
      ref={ref}
      id={id}
      className={cn(
        "relative flex items-center overflow-visible bg-[#E6EEFF] px-3 pb-6 md:sticky md:top-0 md:h-screen md:min-h-screen md:overflow-hidden md:px-[72px] md:py-10",
        toneClassName,
      )}
    >
      <motion.div
        style={
          isDesktop
            ? {
                x: cardX,
                scale: cardScale,
                opacity: cardOpacity,
                filter: cardFilter,
              }
            : undefined
        }
        className="mx-auto w-full max-w-[1296px] origin-top rounded-[19px] bg-white p-3 md:p-4 md:will-change-transform"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Reveal
            disabled={!isDesktop}
            from={reverse ? "right" : "left"}
            className="relative order-2 flex min-h-[614px] items-center justify-center overflow-hidden rounded-[24px] bg-[#F5F5F5] px-4 py-5 md:order-1 md:min-h-[420px] md:py-8 lg:min-h-[614px] lg:px-6"
          >
            {visual}
          </Reveal>

          <Reveal
            disabled={!isDesktop}
            from={reverse ? "left" : "right"}
            delay={0.15}
            className="order-1 flex flex-col items-start md:order-2"
          >
            <div className="w-full border-b border-[#D2D2D2] py-4">
              <div className="flex w-full items-center gap-3">
                <span className="flex min-h-[30px] min-w-[39px] items-center justify-center rounded-full bg-[#0057FF] px-4 py-1.5 text-xs leading-[18px] text-white md:text-sm md:leading-5">
                  {index}
                </span>
                <h3 className="min-w-0 flex-1 text-base font-normal leading-6 text-[#00256B] md:text-xl md:font-medium md:leading-[30px]">
                  {heading}
                </h3>
              </div>

              <p className="mt-3 text-xs leading-[18px] text-black md:text-base md:leading-6">
                {description}
              </p>
            </div>
          </Reveal>
        </div>
      </motion.div>
    </section>
  );
}
