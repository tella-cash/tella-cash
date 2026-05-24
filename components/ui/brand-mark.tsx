import logo from "@/public/logo.svg"
import Image from "next/image";

export function BrandMark() {
  return (
    <div className="flex items-center gap-1">
      <Image src={logo} alt="Tella Logo" />
      <span className="font-works text-2xl leading-none tracking-tight text-[#0057FF]">
        Tella
      </span>
    </div>
  );
}
