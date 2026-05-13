import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface PhoneFrameProps {
  children: ReactNode;
  className?: string;
}

export function PhoneFrame({ children, className }: PhoneFrameProps) {
  return (
    <div
      className={cn(
        "relative mx-auto aspect-[77.6/158] w-[300px] rounded-[3.2rem] p-[3px]",
        // Titanium brushed-metal gradient
        "[background:linear-gradient(135deg,#2e2e30_0%,#5d5d60_18%,#9c9c9f_38%,#cdcdd0_50%,#9c9c9f_62%,#5d5d60_82%,#2e2e30_100%)]",
        // Polished edge highlights + drop shadow + metallic aura halo
        "shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.35),inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-1px_0_rgba(0,0,0,0.5),0_40px_80px_-20px_rgba(10,10,10,0.55),0_0_0_1px_rgba(0,0,0,0.5),0_0_70px_-10px_rgba(190,195,200,0.45)]",
        className,
      )}
    >
      {/* Metallic side buttons — Pro Max layout */}
      {/* Left: Action button */}
      <div className="absolute -left-[3px] top-20 h-7 w-[3px] rounded-l-md [background:linear-gradient(90deg,#2e2e30_0%,#7a7a7d_60%,#3a3a3c_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]" />
      {/* Left: Volume up */}
      <div className="absolute -left-[3px] top-28 h-12 w-[3px] rounded-l-md [background:linear-gradient(90deg,#2e2e30_0%,#7a7a7d_60%,#3a3a3c_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]" />
      {/* Left: Volume down */}
      <div className="absolute -left-[3px] top-44 h-12 w-[3px] rounded-l-md [background:linear-gradient(90deg,#2e2e30_0%,#7a7a7d_60%,#3a3a3c_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]" />
      {/* Right: Side button */}
      <div className="absolute -right-[3px] top-32 h-20 w-[3px] rounded-r-md [background:linear-gradient(270deg,#2e2e30_0%,#7a7a7d_60%,#3a3a3c_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]" />
      {/* Right: Camera Control (new on iPhone 16 Pro) */}
      <div className="absolute -right-[3px] top-56 h-10 w-[3px] rounded-r-md [background:linear-gradient(270deg,#2e2e30_0%,#7a7a7d_60%,#3a3a3c_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]" />

      {/* Black bezel between titanium frame and display */}
      <div className="relative h-full w-full rounded-[3rem] bg-ink-900 p-[6px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.8)]">
        {/* Display */}
        <div className="relative h-full w-full overflow-hidden rounded-[2.5rem] bg-surface-100">
          {/* Dynamic Island */}
          <div className="pointer-events-none absolute left-1/2 top-2 z-30 h-6 w-16 -translate-x-1/2 rounded-full bg-ink-900">
            <span className="absolute right-2.5 top-1/2 block h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-ink-700" />
          </div>

          {/* iOS-style status bar — time on the left, signal/wifi/battery on the right */}
          <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex h-6 items-center justify-between px-5 text-[10px] font-semibold bg-black/40 text-ink-900">
            <span>{new Date().toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}</span>
            <div className="flex items-center gap-1.5">
              <svg viewBox="0 0 18 12" className="h-2.5 w-3.5 fill-current">
                <rect x="0" y="8" width="3" height="4" rx="0.5" />
                <rect x="5" y="5" width="3" height="7" rx="0.5" />
                <rect x="10" y="2" width="3" height="10" rx="0.5" />
                <rect x="15" y="0" width="3" height="12" rx="0.5" />
              </svg>
              <svg viewBox="0 0 16 12" className="h-2.5 w-3.5 fill-current">
                <path d="M8 11.2a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM4 7.5a5.6 5.6 0 0 1 8 0l-1 1a4.2 4.2 0 0 0-6 0l-1-1zM1.2 4.7a9.6 9.6 0 0 1 13.6 0l-1 1a8.2 8.2 0 0 0-11.6 0l-1-1z" />
              </svg>
              <div className="relative flex h-2.5 w-5 items-center rounded-[3px] border border-current p-[1px]">
                <span className="block h-full w-[80%] rounded-[1px] bg-current" />
                <span className="absolute -right-[2px] top-1/2 block h-1.5 w-[1px] -translate-y-1/2 rounded-r-sm bg-current" />
              </div>
            </div>
          </div>

          {/* Screen content — flex column reserves room for the input bar + home indicator */}
          <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1">{children}</div>

            {/* WhatsApp-style input bar */}
            <div className="flex items-center gap-1.5 border-t border-ink-200/50 bg-surface-50 px-2.5 py-2">
              <button
                type="button"
                aria-label="Attach"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-500"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4">
                  <path
                    d="M12 5v14M5 12h14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-2.5 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-ink-200/50">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-ink-400">
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                  />
                  <circle cx="9" cy="10.5" r="0.9" fill="currentColor" />
                  <circle cx="15" cy="10.5" r="0.9" fill="currentColor" />
                  <path
                    d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
                <span className="flex-1 truncate text-[10px] text-ink-400">
                  Message
                </span>
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-ink-400">
                  <path
                    d="M4 8.5h3l1.5-2h7L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                  />
                  <circle
                    cx="12"
                    cy="13.5"
                    r="3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                  />
                </svg>
              </div>

              <button
                type="button"
                aria-label="Record voice message"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#00A884] text-white shadow-sm"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5">
                  <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
                  <path
                    d="M6 11a6 6 0 0 0 12 0M12 17v3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              </button>
            </div>

            {/* iOS home indicator */}
            <div className="flex h-3 items-center justify-center bg-surface-50">
              <span className="block h-[3px] w-20 rounded-full bg-ink-900/80" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
