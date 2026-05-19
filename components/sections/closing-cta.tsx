"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { MagneticCta } from "@/components/ui/magnetic-cta";
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
    <section ref={ref} className="py-[60px] px-[72px]" style={{ backgroundImage: "url('/closing-cta-bg.png')", backgroundSize: "cover", backgroundPosition: "center" }}>
      <div className="px-[20px] py-[60px] rounded-[32px] bg-white">
        <motion.div style={{ scale }}>
          <h2 className="text-[48px] font-semibold text-center text-ink-900">
            Open WhatsApp.
            <br />
            <span className="text-[#0047FF]">Send a message.</span>
            That's it.
          </h2>

          <p className="mt-2 max-w-md mx-auto text-base leading-relaxed text-center text-ink-900">
            No download. No signup form. No menus to memorize. Your wallet
            comes online the moment you say hello.
          </p>
          <div className="flex mt-[40px] flex-col bg-[#0057FF] items-center w-fit mx-auto p-3 rounded-[15px] gap-[10px] justify-center">
            <Image src="/qrcode.svg" alt="QR Code" width={170} height={200}/>
            <p className="text-lg text-white">Try it now</p>
          </div>

          <div className="mt-[40px] flex mx-auto w-fit flex-wrap items-center gap-5">
            <MagneticCta
              href={SITE.whatsappLink}
              target="_blank"
              rel="noopener"
              className="text-base bg-black rounded-full px-8 py-3 text-white"
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
