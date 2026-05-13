import type { ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils/cn";
import cellularIcon from "@/public/icons/Cellular.svg";
import wifiIcon from "@/public/icons/Wifi.svg";
import batteryIcon from "@/public/icons/Battery.svg";

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
          <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex h-6 items-center justify-between bg-[#1F2C34] px-4 text-[11px] font-semibold text-white">
            <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            <div className="flex items-center gap-[7px]">
              <Image src={cellularIcon} alt="Cellular signal" className="h-3 w-auto" />
              <Image src={wifiIcon} alt="Wi-Fi" className="h-3 w-auto" />
              <Image src={batteryIcon} alt="Battery 100%" className="h-3 w-auto" />
            </div>
          </div>

          {/* Screen content — fills the entire display so the chat bg reaches the bottom */}
          <div className="h-full">{children}</div>

          {/* iOS home indicator — floats over the screen content */}
          <div className="pointer-events-none absolute inset-x-0 bottom-1.5 z-20 flex items-center justify-center">
            <span className="block h-[3px] w-20 rounded-full bg-white" />
          </div>
        </div>
      </div>
    </div>
  );
}
