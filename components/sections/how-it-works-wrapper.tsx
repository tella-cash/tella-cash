"use client";

import type { ReactNode } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

/**
 * Wraps the "How it works" section group so its `#E6EEFF` tint eases in as
 * the hero scrolls away, instead of snapping on at a hard boundary.
 */
export function HowItWorksWrapper({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "start start"],
  });
  const backgroundColor = useTransform(
    scrollYProgress,
    [0, 1],
    ["#FAFAF8", "#E6EEFF"],
  );

  return (
    <motion.div ref={ref} style={{ backgroundColor }} className="relative md:min-h-screen">
      {children}
    </motion.div>
  );
}
