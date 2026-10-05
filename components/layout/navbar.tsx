"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { BrandMark } from "@/components/ui/brand-mark";
import { SITE } from "@/lib/data/site";
import telegramIcon from "@/public/figma/hero/telegram.svg";
import whatsappIcon from "@/public/figma/hero/whatsapp.svg";

const HEADER_LINKS = [
  { label: "Use Cases", href: "#use-cases" },
  { label: "Features", href: "#features" },
  { label: "Security", href: "#security" },
  { label: "Ambassador", href: "#ambassador" },
  { label: "Contact", href: "#contact" },
] as const;

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const closeMobileMenu = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    mediaQuery.addEventListener("change", closeMobileMenu);
    return () => mediaQuery.removeEventListener("change", closeMobileMenu);
  }, []);

  useEffect(() => {
    lastScrollY.current = window.scrollY;
    let animationFrame = 0;

    const updateHeader = () => {
      animationFrame = 0;
      const currentScrollY = Math.max(window.scrollY, 0);
      const difference = currentScrollY - lastScrollY.current;

      if (open || currentScrollY < 24) {
        setHidden(false);
      } else if (difference > 2 && currentScrollY > 96) {
        setHidden(true);
      } else if (difference < -2) {
        setHidden(false);
      }

      lastScrollY.current = currentScrollY;
    };

    const handleScroll = () => {
      if (!animationFrame) animationFrame = requestAnimationFrame(updateHeader);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [open]);

  return (
    <header
      onFocusCapture={() => setHidden(false)}
      className={`sticky inset-x-0 top-0 z-50 isolate px-4 font-geist transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none sm:px-8 lg:px-[72px] ${hidden && !open ? "-translate-y-full" : "translate-y-0"}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 border-b border-black/[0.035] bg-white/78 shadow-[0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/68"
      />

      <div className="mx-auto flex max-w-[1344px] items-center justify-between py-4">
        <div className="flex items-center">
          <Link href="/" aria-label="Tella - home" data-cursor="grow">
            <BrandMark compact />
          </Link>
        </div>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-[5.6px]">
            {HEADER_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="block rounded px-3.5 py-2 text-[15.32px] leading-[18.384px] tracking-[-0.3585px] text-[#252522]/55 transition-colors duration-150 hover:bg-white/70 hover:text-[#252522]"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-1 md:flex">
          <button
            type="button"
            disabled
            title="Telegram access coming soon"
            className="flex items-center justify-center gap-1.5 rounded-full bg-[#e6eeff] px-5 py-2 text-[13px] leading-[19.5px] tracking-[-0.0762px] text-[#003eb5]"
          >
            <Image src={telegramIcon} alt="" width={20} height={20} />
            <span>Try on Telegram</span>
          </button>
          <a
            href={SITE.whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            data-cursor="grow"
            className="flex items-center justify-center gap-1.5 rounded-full bg-[#0057ff] px-5 py-2 text-[13px] leading-[19.5px] tracking-[-0.0762px] text-[#fffcfa] transition-colors hover:bg-[#004de0]"
          >
            <Image src={whatsappIcon} alt="" width={20} height={20} />
            <span>Get Started</span>
          </a>
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((current) => !current)}
          className="relative grid size-10 place-items-center rounded-full border border-black/5 bg-white/70 text-black md:hidden"
        >
          <span aria-hidden="true" className="relative block h-4 w-5">
            <span
              className={`absolute left-0 right-0 top-0 h-0.5 rounded-full bg-current transition-transform ${open ? "translate-y-[7px] rotate-45" : ""}`}
            />
            <span
              className={`absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-current transition-opacity ${open ? "opacity-0" : ""}`}
            />
            <span
              className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-current transition-transform ${open ? "-translate-y-[7px] -rotate-45" : ""}`}
            />
          </span>
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-nav"
            aria-label="Mobile"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="border-t border-black/5 bg-white pb-6 md:hidden"
          >
            <ul className="flex flex-col py-3">
              {HEADER_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block py-3 text-base text-black/70"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <a
              href={SITE.whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0057ff] p-4 text-white"
            >
              <Image src={whatsappIcon} alt="" width={24} height={24} />
              Get Started
            </a>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
