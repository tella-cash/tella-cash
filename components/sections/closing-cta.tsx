"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { MagneticCta } from "@/components/ui/magnetic-cta";
import { MaskReveal } from "@/components/interactive/mask-reveal";
import { Reveal } from "@/components/interactive/reveal";
import { SITE } from "@/lib/data/site";
import Image from "next/image";

export function ClosingCta() {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.96, 1, 1.02]);
  const bubbleY = useTransform(scrollYProgress, [0, 1], [60, -60]);

  return (
    <section ref={ref} className="px-3 py-[60px] md:px-[72px]" style={{ backgroundImage: "url('/closing-cta-bg.png')", backgroundSize: "cover", backgroundPosition: "center" }}>
      <div className="px-[20px] py-[80px] rounded-[32px] bg-white md:py-[120px]">
        <motion.div style={{ scale }} className="flex flex-col items-center">
          <MaskReveal
            as="h2"
            text="Open WhatsApp. Send a message. That's it."
            accent="Send a message."
            className="max-w-[820px] justify-center text-center text-[40px] sm:text-[60px] lg:text-[80px] font-semibold leading-[1.02] tracking-[-0.02em] text-ink-900"
          />

          <Reveal delay={0.15}>
            <p className="mt-6 max-w-lg mx-auto text-lg md:text-xl leading-relaxed text-center text-ink-700">
              No download. No signup form. No menus to memorize. Your wallet
              comes online the moment you say hello.
            </p>
          </Reveal>

          <Reveal delay={0.25}>
            <div className="group mt-12 flex w-fit flex-col items-center justify-center gap-[10px] rounded-[18px] bg-[#0057FF] p-4 transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_-12px_rgb(0_71_255/0.55)]">
              <div className="overflow-hidden rounded-lg bg-white p-2 transition-transform duration-300 group-hover:scale-[1.03]">
                <Image src="/qrcode.svg" alt="Scan to open tella on WhatsApp" width={180} height={180} />
              </div>
              <p className="text-lg text-white">Scan to start</p>
            </div>
          </Reveal>

          <Reveal delay={0.35}>
            <div className="mt-12 flex mx-auto w-fit flex-wrap items-center justify-center gap-5">
              <MagneticCta
                href={SITE.whatsappLink}
                target="_blank"
                rel="noopener"
                className="group relative isolate overflow-hidden !bg-black rounded-full text-base md:text-lg md:!px-9 md:!py-4 text-white transition-transform duration-300 hover:-translate-y-0.5"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -z-10 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
                />
                Start now
              </MagneticCta>
              <span className="text-xs uppercase tracking-[0.18em] text-ink-400">
                First time? Send{" "}
                <span className="font-mono lowercase tracking-normal text-ink-700">
                  join oil-needs
                </span>
              </span>
            </div>
          </Reveal>
        </motion.div>
      </div>
    </section>
  );
}
