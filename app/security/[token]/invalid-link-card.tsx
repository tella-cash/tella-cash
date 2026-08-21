"use client";

import { motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Shown for a reset link that's expired, already used, or never existed.
 * All three collapse to one message on purpose — distinguishing them would
 * tell whoever holds the link whether it was ever real.
 *
 * Mirrors ExpiredCard's mount transition exactly so the two states read as
 * the same shell.
 */
export function InvalidLinkCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="rounded-[28px] border border-ink-200/70 bg-surface-0 p-8 text-center shadow-card"
    >
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-100 text-xl text-ink-400">
        🔐
      </div>
      <h1 className="mt-5 font-display text-3xl text-ink-900">Link expired</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-500">
        This reset link is no longer valid. Head back to WhatsApp and send{" "}
        <span className="font-medium text-ink-900">reset pin</span> to get a
        fresh one.
      </p>
    </motion.div>
  );
}
