import Image from "next/image";
import { SITE } from "@/lib/data/site";
import arrowRightIcon from "@/public/figma/hero/arrow-right.svg";
import currencyIcon from "@/public/figma/hero/currency.svg";
import heroPhone from "@/public/figma/hero/hero-phone.png";
import lightningIcon from "@/public/figma/hero/lightning.svg";
import lightningYellowIcon from "@/public/figma/hero/lightning-yellow.svg";
import lockIcon from "@/public/figma/hero/lock.svg";
import telegramIcon from "@/public/figma/hero/telegram.svg";
import whatsappIcon from "@/public/figma/hero/whatsapp.svg";

const trustItems = [
  { icon: lockIcon, label: "End to end encrypted" },
  { icon: currencyIcon, label: "USDC native" },
  { icon: lightningIcon, label: "Sub-second finality" },
] as const;

export function Hero() {
  return (
    <section className="min-h-[calc(100svh-72px)] bg-white px-4 pb-10 pt-8 font-geist sm:px-8 sm:pt-10 lg:px-[72px] lg:pb-4 lg:pt-0">
      <div className="mx-auto grid max-w-[1344px] gap-8 lg:h-[clamp(520px,calc(100svh-88px),770px)] lg:grid-cols-2">
        <div className="flex items-center">
          <div className="w-full">
            <div className="max-w-[632px]">
              <h1 className="text-[40px] font-semibold leading-[1.12] tracking-[-0.96px] text-black sm:text-[48px] sm:leading-[60px]">
                Stablecoin payments, as simple as a message
              </h1>
              <p className="mt-4 text-base leading-7 text-black sm:text-xl sm:leading-[30px]">
                Send, receive, and manage stablecoins directly in WhatsApp
                {SITE.telegramLink ? " or Telegram" : ""}. No apps. No learning
                curve. Just type.
              </p>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-4 sm:mt-14">
              <a
                href={SITE.whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                data-cursor="grow"
                className="flex items-center justify-center gap-2 rounded-full bg-[#0057ff] p-4 text-base leading-6 text-white transition-colors hover:bg-[#004de0]"
              >
                <Image src={whatsappIcon} alt="" width={24} height={24} />
                <span>Start on WhatsApp</span>
              </a>
              {SITE.telegramLink && (
                <a
                  href={SITE.telegramLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor="grow"
                  className="flex items-center justify-center gap-2 rounded-full bg-black p-4 text-base leading-6 text-white transition-colors hover:bg-[#262626]"
                >
                  <Image
                    src={telegramIcon}
                    alt=""
                    width={24}
                    height={24}
                    className="brightness-0 invert"
                  />
                  <span>Start on Telegram</span>
                </a>
              )}
              <a
                href="#features"
                data-cursor="grow"
                className="flex items-center justify-center gap-2 p-2.5 text-base leading-6 text-black transition-opacity hover:opacity-60"
              >
                <span>See how it works</span>
                <Image src={arrowRightIcon} alt="" width={24} height={24} />
              </a>
            </div>

            {SITE.telegramLink && (
              <p className="mt-4 text-sm leading-6 text-black/60">
                Same wallet either way, nothing to reconnect.
              </p>
            )}

            <div className="mt-12 flex flex-wrap items-center gap-4 text-base leading-6 text-black">
              {trustItems.map((item) => (
                <span key={item.label} className="flex items-center gap-2">
                  <Image src={item.icon} alt="" width={24} height={24} />
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-h-[620px] items-center justify-center overflow-hidden rounded-[32px] bg-[#fafafa] sm:min-h-[700px] lg:h-full lg:min-h-0 lg:rounded-[44px]">
          <div className="flex w-[280px] flex-col items-center gap-1 sm:w-[323px] lg:w-[clamp(230px,35vh,280px)]">
            <div className="relative aspect-[564/1136] w-full overflow-hidden">
              <Image
                src={heroPhone}
                alt="Tella payment confirmation in WhatsApp"
                priority
                className="absolute left-[-120.04%] top-[-13.38%] h-[126.76%] w-[340.43%] max-w-none"
              />
            </div>
            <div className="flex w-[134px] items-center justify-center gap-2 rounded-[22px] border border-[#d2d2d2] bg-white p-2.5 text-base leading-6 text-black">
              <Image src={lightningYellowIcon} alt="" width={24} height={24} />
              <span className="whitespace-nowrap">Super- fast</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
