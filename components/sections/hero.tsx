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
import telegramIcon from "@/public/icons/telegram.svg";

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
      className="relative lg:h-screen overflow-hidden pt-[14px] px-[10px] sm:px-[72px]"
    >
      {/* Drifting accent aurora — parallaxed, sits behind everything */}
      <motion.div
        aria-hidden
        style={{ y: auroraY }}
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="animate-drift-slow absolute -left-24 top-24 h-[420px] w-[420px] rounded-full bg-accent-300/45 blur-[90px]" />
        <div
          className="animate-drift-slow absolute right-[-6rem] top-1/3 h-[360px] w-[360px] rounded-full bg-accent-500/30 blur-[100px]"
          style={{ animationDelay: "-5s" }}
        />
        <div
          className="animate-drift-slow absolute left-1/3 bottom-0 h-[280px] w-[280px] rounded-full bg-accent-400/25 blur-[85px]"
          style={{ animationDelay: "-8s" }}
        />
      </motion.div>

      {/* Faint grain over the gradient so it reads as textured, not flat */}
      <div aria-hidden className="bg-grain pointer-events-none absolute inset-0 -z-10" />

      <div className="mx-auto grid h-full max-w-[1400px] items-center gap-8 px-6 lg:grid-cols-12 lg:gap-12">
        {/* Copy column */}
        <motion.div
          style={{ y: headlineY }}
          initial="hidden"
          animate="visible"
          className="lg:col-span-7 lg:max-w-[720px]"
        >
          <motion.div
            variants={fadeUp(0)}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-ink-900/10 bg-white/60 px-3.5 py-1.5 text-xs font-medium text-ink-700 backdrop-blur-sm md:text-sm"
           >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Live on WhatsApp and Telegram, settles on Arc in ~1s
          </motion.div>

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
            Send, receive, and manage stablecoins directly in WhatsApp or
            Telegram. No apps. No learning curve. Just type.
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
              <span className="text-white">Chat on WhatsApp</span>
            </MagneticCta>

            {SITE.telegramLink && (
              <MagneticCta
                href={SITE.telegramLink}
                target="_blank"
                rel="noopener"
                className="group relative isolate overflow-hidden flex items-center gap-2.5 !bg-ink-900 text-base md:text-lg md:!px-8 md:!py-4 transition-transform duration-300 hover:-translate-y-0.5"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -z-10 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
                />
                <Image src={telegramIcon} alt="" width={19} height={19} />
                <span className="text-white">Chat on Telegram</span>
              </MagneticCta>
            )}

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

          {SITE.telegramLink && (
            <motion.p
              variants={fadeUp(0.75)}
              className="mt-4 text-sm text-ink-500"
            >
              Same wallet either way, nothing to reconnect.
            </motion.p>
          )}

          {/* Trust strip — staggered, desktop */}
          <motion.div
            variants={stagger(0.08, 0.85)}
            className="mt-12 hidden lg:flex flex-wrap items-center gap-x-6 gap-y-3 text-[15px] md:text-base text-ink-700"
          >
            <TrustItem icon={lockIcon} height={16} ratio={18 / 21} label="End-to-end encrypted" />
            <TrustItem icon={coinIcon} height={16} ratio={1} label="USDC native" />
            <TrustItem icon={lightIcon} height={14} ratio={17 / 23} label="Sub-second finality" />
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
          <TrustItem icon={lockIcon} height={16} ratio={18 / 21} label="End-to-end encrypted" />
          <TrustItem icon={coinIcon} height={16} ratio={1} label="USDC native" />
          <TrustItem icon={lightIcon} height={14} ratio={17 / 23} label="Sub-second finality" />
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
  height,
  ratio,
  label,
}: {
  icon: string;
  /** Rendered height in px; width is derived from the icon's true aspect ratio. */
  height: number;
  /** Icon's intrinsic width/height ratio, so non-square SVGs don't get squished. */
  ratio: number;
  label: string;
}) {
  return (
    <motion.span variants={fadeUp(0, 8)} className="flex items-center gap-2">
      <Image src={icon} alt="" width={Math.round(height * ratio)} height={height} />
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
        className="animate-drift-slow absolute -left-20 top-28 z-10 hidden w-40 items-center gap-3 rounded-2xl bg-white p-3 shadow-card ring-1 ring-ink-200/30 lg:-left-16 lg:flex xl:-left-20"
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-50 text-xs font-semibold text-accent-600">
          GT
        </div>
        <div className="flex-1 leading-tight">
          <p className="text-[10px] uppercase tracking-wider text-ink-400">Cashed out</p>
          <p className="font-sans text-base font-semibold leading-none tabular-nums text-ink-900">₦ 50,000</p>
          <p className="text-[10px] text-ink-500">to GTBank</p>
        </div>
      </motion.div>

      {/* Floating stat — bottom-right */}
      <motion.div
        initial={{ opacity: 0, y: 20, x: 10 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ duration: 0.8, delay: 1.4, ease: EASE }}
        className="animate-drift-slow absolute -right-8 bottom-8 z-10 hidden w-44 rounded-2xl bg-ink-900 p-4 text-surface-50 shadow-card ring-1 ring-white/10 lg:-bottom-2 lg:-right-12 lg:block"
        style={{ animationDelay: "-3s" }}
      >
        <p className="font-sans text-3xl font-semibold leading-none tabular-nums">
          ~1s
        </p>
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

      {/* Grounding shadow — gives the phone a sense of resting above the page */}
      <div
        aria-hidden
        className="absolute -bottom-6 left-1/2 -z-10 h-10 w-[70%] -translate-x-1/2 rounded-[100%] bg-ink-900/15 blur-2xl"
      />
    </div>
  );
}
