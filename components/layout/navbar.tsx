"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { BrandMark } from "@/components/ui/brand-mark";
import { MagneticCta } from "@/components/ui/magnetic-cta";
import { NAV_LINKS, SITE } from "@/lib/data/site";

/**
 * Navbar
 *
 * Top navigation. Sits transparent at the top of the page and acquires a
 * subtle blurred background once the user scrolls past the hero. The
 * crossfade is driven by `useScroll` so it tracks the actual scroll
 * position with no jank.
 *
 * Client component because it reads scroll state. Keep it lean — anything
 * that doesn't need scroll awareness should stay server-rendered.
 */
export function Navbar() {
  const { scrollY } = useScroll();
  const bgOpacity = useTransform(scrollY, [0, 80], [0, 0.85]);
  const borderOpacity = useTransform(scrollY, [0, 80], [0, 0.08]);

  return (
    <motion.header
      className="fixed inset-x-0 top-0 z-50 backdrop-blur-md"
      style={{
        backgroundColor: useTransform(
          bgOpacity,
          (v) => `rgba(250, 250, 248, ${v})`,
        ),
        borderBottom: "1px solid",
        borderColor: useTransform(
          borderOpacity,
          (v) => `rgba(10, 10, 10, ${v})`,
        ),
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" aria-label="UPay — home" data-cursor="grow">
          <BrandMark />
        </Link>

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-10 text-sm text-ink-700">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="transition-colors hover:text-ink-900"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <MagneticCta href={SITE.whatsappLink} target="_blank" rel="noopener">
          Try UPay
        </MagneticCta>
      </div>
    </motion.header>
  );
}
