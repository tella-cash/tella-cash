"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Reveal } from "@/components/interactive/reveal";
import { PhoneFrame } from "@/components/ui/phone-frame";
import { cn } from "@/lib/utils/cn";
import logo from "@/public/logo.svg";

interface UseCase {
  id: string;
  label: string;
  amount: string;
  sentLabel: string;
  photos: [PhotoCard, PhotoCard];
  messages: Message[];
}

interface PhotoCard {
  title: string;
  subtitle: string;
  src: string;
  placement: string;
  objectPosition?: string;
}

interface Message {
  side: "in" | "out";
  text: string;
  time: string;
  receipt?: {
    status: string;
    amount: string;
    detail: string;
  };
}

const USE_CASES: UseCase[] = [
  {
    id: "freelance",
    label: "Freelancers",
    amount: "$1,200",
    sentLabel: "invoice paid",
    photos: [
      {
        title: "Client call",
        subtitle: "Remote work",
        src: "/Images/Freelancer 1.png",
        placement: "left-0 top-[330px] h-[250px] w-[246px] lg:left-[5%] lg:top-[330px] lg:h-[321px] lg:w-[307px]",
        objectPosition: "object-center",
      },
      {
        title: "Studio desk",
        subtitle: "Paid today",
        src: "/Images/Freelancer 2.png",
        placement: "right-2 top-20 h-[230px] w-[220px] lg:right-[7%] lg:top-0 lg:h-[321px] lg:w-[307px]",
        objectPosition: "object-center",
      },
    ],
    messages: [
      { side: "out", text: "Invoice Nova Studio for 1200 USDC", time: "10:14" },
      { side: "in", text: "Invoice ready. Send payment link to Nova Studio?", time: "10:14" },
      { side: "out", text: "yes", time: "10:15" },
      {
        side: "in",
        text: "Payment received.",
        time: "10:42",
        receipt: {
          status: "Paid",
          amount: "$1,200",
          detail: "from Nova Studio",
        },
      },
    ],
  },
  {
    id: "night-out",
    label: "Night Out",
    amount: "$32",
    sentLabel: "split settled",
    photos: [
      {
        title: "Dinner table",
        subtitle: "Five friends",
        src: "/Images/nightout.jpg",
        placement: "right-0 top-[330px] h-[250px] w-[246px] lg:right-[4%] lg:top-[342px] lg:h-[321px] lg:w-[307px]",
        objectPosition: "object-center",
      },
      {
        title: "Late receipt",
        subtitle: "Share paid",
        src: "/Images/nightout 1.jpg",
        placement: "left-2 top-16 h-[230px] w-[220px] lg:left-[8%] lg:top-4 lg:h-[300px] lg:w-[286px]",
        objectPosition: "object-center",
      },
    ],
    messages: [
      { side: "out", text: "Split dinner with Tobi, Ada, and Kunle", time: "21:08" },
      { side: "in", text: "Total bill is 128 USDC. Everyone pays 32 USDC.", time: "21:08" },
      { side: "out", text: "send my share now", time: "21:09" },
      {
        side: "in",
        text: "Your share is settled.",
        time: "21:09",
        receipt: {
          status: "Sent",
          amount: "$32",
          detail: "to dinner split",
        },
      },
    ],
  },
  {
    id: "families",
    label: "Families",
    amount: "$300",
    sentLabel: "family support",
    photos: [
      {
        title: "Home errand",
        subtitle: "Sent to sibling",
        src: "/Images/families 1.jpg",
        placement: "left-3 top-20 h-[240px] w-[228px] lg:left-[12%] lg:top-[52px] lg:h-[321px] lg:w-[307px]",
        objectPosition: "object-center",
      },
      {
        title: "Weekend visit",
        subtitle: "Balance clear",
        src: "/Images/families 2.jpg",
        placement: "right-0 top-[380px] h-[240px] w-[228px] lg:right-[8%] lg:top-[332px] lg:h-[310px] lg:w-[300px]",
        objectPosition: "object-center",
      },
    ],
    messages: [
      { side: "out", text: "Send 300 USDC to Amara for school fees", time: "08:31" },
      { side: "in", text: "Sending 300 USDC to Amara Okeke. Confirm?", time: "08:31" },
      { side: "out", text: "confirm", time: "08:32" },
      {
        side: "in",
        text: "Transfer complete.",
        time: "08:32",
        receipt: {
          status: "Sent",
          amount: "$300",
          detail: "to Amara Okeke",
        },
      },
    ],
  },
  {
    id: "small-business",
    label: "Small business Owners",
    amount: "$450",
    sentLabel: "vendor paid",
    photos: [
      {
        title: "Shop counter",
        subtitle: "Vendor day",
        src: "/Images/small business owner 1.jpg",
        placement: "right-4 top-12 h-[240px] w-[230px] lg:right-[13%] lg:top-[18px] lg:h-[321px] lg:w-[307px]",
        objectPosition: "object-center",
      },
      {
        title: "Stock run",
        subtitle: "Receipt logged",
        src: "/Images/small business owner 2.jpg",
        placement: "left-0 top-[392px] h-[240px] w-[230px] lg:left-[6%] lg:top-[360px] lg:h-[310px] lg:w-[300px]",
        objectPosition: "object-center",
      },
    ],
    messages: [
      { side: "out", text: "Pay 450 USDC to Ayo Supplies", time: "15:26" },
      { side: "in", text: "Ayo Supplies is in your saved vendors. Send 450 USDC?", time: "15:26" },
      { side: "out", text: "yes and save receipt", time: "15:27" },
      {
        side: "in",
        text: "Vendor paid and receipt saved.",
        time: "15:27",
        receipt: {
          status: "Paid",
          amount: "$450",
          detail: "to Ayo Supplies",
        },
      },
    ],
  },
];

