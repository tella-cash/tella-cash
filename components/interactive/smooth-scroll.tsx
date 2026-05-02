"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Lenis from "lenis";

interface SmoothScrollProps {
  children: ReactNode;
}

/**
 * SmoothScroll
 *
 * Wraps the page in Lenis for momentum-based smooth scrolling. The native
 * scroll feels instant and abrupt; Lenis adds inertia so the page glides
 * to a stop after you flick. Works with both wheel and touchpad input,
 * gracefully degrades on touch (Lenis disables itself on iOS where native
 * momentum is already excellent).
 *
 * The instance is exposed on `window.__lenis` so anchor-link helpers and
 * Framer Motion's useScroll can read scroll position from the same source
 * of truth. Without this, anchor jumps would bypass Lenis and feel jarring.
 */
export function SmoothScroll({ children }: SmoothScrollProps) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      // easeOutExpo — slow finish, snappy start
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.5,
    });

    lenisRef.current = lenis;
    // @ts-expect-error — we attach to window for global access from anchors
    window.__lenis = lenis;

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    const handle = requestAnimationFrame(raf);

    // Intercept anchor clicks and route them through Lenis so jumps animate.
    function handleAnchor(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("#")) return;
      const el = document.querySelector(href);
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el as HTMLElement, { offset: -80 });
    }
    document.addEventListener("click", handleAnchor);

    return () => {
      cancelAnimationFrame(handle);
      document.removeEventListener("click", handleAnchor);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  return <>{children}</>;
}
