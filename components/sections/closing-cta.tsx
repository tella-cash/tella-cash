"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { MagneticCta } from "@/components/ui/magnetic-cta";
import { SITE } from "@/lib/data/site";

export function ClosingCta() {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.96, 1, 1.02]);
  const bubbleY = useTransform(scrollYProgress, [0, 1], [60, -60]);

  return (
    <section ref={ref} className="relative overflow-hidden py-40 lg:py-56">
      {/* Oversized bubble decoration */}
      <motion.div
        style={{ y: bubbleY }}
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 top-1/3 h-[500px] w-[500px] rounded-[50%_45%_45%_50%/50%_50%_55%_50%] bg-accent-500/10 blur-2xl"
      />

      <div className="relative mx-auto max-w-7xl px-6">
        <motion.div style={{ scale }} className="max-w-4xl">
          <h2 className="text-[clamp(3rem,9vw,8rem)] font-normal leading-[0.95] tracking-[-0.04em] text-ink-900">
            Open WhatsApp.
            <br />
            <span className="italic text-accent-500">Send a message.</span>
            <br />
            That's it.
          </h2>

          <p className="mt-12 max-w-md text-lg leading-relaxed text-ink-500">
            No download. No signup form. No menus to memorize. Your wallet
            comes online the moment you say hello.
          </p>

          <div className="mt-12 flex flex-wrap items-center gap-5">
            <MagneticCta
              href={SITE.whatsappLink}
              target="_blank"
              rel="noopener"
              className="text-base"
            >
              Start now
            </MagneticCta>
            <span className="text-xs uppercase tracking-[0.18em] text-ink-400">
              First time? Send <span className="font-mono lowercase tracking-normal text-ink-700">join oil-needs</span>
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
