import type { ReactNode } from "react";
import Image, { type StaticImageData } from "next/image";
import amaraDotIcon from "@/public/figma/core-features/amara-dot.svg";
import arrowDownConvertIcon from "@/public/figma/core-features/arrow-down-convert.svg";
import arrowDownIcon from "@/public/figma/core-features/arrow-down.svg";
import arrowRightIcon from "@/public/figma/core-features/arrow-right.svg";
import bellIcon from "@/public/figma/core-features/bell.svg";
import chevronRightIcon from "@/public/figma/core-features/chevron-right.svg";
import coinsSwapIcon from "@/public/figma/core-features/coins-swap.svg";
import connectorLine from "@/public/figma/core-features/connector-line.svg";
import routeDashedLine from "@/public/figma/core-features/route-dashed.png";
import sendIcon from "@/public/figma/core-features/send.svg";
import successPulseIcon from "@/public/figma/core-features/success-pulse.svg";
import walletIcon from "@/public/figma/core-features/wallet.svg";
import youDotIcon from "@/public/figma/core-features/you-dot.svg";

interface FeatureCardProps {
  eyebrow: string;
  icon: StaticImageData;
  iconTone: "blue" | "green";
  title: string;
  description: string;
  children: ReactNode;
}

function FeatureCard({
  eyebrow,
  icon,
  iconTone,
  title,
  description,
  children,
}: FeatureCardProps) {
  return (
    <article className="flex h-[440px] w-full max-w-[380px] flex-col gap-7 overflow-hidden rounded-3xl border border-[#1f2633] bg-[#13171f] p-8 shadow-[0_16px_32px_-8px_rgba(0,0,0,0.25)]">
      <div className="flex w-full items-center justify-between">
        <p className="whitespace-nowrap text-xs font-bold uppercase tracking-[2px] text-[#8a94a6]">
          {eyebrow}
        </p>
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-[10px] ${
            iconTone === "blue" ? "bg-[#0057ff]/[0.13]" : "bg-[#25d366]/[0.13]"
          }`}
        >
          <Image src={icon} alt="" width={16} height={16} />
        </span>
      </div>

      {children}

      <div className="flex flex-1 flex-col justify-end gap-1">
        <h3 className="text-lg font-medium text-white">{title}</h3>
        <p className="text-[13px] text-[#8a94a6]">{description}</p>
      </div>
    </article>
  );
}

export function SecuritySection() {
  return (
    <section
      id="security"
      className="scroll-mt-[104px] bg-[#0d0f12] px-4 py-16 font-geist sm:px-8 lg:p-20"
    >
      <div className="mx-auto flex max-w-[820px] flex-col items-center gap-10">
        <div className="flex w-full flex-col items-center gap-3 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.28px] text-[#6b7280]">
            Core features
          </p>
          <h2 className="max-w-[820px] text-[40px] font-semibold leading-[1.1] tracking-[-0.96px] text-white sm:text-5xl">
            Send money like you send a message.
          </h2>
        </div>

        <div className="grid w-full justify-items-center gap-10 md:grid-cols-2">
          <FeatureCard
            eyebrow="Send globally"
            icon={sendIcon}
            iconTone="blue"
            title="USDC without borders."
            description="Instant global settlements, direct via chat."
          >
            <div className="flex w-full flex-col gap-4 overflow-hidden rounded-2xl bg-[#1a202c] p-5">
              <div className="flex h-[70px] w-full items-center justify-between">
                <div className="flex flex-col items-center gap-1.5">
                  <Image src={youDotIcon} alt="" width={12} height={12} />
                  <span className="text-[11px] font-semibold text-[#8a94a6]">
                    YOU
                  </span>
                </div>

                <div className="relative h-full min-w-0 flex-1">
                  <Image
                    src={connectorLine}
                    alt=""
                    width={212}
                    height={2}
                    className="absolute left-1/2 top-[31px] max-w-none -translate-x-1/2"
                  />
                  <span className="absolute left-1/2 top-[31px] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[#0057ff] px-2.5 py-1 text-xs font-bold text-white">
                    250 USDC
                  </span>
                </div>

                <div className="flex flex-col items-center gap-1.5">
                  <Image src={amaraDotIcon} alt="" width={12} height={12} />
                  <span className="text-[11px] font-semibold text-[#8a94a6]">
                    AMARA
                  </span>
                </div>
              </div>

              <div className="flex w-full items-center justify-between pt-2">
                <span className="text-[13px] font-semibold text-white">Lagos</span>
                <span className="relative h-px min-w-0 flex-1">
                  <Image
                    src={routeDashedLine}
                    alt=""
                    fill
                    sizes="90px"
                    className="object-fill"
                  />
                </span>
                <Image src={chevronRightIcon} alt="" width={12} height={12} />
                <span className="relative h-px min-w-0 flex-1">
                  <Image
                    src={routeDashedLine}
                    alt=""
                    fill
                    sizes="90px"
                    className="object-fill"
                  />
                </span>
                <span className="text-[13px] font-semibold text-white">London</span>
              </div>
            </div>
          </FeatureCard>

          <FeatureCard
            eyebrow="Receive USDC"
            icon={bellIcon}
            iconTone="green"
            title="Get paid anywhere."
            description="Receive funds instantly with just a telephone number."
          >
            <div className="flex w-full flex-col gap-4 rounded-2xl bg-[#1a202c] p-5">
              <div className="flex w-full items-center justify-between">
                <span className="flex items-center gap-1 rounded-md bg-[#25d366]/[0.08] px-2 py-1 text-[10px] font-bold tracking-[0.5px] text-[#25d366]">
                  <Image src={arrowDownIcon} alt="" width={10} height={10} />
                  INCOMING
                </span>
                <span className="text-[11px] text-[#4e5866]">Just now</span>
              </div>
              <div className="flex flex-col gap-1">
                <p className="whitespace-nowrap text-[32px] font-medium text-white">
                  +500 USDC
                </p>
                <p className="text-sm text-[#8a94a6]">From David A.</p>
              </div>
              <div className="flex items-center gap-1.5 pt-2">
                <Image src={successPulseIcon} alt="" width={6} height={6} />
                <span className="text-xs font-semibold text-[#25d366]">
                  Payment received ✓
                </span>
              </div>
            </div>
          </FeatureCard>

          <FeatureCard
            eyebrow="Available balance"
            icon={walletIcon}
            iconTone="green"
            title="Ready to move."
            description="Your balance is available for sending or converting."
          >
            <div className="flex w-full flex-col rounded-2xl bg-[#1a202c] p-5">
              <p className="whitespace-nowrap text-[32px] font-medium text-white">
                $2,480.00
              </p>
              <p className="mt-1 text-sm text-[#8a94a6]">2,480 USDC</p>
            </div>
          </FeatureCard>

          <FeatureCard
            eyebrow="USDC → Naira"
            icon={coinsSwapIcon}
            iconTone="blue"
            title="Convert your USDC to Naira."
            description="Swap instantly and settle to your bank account."
          >
            <div className="flex w-full flex-col gap-4 rounded-2xl bg-[#1a202c] p-5">
              <div className="flex w-full items-center gap-3">
                <span className="whitespace-nowrap rounded-full bg-[#0057ff]/[0.08] px-2.5 py-1.5 text-xs font-bold text-[#0057ff]">
                  500 USDC
                </span>
                <Image src={arrowRightIcon} alt="" width={16} height={16} />
                <span className="whitespace-nowrap rounded-full bg-[#25d366]/[0.08] px-2.5 py-1.5 text-xs font-bold text-[#25d366]">
                  ₦ 1,250,000
                </span>
              </div>
              <div className="flex h-7 w-full items-center justify-center">
                <Image
                  src={arrowDownConvertIcon}
                  alt=""
                  width={16}
                  height={16}
                />
              </div>
              <div className="flex items-center gap-2 whitespace-nowrap font-semibold">
                <span className="text-xs text-[#8a94a6]">Bank</span>
                <span className="text-[13px] text-white">GTBank •••• 2481</span>
              </div>
            </div>
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}
