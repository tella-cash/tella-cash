import Image from "next/image";
import logo from "@/public/figma/hero/tella.svg";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex w-[110px] items-center gap-[3px] rounded-3xl ${compact ? "h-10" : ""}`}>
      <span className={`grid shrink-0 place-items-center ${compact ? "size-8" : "size-12"}`}>
        <Image src={logo} alt="" width={32} height={32} />
      </span>
      <span className={`font-geist font-normal leading-[30px] text-[#0057ff] ${compact ? "text-xl tracking-[-0.08px]" : "text-2xl tracking-[-0.096px]"}`}>
        Tella
      </span>
    </div>
  );
}
