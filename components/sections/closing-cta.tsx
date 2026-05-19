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
    <section ref={ref} className="py-[60px] px-[72px] bg-red-800">
      <div className="px-6 bg-white">
        <motion.div style={{ scale }} className="max-w-4xl">
          <h2 className="text-[48px] font-normal text-ink-900">
            Open WhatsApp.
            <br />
            <span className="italic text-accent-500">Send a message.</span>
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
