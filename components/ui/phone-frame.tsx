import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface PhoneFrameProps {
  children: ReactNode;
  className?: string;
}

/**
 * PhoneFrame
 *
 * Realistic phone bezel for hero and section mockups. Uses a darker bezel
 * than the previous version and tighter radii to feel more like a current-
 * generation iPhone. The notch is a single pill at the top.
 *
 * Width is fixed at 280px — large enough that text inside reads clearly,
 * narrow enough not to dominate the layout. Aspect lock to 9:19 keeps
 * proportions correct on any container.
 */
export function PhoneFrame({ children, className }: PhoneFrameProps) {
  return (
    <div
      className={cn(
        "relative mx-auto aspect-[9/19] w-[280px] rounded-[3rem] bg-ink-900 p-[10px] shadow-[0_40px_80px_-20px_rgba(10,10,10,0.45),0_0_0_1px_rgba(0,0,0,0.6)]",
        className,
      )}
    >
      {/* Side button details */}
      <div className="absolute -left-[3px] top-24 h-12 w-[3px] rounded-l-full bg-ink-700" />
      <div className="absolute -left-[3px] top-40 h-16 w-[3px] rounded-l-full bg-ink-700" />
      <div className="absolute -right-[3px] top-32 h-20 w-[3px] rounded-r-full bg-ink-700" />

      <div className="relative h-full w-full overflow-hidden rounded-[2.4rem] bg-surface-100">
        {/* Notch — single pill, modern shape */}
        <div className="absolute left-1/2 top-2 z-20 flex h-7 w-28 -translate-x-1/2 items-center justify-center rounded-full bg-ink-900">
          <div className="ml-8 h-1.5 w-1.5 rounded-full bg-ink-700" />
        </div>
        {children}
      </div>
    </div>
  );
}
