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

  return (
    <span ref={ref}>
      <a
        {...props}
        data-cursor="grow"
        className={cn(
          "gap-2 rounded-md px-3 py-2 md:px-6 md:py-3.5 text-sm md:text-base font-medium bg-[#0057FF]",
          className,
        )}
      >
        {children}
      </a>
    </span>
  );
}
