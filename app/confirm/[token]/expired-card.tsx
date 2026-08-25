"use client";

import { motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * "Link expired" empty state — mirrors ConfirmClient's outer-card mount
 * transition exactly (same numbers) so both states read as the same UI
 * shell animating differently, not two unrelated designs.
 */
export function ExpiredCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="rounded-[28px] border border-ink-200/70 bg-surface-0 p-8 text-center shadow-card"
    >
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-100 text-xl text-ink-400">
        ⏱
      </div>
      <h1 className="mt-5 font-display text-3xl text-ink-900">Link expired</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-500">
        This confirmation link is no longer valid. Head back to your tella
        chat and start the send again.
      </p>
    </motion.div>
  );
}
