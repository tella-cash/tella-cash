"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { MagneticCta } from "@/components/ui/magnetic-cta";
import { PhoneFrame } from "@/components/ui/phone-frame";
import { LiveChatThread } from "@/components/illustrations/live-chat-thread";
import { SITE } from "@/lib/data/site";

export function Hero() {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  // Phone parallaxes up slightly faster than the text — gives the right
  // column a subtle depth-of-field feel. Range tuned so the phone never
  // exits the viewport prematurely.
  const phoneY = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const headlineY = useTransform(scrollYProgress, [0, 1], [0, -40]);

  return (
    <section
      ref={ref}
      className="relative overflow-hidden pb-32 pt-40 lg:pb-40 lg:pt-48"
    >
      {/* Background grid — extremely subtle, adds rhythm without ornament */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      {/* One soft accent glow, top-right — single point of color in the
          composition before the hero phone enters. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 -z-10 h-[600px] w-[600px] translate-x-1/3 -translate-y-1/4 rounded-full bg-accent-500/[0.06] blur-3xl"
      />

      <div className="mx-auto grid max-w-7xl items-center gap-16 px-6 lg:grid-cols-12 lg:gap-8">
        {/* Copy column */}
        <motion.div style={{ y: headlineY }} className="lg:col-span-7">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-surface-50/60 px-3 py-1 text-xs text-ink-500 backdrop-blur"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-500" />
            <span>Now on Arc — stablecoins by message</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 text-[clamp(3rem,7vw,6.5rem)] font-normal leading-[0.96] tracking-[-0.04em] text-ink-900"
          >
            Money,
            <br />
            <span className="italic text-accent-500">by message.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 max-w-md text-lg leading-relaxed text-ink-500"
          >
            Send, receive, and track stablecoins from a WhatsApp chat. No app to
            install. No menus to learn. Just write.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mt-10 flex flex-wrap items-center gap-5"
          >
            <MagneticCta
              href={SITE.whatsappLink}
              target="_blank"
              rel="noopener"
              className="text-base"
            >
              Start on WhatsApp
            </MagneticCta>
            <a
              href="#features"
              data-cursor="grow"
              className="text-sm text-ink-500 underline-offset-4 transition-colors hover:text-ink-900 hover:underline"
            >
              See how it works →
            </a>
          </motion.div>

          {/* Trust strip — small, restrained */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.7 }}
            className="mt-20 flex flex-wrap items-center gap-x-8 gap-y-3 text-[11px] uppercase tracking-[0.18em] text-ink-400"
          >
            <span>End-to-end encrypted</span>
            <span className="h-1 w-1 rounded-full bg-ink-300" />
            <span>USDC native</span>
            <span className="h-1 w-1 rounded-full bg-ink-300" />
            <span>Sub-second finality</span>
          </motion.div>
        </motion.div>

        {/* Phone column */}
        <motion.div
          style={{ y: phoneY }}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative lg:col-span-5"
        >
          <HeroPhone />
        </motion.div>
      </div>
    </section>
  );
}

/**
 * HeroPhone
 *
 * Composes the phone frame with the looping chat thread, plus two floating
 * detail elements that overlap the phone for depth — a small notification
 * card and a stat tile. Both drift independently using CSS keyframe
 * animation so they don't feel mechanically synced.
 */
function HeroPhone() {
  return (
    <div className="relative mx-auto w-fit">
      {/* Floating notification — top-left of phone */}
      <motion.div
        initial={{ opacity: 0, y: 20, x: -10 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ duration: 0.8, delay: 1.2, ease: [0.16, 1, 0.3, 1] }}
        className="animate-drift-slow absolute -left-8 top-16 z-10 flex w-52 items-center gap-3 rounded-2xl bg-white p-3 shadow-card ring-1 ring-ink-200/30 sm:-left-14 lg:-left-10"
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-50 text-xs font-semibold text-accent-600">
          CO
        </div>
        <div className="flex-1 leading-tight">
          <p className="text-[10px] uppercase tracking-wider text-ink-400">
            Sent
          </p>
          <p className="font-display text-base leading-none text-ink-900">
            $5.00
          </p>
          <p className="text-[10px] text-ink-500">to Chuks Okafor</p>
        </div>
      </motion.div>

      {/* Floating stat — bottom-right */}
      <motion.div
        initial={{ opacity: 0, y: 20, x: 10 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ duration: 0.8, delay: 1.4, ease: [0.16, 1, 0.3, 1] }}
        className="animate-drift-slow absolute -right-6 bottom-24 z-10 w-44 rounded-2xl bg-ink-900 p-4 text-surface-50 shadow-card"
        style={{ animationDelay: "-3s" }}
      >
        <p className="font-display text-3xl leading-none">~1s</p>
        <p className="mt-2 text-[11px] leading-tight text-surface-50/60">
          Average settlement on Arc
        </p>
      </motion.div>

      <PhoneFrame>
        <LiveChatThread />
      </PhoneFrame>
    </div>
  );
}
