"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import Image from "next/image";
import { MagneticCta } from "@/components/ui/magnetic-cta";
import { PhoneFrame } from "@/components/ui/phone-frame";
import { LiveChatThread } from "@/components/illustrations/live-chat-thread";
import { SITE } from "@/lib/data/site";
import lightIcon from "@/public/icons/lightening.svg";
import coinIcon from "@/public/icons/coin.svg";
import lockIcon from "@/public/icons/lock.svg";
import whatsappIcon from "@/public/icons/whatsapp.svg";

export function Hero() {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const phoneY = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const headlineY = useTransform(scrollYProgress, [0, 1], [0, -40]);

  return (
    <section
      ref={ref}
      className="relative lg:h-screen overflow-hidden pt-[104px] px-[10px] sm:px[72px]"
    >
      <div className="mx-auto grid h-full max-w-7xl items-center gap-8 lg:gap-16 px-6 lg:grid-cols-12 lg:gap-8">
        {/* Copy column */}
        <motion.div style={{ y: headlineY }} className="lg:col-span-7 lg:w-[650px]">
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-[24px] md:text-[48px] font-semibold md:font-medium  lg:w-[450px] font-display text-ink-900"
          >
            Send USDC and Receive Naira on WhatsApp
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mt-[16px] max-w-md text-[12px] md:text-[15px] text-ink-900"
          >
            Send, receive, and manage stablecoins directly in WhatsApp. 
            No apps. 
            No learning curve. 
            Just type.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mt-[32px] md:mt-[50px] flex flex-wrap items-center gap-4 md:gap-5"
          >
            <MagneticCta
              href={SITE.whatsappLink}
              target="_blank"
              rel="noopener"
              className="text-xs md:text-base flex gap-2"
            >
              <Image 
              className="text-white"
              src={whatsappIcon}
              alt="WhatsApp"
              width={16}
              height={16} />
              <p className="text-white">Start on WhatsApp</p>
            </MagneticCta>
            <a
              href="#features"
              data-cursor="grow"
              className="text-xs md:text-base text-ink-900 flex gap-2 font-medium underline-offset-4 transition-colors hover:text-ink-900 hover:underline"
            >
              See how it works
              <span
                aria-hidden="true"
                className="grid h-5 w-5 place-items-center transition-transform duration-300 group-hover:translate-x-0.5"
              >
                <svg viewBox="0 0 12 12" className="h-3 w-3">
                  <path
                    d="M2 6h8m0 0L6 2m4 4L6 10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </span>
            </a>
          </motion.div>

          {/* Trust strip — small, restrained */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.7 }}
            className="mt-[48px] hidden lg:flex flex-wrap items-center gap-x-4 gap-y-3 text-[14px] font-medum text-ink-900"
          >
            <span className="flex items-center gap-2">
              <Image
                src={lockIcon}
                alt="Arc"
                width={14}
                height={14}
              />
              End-to-end encrypted</span>
            <span className="flex items-center gap-2">
              <Image
                src={coinIcon}
                alt="Arc"
                width={14}
                height={14}
              />
              USDC native</span>
            <span className="flex items-center gap-2">
              <Image
                src={lightIcon}
                alt="Arc"
                width={12}
                height={12}
              />
              Sub-second finality
            </span>
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
        {/* Trust strip — small, restrained */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.7 }}
            className="lg:hidden flex flex-wrap justify-center items-center text-center gap-4 text-[14px] font-medum text-ink-900"
          >
            <span className="flex items-center gap-2">
              <Image
                src={lockIcon}
                alt="Arc"
                width={14}
                height={14}
              />
              End-to-end encrypted</span>
            <span className="flex items-center gap-2">
              <Image
                src={coinIcon}
                alt="Arc"
                width={14}
                height={14}
              />
              USDC native</span>
            <span className="flex items-center gap-2">
              <Image
                src={lightIcon}
                alt="Arc"
                width={12}
                height={12}
              />
              Sub-second finality
            </span>
          </motion.div>
      </div>
    </section>
  );
}

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
