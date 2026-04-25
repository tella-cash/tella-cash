import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface PhoneFrameProps {
  /** Content rendered inside the phone screen — typically a chat mockup. */
  children: ReactNode;
  /** Background color of the phone screen interior. WhatsApp-ish cream by default. */
  screenClassName?: string;
  /** Additional classes for the outer phone shell. */
  className?: string;
}

/**
 * PhoneFrame
 *
 * Pure-CSS phone bezel. We avoid PNG mockups so the page stays sharp at any
 * size and theme tweaks propagate everywhere. The bezel uses two layered
 * rounded boxes plus a notch pill at the top.
 *
 * Children are placed inside the screen with overflow hidden, so chat mock
 * components can flow naturally without worrying about clipping.
 */
export function PhoneFrame({
  children,
  screenClassName,
  className,
}: PhoneFrameProps) {
  return (
    <div
      className={cn(
        "relative mx-auto aspect-[9/19] w-[260px] rounded-[2.5rem] bg-ink-900 p-2 shadow-[0_30px_60px_-20px_rgba(13,61,39,0.45)]",
        "ring-1 ring-black/40",
        className,
      )}
    >
      {/* Side button details for realism */}
      <div className="absolute -left-[3px] top-24 h-12 w-[3px] rounded-l-full bg-ink-700" />
      <div className="absolute -left-[3px] top-40 h-16 w-[3px] rounded-l-full bg-ink-700" />
      <div className="absolute -right-[3px] top-32 h-20 w-[3px] rounded-r-full bg-ink-700" />

      {/* Screen */}
      <div
        className={cn(
          "relative h-full w-full overflow-hidden rounded-[2rem]",
          screenClassName ?? "bg-cream-100",
        )}
      >
        {/* Notch */}
        <div className="absolute left-1/2 top-2 z-20 flex h-6 w-24 -translate-x-1/2 items-center justify-center rounded-full bg-ink-900">
          <div className="h-1.5 w-1.5 rounded-full bg-ink-700" />
        </div>
        {children}
      </div>
    </div>
  );
}
