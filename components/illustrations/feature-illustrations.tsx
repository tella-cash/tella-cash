import type { ReactNode } from "react";
import Image from "next/image";
import { PhoneFrame } from "@/components/ui/phone-frame";
import logo from "@/public/logo.svg";

/**
 * Phone illustrations for the four feature sections. Each is a static
 * mockup (no animation) so the page doesn't have multiple competing
 * looping animations — only the hero loops. These show one frozen moment
 * of the product, chosen to communicate the feature at a glance.
 */

/** Shared chat surface — dark Tella/WhatsApp header + wallpaper message area. */
function ChatScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      {/* WhatsApp-style dark header */}
      <div className="flex items-center gap-2 bg-[#1F2C34] px-2.5 pb-2.5 pt-12 text-white">
        <button
          type="button"
          aria-label="Back"
          className="flex items-center gap-0.5 text-white"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5">
            <path
              d="M14 6l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <span className="text-[13px] font-medium">1</span>
        </button>

        <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-white">
          <Image src={logo} alt="Tella" width={20} height={20} />
        </div>

        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1">
            <p className="text-[14px] font-semibold">Tella</p>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0">
              <circle cx="12" cy="12" r="10" fill="#22C55E" />
              <path
                d="M8 12.2l2.6 2.6 5-5"
                stroke="white"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </div>
          <p className="text-[10px] text-white/60">Online</p>
        </div>

        <button
          type="button"
          aria-label="Video call"
          className="grid h-9 w-9 shrink-0 place-items-center text-white"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5">
            <rect
              x="2"
              y="6"
              width="14"
              height="12"
              rx="2"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            <path d="M22 7v10l-6-4v-2l6-4z" fill="currentColor" />
          </svg>
        </button>

        <button
          type="button"
          aria-label="Voice call"
          className="grid h-9 w-9 shrink-0 place-items-center text-white"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5">
            <path
              d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Messages on wallpaper */}
      <div className="flex flex-1 flex-col gap-2 overflow-hidden bg-[url('/whatsapp-bg.png')] bg-cover bg-center p-3">
        {children}
      </div>
    </div>
  );
}

function Bubble({
  side,
  children,
  time,
}: {
  side: "in" | "out";
  children: React.ReactNode;
  time: string;
}) {
  const isOut = side === "out";
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 text-[12px] leading-snug ${
          isOut
            ? "rounded-br-md bg-accent-500 text-white"
            : "rounded-bl-md bg-white text-ink-900"
        }`}
      >
        <div>{children}</div>
        <div
          className={`mt-0.5 text-right text-[9px] ${
            isOut ? "text-white/60" : "text-ink-400"
          }`}
        >
          {time}
          {isOut && <span className="ml-1">✓✓</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * SendIllustration — shows a transfer in progress with a confirmation card.
 */
export function SendIllustration() {
  return (
    <div className="relative mx-auto w-fit">
      <PhoneFrame>
        <ChatScreen>
          <Bubble side="out" time="11:02">
            cash out 25k to access bank
          </Bubble>
          <Bubble side="in" time="11:02">
            Cash out ₦25,000 to Access Bank ••1183? Reply yes to confirm.
          </Bubble>
          <Bubble side="out" time="11:03">
            yes
          </Bubble>
          <div className="flex justify-start">
            <div className="w-[82%] rounded-2xl rounded-bl-md bg-white p-3 shadow-sm ring-1 ring-ink-200/40">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
                  Cashed out
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700">
                  ✓ Confirmed
                </span>
              </div>
              <p className="mt-1.5 font-display text-2xl leading-none text-ink-900">
                ₦25,000
              </p>
              <p className="mt-1 text-[11px] text-ink-500">
                to Access Bank ••1183
              </p>
              <p className="mt-2 font-mono text-[9px] text-ink-300">
                tx_4P7M2N · 11:03
              </p>
            </div>
          </div>
        </ChatScreen>
      </PhoneFrame>
    </div>
  );
}

/**
 * BalanceIllustration — shows a balance breakdown card.
 */
export function BalanceIllustration() {
  return (
    <div className="relative mx-auto w-fit">
      <PhoneFrame>
        <ChatScreen>
          <Bubble side="out" time="14:40">
            what's my balance?
          </Bubble>
          <div className="flex justify-start">
            <div className="w-[88%] rounded-2xl rounded-bl-md bg-white p-3 shadow-sm ring-1 ring-ink-200/40">
              <p className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
                Your available balance is
              </p>
              <p className="mt-1 font-display text-3xl leading-none text-ink-900">
                ₦235,125
              </p>
            </div>
          </div>
        </ChatScreen>
      </PhoneFrame>
    </div>
  );
}

/**
 * ReceiveIllustration — incoming payment notification.
 */
export function ReceiveIllustration() {
  return (
    <div className="relative mx-auto w-fit">
      <PhoneFrame>
        <ChatScreen>
          <div className="flex justify-start">
            <div className="w-[88%] rounded-2xl rounded-bl-md bg-white p-3 shadow-sm ring-1 ring-ink-200/40">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-wider text-accent-600">
                  Received
                </span>
                <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[9px] font-medium text-accent-600">
                  ↓ New
                </span>
              </div>
              <p className="mt-1.5 font-display text-2xl leading-none text-ink-900">
                ₦50,000
              </p>
              <p className="mt-1 text-[11px] text-ink-500">
                from Zara Designs
              </p>
              <p className="mt-2 font-mono text-[9px] text-ink-300">
                tx_9X3K1B · 09:22
              </p>
            </div>
          </div>
          <Bubble side="in" time="9:22">
            Payment received - Your balance is now ₦182,500 and is available anytime.
          </Bubble>
        </ChatScreen>
      </PhoneFrame>
    </div>
  );
}

/**
 * ContextIllustration — references prior conversation context.
 */
export function ContextIllustration() {
  return (
    <div className="relative mx-auto w-fit">
      <PhoneFrame>
        <ChatScreen>
          <Bubble side="out" time="Mon">
            cash out 5k to gtbank
          </Bubble>
          <Bubble side="in" time="Mon">
            ✓ Cashed out ₦5,000 to GTBank.
          </Bubble>
          <div className="my-1 flex items-center gap-2 text-[9px] uppercase tracking-widest text-ink-300">
            <span className="h-px flex-1 bg-ink-200" />
            today
            <span className="h-px flex-1 bg-ink-200" />
          </div>
          <Bubble side="out" time="13:20">
            cash out the same again
          </Bubble>
          <Bubble side="in" time="13:20">
            Cash out ₦5,000 to GTBank - confirm?
          </Bubble>
        </ChatScreen>
      </PhoneFrame>
    </div>
  );
}
