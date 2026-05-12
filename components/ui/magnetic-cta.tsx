"use client";

import type { ComponentProps } from "react";
import { useMagnetic } from "@/lib/hooks/use-magnetic";
import { cn } from "@/lib/utils/cn";

type MagneticCtaProps = ComponentProps<"a"> & {
  variant?: "primary" | "ghost";
};

export function MagneticCta({
  variant = "primary",
  className,
  children,
  ...props
}: MagneticCtaProps) {
  const ref = useMagnetic<HTMLSpanElement>({ strength: 18, radius: 100 });

  const variantClass =
    variant === "primary"
      ? "bg-[#0057FF] text-white hover:bg-[#0057FF99]"
      : "bg-transparent text-ink-900 ring-1 ring-ink-200 hover:ring-ink-900";

  return (
    <span ref={ref} className="inline-block">
      <a
        {...props}
        data-cursor="grow"
        className={cn(
          "group relative inline-flex items-center gap-2 rounded-md px-6 py-3.5 text-sm font-medium tracking-tight transition-colors duration-300",
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
