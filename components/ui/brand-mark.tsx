import logo from "@/public/logo.svg"
import Image from "next/image";

export function BrandMark() {
  return (
    <div className="flex items-center gap-1.5">
      <Image src={logo} alt="Tella Logo" className="h-7 w-auto md:h-8" />
      <span className="font-works text-[26px] leading-none tracking-tight text-[#0057FF] md:text-[28px]">
        Tella
      </span>
    </div>
  );
}
