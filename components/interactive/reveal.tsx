"use client";

import { motion, useInView, type Variants } from "framer-motion";
import { useRef, type ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  /** Delay (s) before the reveal animation starts after entering view. */
  delay?: number;
  /** Direction the element slides in from. */
  from?: "bottom" | "left" | "right" | "fade";
  /** Class names forwarded to the wrapper. */
  className?: string;
  /** How far through the element's height into the viewport before triggering. */
  amount?: number;
}

/**
 * Reveal
 *
 * Generic wrapper that fades + slides its children into view when scrolled
 * into the viewport. Used by every section to give the page a sense of
 * choreography rather than just appearing all at once.
 *
 * `once: true` means each element animates only the first time — scrolling
 * back up doesn't replay the animation, which would be distracting and
 * undermine the premium feel.
 *
 * The defaults are intentionally subtle — 24px of travel, 0.6s duration.
 * Heavier movement undercuts the "quiet" tone of the design.
 */
export function Reveal({
  children,
  delay = 0,
  from = "bottom",
  className,
  amount = 0.2,
}: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(ref, { once: true, amount });

  const variants: Variants = {
    hidden: {
      opacity: 0,
      y: from === "bottom" ? 24 : 0,
      x: from === "left" ? -24 : from === "right" ? 24 : 0,
    },
    visible: {
      opacity: 1,
      y: 0,
      x: 0,
      transition: {
        duration: 0.7,
        delay,
        ease: [0.16, 1, 0.3, 1], // easeOutExpo
      },
    },
  };

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={variants}
      className={className}
    >
      {children}
    </motion.div>
  );
}
