import Image, { type StaticImageData } from "next/image";
import checkIcon from "@/public/figma/how-it-works/check.svg";
import coinsSwapIcon from "@/public/figma/how-it-works/coins-swap.svg";
import globeIcon from "@/public/figma/how-it-works/globe.svg";
import telegramTrustIcon from "@/public/figma/how-it-works/telegram-trust.svg";
import whatsappTrustIcon from "@/public/figma/how-it-works/whatsapp-trust.svg";
import { MessagingPlatformDemo } from "@/components/illustrations/messaging-platform-demo";

interface TrustItem {
  icon: StaticImageData;
  iconSize: 18 | 20;
  label: string;
}

const trustItems: TrustItem[] = [
  { icon: globeIcon, iconSize: 18, label: "Global USDC payments" },
  { icon: coinsSwapIcon, iconSize: 18, label: "Naira offramp" },
  { icon: whatsappTrustIcon, iconSize: 20, label: "WhatsApp-native" },
  { icon: telegramTrustIcon, iconSize: 20, label: "Telegram" },
  { icon: checkIcon, iconSize: 18, label: "Simple transaction flow" },
];

export function HowItWorksSection() {
  return (
    <section
      id="features"
      className="scroll-mt-[104px] bg-white font-geist"
    >
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-7">
        <h2 className="text-center text-[26px] font-medium leading-[34px] text-black sm:text-[30px] sm:leading-[38px]">
          Built For Borderless Digital-Dollar Payments
        </h2>
        <div className="flex w-full flex-wrap items-center justify-center gap-3 lg:px-[72px]">
          {trustItems.map((item) => (
            <div key={item.label} className="flex items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-[#e5e7eb] bg-white">
                <Image
                  src={item.icon}
                  alt=""
                  width={item.iconSize}
                  height={item.iconSize}
                />
              </span>
              <span className="whitespace-nowrap text-sm font-semibold text-[#111827]">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 pb-10 sm:px-8 lg:px-10">
        <div className="flex w-full flex-col items-center justify-center gap-6 rounded-[32px] bg-[#e6eeff] px-4 py-7 sm:px-10 lg:rounded-[47px]">
          <div className="flex w-full max-w-[636px] flex-col items-center gap-2 text-center text-black">
            <h3 className="text-[32px] font-medium leading-10 tracking-[-0.72px] sm:text-4xl sm:leading-[44px]">
              How it works
            </h3>
            <p className="text-base leading-6">
              From message to money in seconds. Send, receive, and track
              stablecoins from WhatsApp or Telegram using simple natural language.
            </p>
          </div>

          <MessagingPlatformDemo />
        </div>
      </div>
    </section>
  );
}
