"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import Image from "next/image";
import { MagneticCta } from "@/components/ui/magnetic-cta";
import { PhoneFrame } from "@/components/ui/phone-frame";
import { LiveChatThread } from "@/components/illustrations/live-chat-thread";
import { MaskReveal } from "@/components/interactive/mask-reveal";
import { EASE, fadeUp, stagger } from "@/lib/animation/variants";
import { useTilt } from "@/lib/hooks/use-tilt";
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
  const auroraY = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const cueOpacity = useTransform(scrollYProgress, [0, 0.12], [1, 0]);

  return (
    <section
      ref={ref}
      className="relative lg:h-screen font-works overflow-hidden pt-[104px] px-[10px] sm:px-[72px]"
    >
      {/* Drifting accent aurora — parallaxed, sits behind everything */}
      <motion.div
        aria-hidden
        style={{ y: auroraY }}
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="animate-drift-slow absolute -left-24 top-24 h-[420px] w-[420px] rounded-full bg-accent-300/25 blur-[120px]" />
        <div
          className="animate-drift-slow absolute right-[-6rem] top-1/3 h-[360px] w-[360px] rounded-full bg-accent-500/15 blur-[130px]"
          style={{ animationDelay: "-5s" }}
        />
      </motion.div>

      <div className="mx-auto grid h-full max-w-[1400px] items-center gap-8 px-6 lg:grid-cols-12 lg:gap-12">
        {/* Copy column */}
        <motion.div
          style={{ y: headlineY }}
          initial="hidden"
          animate="visible"
          className="lg:col-span-7 lg:w-[720px]"
        > 
          <MaskReveal
            as="h1"
            trigger="mount"
            delay={0.12}
            text="Stablecoin payments, as simple as a message"
            accent="a message"
            className="text-[40px] sm:text-[52px] lg:text-[64px] xl:text-[76px] font-semibold md:font-medium font-display leading-[1.02] tracking-[-0.02em] text-ink-900 lg:max-w-[640px]"
          />

          <motion.p
            variants={fadeUp(0.55)}
            className="mt-7 max-w-xl text-base md:text-xl leading-relaxed text-ink-700"
          >
            Send, receive, and manage stablecoins directly in WhatsApp. No apps.
            No learning curve. Just type.
          </motion.p>

          <motion.div
            variants={fadeUp(0.68)}
            className="mt-9 md:mt-11 flex flex-wrap items-center gap-5 md:gap-6"
          >
            <MagneticCta
              href={SITE.whatsappLink}
              target="_blank"
              rel="noopener"
              className="group relative isolate overflow-hidden flex items-center gap-2.5 text-base md:text-lg md:!px-8 md:!py-4 shadow-accent transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_44px_-8px_rgb(0_71_255/0.6)]"
            >
              {/* Sheen sweep on hover */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
              />
              <Image src={whatsappIcon} alt="" width={20} height={20} />
              <span className="text-white">Start on WhatsApp</span>
            </MagneticCta>

            <a
              href="#features"
              data-cursor="grow"
              className="group flex items-center gap-2 text-base md:text-lg font-medium text-ink-900 underline-offset-4 transition-colors hover:underline"
            >
              See how it works
              <span
                aria-hidden="true"
                className="grid h-5 w-5 place-items-center transition-transform duration-300 group-hover:translate-x-1"
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

          {/* Trust strip — staggered, desktop */}
          <motion.div
            variants={stagger(0.08, 0.85)}
            className="mt-12 hidden lg:flex flex-wrap items-center gap-x-6 gap-y-3 text-[15px] md:text-base text-ink-700"
          >
            <TrustItem icon={lockIcon} size={16} label="End-to-end encrypted" />
            <TrustItem icon={coinIcon} size={16} label="USDC native" />
            <TrustItem icon={lightIcon} size={14} label="Sub-second finality" />
          </motion.div>
        </motion.div>

        {/* Phone column */}
        <motion.div
          style={{ y: phoneY }}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.4, ease: EASE }}
          className="relative lg:col-span-5"
        >
          <HeroPhone />
        </motion.div>

        {/* Trust strip — mobile */}
        <motion.div
          variants={stagger(0.08, 0.2)}
          initial="hidden"
          animate="visible"
          className="lg:hidden flex flex-wrap justify-center items-center text-center gap-4 text-[15px] text-ink-700"
        >
          <TrustItem icon={lockIcon} size={16} label="End-to-end encrypted" />
          <TrustItem icon={coinIcon} size={16} label="USDC native" />
          <TrustItem icon={lightIcon} size={14} label="Sub-second finality" />
        </motion.div>
      </div>

      {/* Scroll cue — fades out as the user scrolls */}
      <motion.div
        style={{ opacity: cueOpacity }}
        className="pointer-events-none absolute inset-x-0 bottom-6 hidden lg:flex flex-col items-center gap-2 text-ink-400"
      >
        <span className="text-[10px] uppercase tracking-[0.22em]">Scroll</span>
        <span className="flex h-7 w-[18px] justify-center rounded-full border border-ink-300/70 pt-1.5">
          <motion.span
            className="h-1.5 w-1 rounded-full bg-ink-400"
            animate={{ y: [0, 6, 0], opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        </span>
      </motion.div>
    </section>
  );
}

function TrustItem({
  icon,
  size,
  label,
}: {
  icon: string;
  size: number;
  label: string;
}) {
  return (
    <motion.span variants={fadeUp(0, 8)} className="flex items-center gap-2">
      <Image src={icon} alt="" width={size} height={size} />
      {label}
    </motion.span>
  );
}

function HeroPhone() {
  const { rotateX, rotateY, onMouseMove, onMouseLeave } = useTilt({ max: 7 });

  return (
    <div className="relative mx-auto w-fit">
      {/* Floating notification — social proof, top-left */}
      <motion.div
        initial={{ opacity: 0, y: 20, x: -10 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ duration: 0.8, delay: 1.2, ease: EASE }}
        className="animate-drift-slow absolute -left-24 top-28 z-10 flex w-40 items-center gap-3 rounded-2xl bg-white p-3 shadow-card ring-1 ring-ink-200/30 sm:-left-14 lg:-left-10"
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-50 text-xs font-semibold text-accent-600">
          CO
        </div>
        <div className="flex-1 leading-tight">
          <p className="text-[10px] uppercase tracking-wider text-ink-400">Sent</p>
          <p className="font-display text-base leading-none text-ink-900">$5.00</p>
          <p className="text-[10px] text-ink-500">to Chuks Okafor</p>
        </div>
      </motion.div>

      {/* Floating stat — bottom-right */}
      <motion.div
        initial={{ opacity: 0, y: 20, x: 10 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ duration: 0.8, delay: 1.4, ease: EASE }}
        className="animate-drift-slow absolute -right-6 bottom-24 z-10 w-44 rounded-2xl bg-ink-900 p-4 text-surface-50 shadow-card"
        style={{ animationDelay: "-3s" }}
      >
        <p className="font-display text-3xl leading-none">~1s</p>
        <p className="mt-2 text-[11px] leading-tight text-surface-50/60">
          Average settlement on Arc
        </p>
      </motion.div>

      {/* The phone itself tilts toward the cursor */}
      <motion.div
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{
          rotateX,
          rotateY,
          transformPerspective: 1200,
          transformStyle: "preserve-3d",
        }}
        className="will-change-transform"
      >
        <PhoneFrame className="lg:!w-[340px] xl:!w-[368px]">
          <LiveChatThread />
        </PhoneFrame>
      </motion.div>
    </div>
  );
}
