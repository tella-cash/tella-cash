"use client";

import type { ReactNode } from "react";
import { motion, useInView, type Variants } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { EASE } from "@/lib/animation/variants";
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
  const cardRef = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(cardRef, { once: true, amount: 0.4 });
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(query.matches);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // A single observer on the card drives all three children via Framer's
  // variant propagation — nesting a separate useInView per child proved
  // unreliable once the parent itself was an animating motion component.
  //
  // `initial`/`animate` are kept as constant strings across every render —
  // toggling `animate` between `undefined` and a value (e.g. gating on
  // `isDesktop`) can leave Framer's animation controls never properly
  // wired up. Instead the mobile "disabled" case is expressed by making the
  // hidden variant equal the visible one, so there's nothing to animate.
  const cardVariants: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
  };
  const visualVariants: Variants = {
    hidden: isDesktop
      ? { opacity: 0, x: reverse ? 72 : -72, scale: 0.95 }
      : { opacity: 1, x: 0, scale: 1 },
    visible: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.7, ease: EASE } },
  };
  const textVariants: Variants = {
    hidden: isDesktop ? { opacity: 0, x: reverse ? -24 : 24 } : { opacity: 1, x: 0 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.7, ease: EASE } },
  };

  const animateState = !isDesktop || isInView ? "visible" : "hidden";

  return (
    // Extra height gives the pinned card room to breathe before the next
    // card's opaque background scrolls up to cover it.
    <div className="relative md:h-[160vh]">
      <section
        id={id}
        className={cn(
          "relative flex items-center overflow-visible bg-[#E6EEFF] px-3 pb-6 md:sticky md:top-0 md:h-screen md:min-h-screen md:overflow-hidden md:px-[72px] md:py-10",
          toneClassName,
        )}
      >
        <motion.div
          ref={cardRef}
          initial="hidden"
          animate={animateState}
          variants={cardVariants}
          className="mx-auto w-full max-w-[1296px] origin-top rounded-[19px] bg-white p-3 md:p-4"
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <motion.div
              variants={visualVariants}
              className="relative order-2 flex min-h-[614px] items-center justify-center overflow-hidden rounded-[24px] bg-[#F5F5F5] px-4 py-5 md:order-1 md:min-h-[420px] md:py-8 lg:min-h-[614px] lg:px-6"
            >
              {visual}
            </motion.div>

            <motion.div
              variants={textVariants}
              className="order-1 flex flex-col items-start md:order-2"
            >
              <div className="w-full border-b border-[#D2D2D2] py-5 md:py-6">
                <div className="flex w-full items-center gap-3 md:gap-4">
                  <span className="flex min-h-[34px] min-w-[44px] items-center justify-center rounded-full bg-[#0057FF] px-4 py-1.5 text-sm leading-5 text-white md:text-base">
                    {index}
                  </span>
                  <h3 className="min-w-0 flex-1 text-xl font-medium leading-7 tracking-[-0.01em] text-[#00256B] md:text-2xl md:leading-9 lg:text-[30px] lg:leading-[1.15]">
                    {heading}
                  </h3>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-ink-700 md:text-lg">
                  {description}
                </p>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
