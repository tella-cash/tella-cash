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
  /** Render statically without motion. */
  disabled?: boolean;
  /**
   * Replay the reveal every time the element crosses the viewport boundary,
   * in either scroll direction, instead of firing once and staying visible
   * forever. Defaults to `true` so the page reads as alive when scrolling
   * back up, not just on first pass.
   */
  repeat?: boolean;
}

/**
 * Reveal
 *
 * Generic wrapper that fades + slides its children into and out of view as
 * they cross the viewport boundary. Used by every section to give the page
 * a sense of choreography rather than just appearing all at once.
 *
 * With `repeat` (the default), scrolling back up fades the element back out
 * and re-plays the entrance the next time it comes back into view — pass
 * `repeat={false}` for the rare case where a one-shot reveal is wanted
 * (e.g. something that shouldn't visually "reset" once seen).
 *
 * The `-10%` viewport margin gives the trigger some hysteresis so elements
 * don't flicker in/out right at the edge of the screen.
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
  disabled = false,
  repeat = true,
}: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(ref, {
    once: !repeat,
    amount,
    margin: "-10% 0px -10% 0px",
  });

  const variants: Variants = {
    hidden: {
      opacity: 0,
      y: from === "bottom" ? 24 : 0,
      x: from === "left" ? -24 : from === "right" ? 24 : 0,
      transition: {
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1], // easeOutExpo
      },
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

  if (disabled) {
    return <div className={className}>{children}</div>;
  }

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
