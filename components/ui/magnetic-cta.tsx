"use client";

import type { ComponentProps } from "react";
import { useMagnetic } from "@/lib/hooks/use-magnetic";
import { cn } from "@/lib/utils/cn";

// The `variant?: "primary" | "ghost"` prop was removed. It was accepted and
// defaulted but never read — the styling below is hardcoded — so a caller
// passing variant="ghost" would silently get a primary button. No caller
// passed it. Better to not offer the option than to offer a fake one; if a
// ghost style is wanted, add it here and reintroduce the prop for real.
type MagneticCtaProps = ComponentProps<"a">;

export function MagneticCta({
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
          "gap-2 rounded-md px-3 py-2 md:px-6 md:py-3.5 text-sm md:text-base text-white font-medium bg-[#0057FF]",
          className,
        )}
      >
        {children}
      </a>
    </span>
  );
}
