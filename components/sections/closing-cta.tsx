"use client";

import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
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

  return (
    <section
      ref={ref}
      className="relative bg-cover bg-center px-3 py-10 sm:px-8 sm:py-[60px] lg:px-[72px]"
      style={{ backgroundImage: "url('/closing-cta-bg.png')" }}
    >
      <div className="overflow-hidden rounded-[32px] bg-white/95 px-5 py-10 backdrop-blur-[33.2px] sm:px-8 sm:py-[60px]">
        <motion.div style={{ scale }}>
          <h2 className="text-center font-display font-normal text-black">
            <span className="flex items-center justify-center gap-2.5 text-[30px] leading-[38px] sm:text-[42px] sm:leading-[50px]">
              <span>Open WhatsApp</span>
              <span className="inline-flex size-16 rotate-[10deg] items-center justify-center rounded-[12px] bg-[#f5f5f5] p-2">
                <Image
                  src="/figma/closing-cta/whatsapp.svg"
                  alt=""
                  width={48}
                  height={47.8413}
                />
              </span>
            </span>
            <span className="mt-2 block text-[36px] leading-[44px] tracking-[-0.72px] sm:text-[48px] sm:leading-[56px]">
              <span className="text-[#0057ff]">Send a message.</span>{" "}
              <span>That&apos;s it.</span>
            </span>
          </h2>

          <p className="mx-auto mt-4 max-w-[329px] text-center font-geist text-sm leading-5 text-black sm:max-w-md sm:text-base sm:leading-relaxed">
            <span className="block">No download. No signup form. No menus to memorize.</span>
            <span className="mt-4 block sm:mt-0">
              Your wallet comes online the moment you say hello.
            </span>
          </p>

          <div className="mx-auto mt-8 flex w-fit flex-col items-center justify-center gap-2.5 rounded-2xl bg-[#0057ff] p-2.5 shadow-[0_4px_0_#000] sm:mt-10 sm:p-3">
            <Image
              src="/qrcode.svg"
              alt="Scan to start with Tella on WhatsApp"
              width={120}
              height={120}
              className="rounded-xl"
            />
            <p className="font-geist text-base leading-6 text-white">Try it Now</p>
          </div>

          <div className="mx-auto mt-8 flex w-fit flex-col items-center gap-3 sm:mt-10 sm:flex-row sm:gap-5">
            <MagneticCta
              href={SITE.whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-[46px] min-w-[132px] items-center justify-center gap-2 !rounded-full bg-black px-5 py-0 font-geist text-[13px] font-medium leading-none text-white hover:bg-black/80 md:px-5 md:py-0 md:text-[13px]"
            >
              <span>Start now</span>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={18}
                strokeWidth={1.8}
                aria-hidden="true"
              />
            </MagneticCta>
            <span className="font-geist text-[10px] uppercase leading-4 tracking-[0.18em] text-[#737373]">
              First time? Send{" "}
              <span className="font-mono lowercase tracking-normal text-black">
                join oil-needs
              </span>
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