export function UseCasesSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeCase = USE_CASES[activeIndex];

  useEffect(() => {
    const timeout = setTimeout(() => {
      setActiveIndex((current) => (current + 1) % USE_CASES.length);
    }, 15_000);

    return () => clearTimeout(timeout);
  }, [activeIndex]);

  return (
    <section id="use-cases" className="relative overflow-hidden bg-white px-3 py-10 sm:px-[72px]">
      <div className="mx-auto max-w-[1296px]">
        <Reveal>
          <div className="flex flex-col items-center gap-4 text-center">
            <div>
              <h2 className="text-2xl font-medium leading-8 text-black md:text-[36px] md:leading-[44px] md:tracking-[-0.02em]">
                Move money directly from chat
              </h2>
              <p className="mt-2 text-sm leading-5 text-black md:text-xl md:leading-[30px]">
                How Tellecash becomes part of everyday life
              </p>
            </div>

            <div
              className="flex w-full max-w-full flex-wrap content-start items-start gap-2.5 rounded-xl bg-[#F5F5F5] p-2 md:w-auto md:flex-nowrap md:gap-1 md:overflow-x-auto"
              role="tablist"
              aria-label="Use case examples"
            >
              {USE_CASES.map((useCase, index) => {
                const isActive = index === activeIndex;

                return (
                  <button
                    key={useCase.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`use-case-panel-${useCase.id}`}
                    className={cn(
                      "shrink-0 rounded-lg p-3 text-sm leading-5 text-black transition-colors md:px-4 md:py-2 md:text-xl md:leading-[30px]",
                      isActive ? "bg-white shadow-soft" : "hover:bg-white/60",
                    )}
                    onClick={() => setActiveIndex(index)}
                  >
                    {useCase.label}
                  </button>
                );
              })}
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div
            id={`use-case-panel-${activeCase.id}`}
            role="tabpanel"
            className="relative mt-5 flex min-h-[760px] items-center justify-center py-[60px] sm:mt-12 lg:min-h-[700px]"
          >
            {activeCase.photos.map((photo, index) => (
              <PersonaPhoto
                key={`${activeCase.id}-${photo.title}`}
                photo={photo}
                index={index}
              />
            ))}

            <div className="relative z-10">
              <PhoneFrame className="!w-[303px]">
                <ChatSurface useCase={activeCase} />
              </PhoneFrame>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function PersonaPhoto({ photo, index }: { photo: PhotoCard; index: number }) {
  const mobilePlacement =
    index === 0
      ? "left-[-8px] top-[630px] h-[126px] w-[120px]"
      : "left-[253px] top-[-13px] h-[124px] w-[118px]";
  const desktopPlacement =
    index === 0
      ? "lg:left-[14px] lg:top-[383px] lg:h-[321px] lg:w-[307px]"
      : "lg:left-[959px] lg:top-0 lg:h-[321px] lg:w-[307px]";

  return (
    <div
      className={cn(
        "absolute z-20 rounded-[6px] bg-[#F5F5F5] p-[3px] shadow-soft transition-all duration-700 md:z-0 md:rounded-2xl md:p-2",
        mobilePlacement,
        desktopPlacement,
      )}
      aria-label={`${photo.title}: ${photo.subtitle}`}
      role="img"
    >
      <div className="relative h-full w-full overflow-hidden rounded-[5px] bg-[#F5F5F5] md:rounded-xl">
        <Image
          src={photo.src}
          alt={`${photo.title} - ${photo.subtitle}`}
          fill
          sizes="(min-width: 1024px) 307px, (min-width: 768px) 246px, 120px"
          className={cn("object-cover", photo.objectPosition)}
        />
        <div className="absolute inset-x-4 bottom-4 hidden rounded-lg bg-white/80 p-3 backdrop-blur-sm md:block">
          <p className="text-sm font-medium leading-5 text-black">{photo.title}</p>
          <p className="text-xs leading-4 text-ink-500">{photo.subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function ChatSurface({ useCase }: { useCase: UseCase }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 bg-[#1F2C34] px-2.5 pb-2.5 pt-12 text-white">
        <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-white">
          <Image src={logo} alt="Tella" width={20} height={20} />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1">
            <p className="text-[14px] font-semibold">Tella</p>
            <span className="h-3 w-3 rounded-full bg-emerald-500" />
          </div>
          <p className="text-[10px] text-white/60">{useCase.label}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-end gap-2 overflow-hidden bg-[url('/whatsapp-bg.png')] bg-cover bg-center p-3">
        {useCase.messages.map((message) => (
          <ChatMessage key={`${useCase.id}-${message.time}-${message.text}`} message={message} />
        ))}
      </div>
    </div>
  );
}

function ChatMessage({ message }: { message: Message }) {
  const isOutgoing = message.side === "out";

  return (
    <div className={cn("flex", isOutgoing ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[84%] rounded-2xl px-3 py-2 text-[11px] leading-snug shadow-sm",
          isOutgoing
            ? "rounded-br-md bg-[#0057FF] text-white"
            : "rounded-bl-md bg-white text-ink-900",
        )}
      >
        <p>{message.text}</p>
        {message.receipt && (
          <div className="mt-2 rounded-xl bg-[#F5F5F5] p-2 text-ink-900">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[9px] font-medium uppercase tracking-wider text-ink-500">
                {message.receipt.status}
              </span>
              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-medium text-emerald-700">
                Confirmed
              </span>
            </div>
            <p className="mt-1 text-xl leading-none text-black">
              {message.receipt.amount}
            </p>
            <p className="mt-1 text-[10px] text-ink-500">
              {message.receipt.detail}
            </p>
          </div>
        )}
        <p className={cn("mt-1 text-right text-[9px]", isOutgoing ? "text-white/70" : "text-ink-400")}>
          {message.time}
          {isOutgoing && <span className="ml-1">✓✓</span>}
        </p>
      </div>
    </div>
  );
}
