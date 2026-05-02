"use client";

import type { ComponentProps } from "react";
import { useMagnetic } from "@/lib/hooks/use-magnetic";
import { cn } from "@/lib/utils/cn";

type MagneticCtaProps = ComponentProps<"a"> & {
  variant?: "primary" | "ghost";
};

/**
 * MagneticCta
 *
 * The page's primary call-to-action. Inherits all the styling of the old
 * CtaButton but adds magnetic pull toward the cursor. Wraps the visible
 * button in an outer span that gets the magnetic transform applied,
 * leaving the button itself free to handle hover styling.
 *
 * Two-element structure is intentional: applying transform directly to the
 * button would conflict with hover-state transforms (e.g. translating the
 * arrow on hover). Outer span moves; inner button styles.
 */
export function MagneticCta({
  variant = "primary",
  className,
  children,
  ...props
}: MagneticCtaProps) {
  const ref = useMagnetic<HTMLSpanElement>({ strength: 18, radius: 100 });

  const variantClass =
    variant === "primary"
      ? "bg-ink-900 text-surface-50 hover:bg-accent-500"
      : "bg-transparent text-ink-900 ring-1 ring-ink-200 hover:ring-ink-900";

  return (
    <span ref={ref} className="inline-block">
      <a
        {...props}
        data-cursor="grow"
        className={cn(
          "group relative inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-medium tracking-tight transition-colors duration-300",
          variantClass,
          className,
        )}
      >
        <span>{children}</span>
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
    </span>
  );
}
