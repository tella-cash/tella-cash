import { PhoneFrame } from "@/components/ui/phone-frame";

/**
 * Phone illustrations for the four feature sections. Each is a static
 * mockup (no animation) so the page doesn't have multiple competing
 * looping animations — only the hero loops. These show one frozen moment
 * of the product, chosen to communicate the feature at a glance.
 */

/** Compact phone screen header — same shape as hero, simpler interior. */
function ScreenHeader() {
  return (
    <div className="flex items-center gap-3 border-b border-ink-200/40 bg-surface-50 px-4 pb-3 pt-12">
      <div className="grid h-9 w-9 place-items-center rounded-full bg-accent-500 text-xs font-semibold text-white">
        U
      </div>
      <div className="leading-tight">
        <p className="text-[13px] font-medium text-ink-900">UPay</p>
        <p className="text-[10px] text-ink-500">online</p>
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
        <div className="flex h-full flex-col">
          <ScreenHeader />
          <div className="flex flex-1 flex-col gap-2 bg-surface-100 p-3">
            <Bubble side="out" time="11:02">
              send 25 to folake
            </Bubble>
            <Bubble side="in" time="11:02">
              Send 25 USDC to Folake Adeyemi? Reply yes to confirm.
            </Bubble>
            <Bubble side="out" time="11:03">
              yes
            </Bubble>
            <div className="flex justify-start">
              <div className="w-[82%] rounded-2xl rounded-bl-md bg-white p-3 shadow-sm ring-1 ring-ink-200/40">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
                    Sent
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700">
                    ✓ Confirmed
                  </span>
                </div>
                <p className="mt-1.5 font-display text-2xl leading-none text-ink-900">
                  $25.00 <span className="text-base text-ink-500">USDC</span>
                </p>
                <p className="mt-1 text-[11px] text-ink-500">
                  to Folake Adeyemi
                </p>
                <p className="mt-2 font-mono text-[9px] text-ink-300">
                  tx_4P7M2N · 11:03
                </p>
              </div>
            </div>
          </div>
        </div>
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
        <div className="flex h-full flex-col">
          <ScreenHeader />
          <div className="flex flex-1 flex-col gap-2 bg-surface-100 p-3">
            <Bubble side="out" time="14:40">
              what's my balance?
            </Bubble>
            <div className="flex justify-start">
              <div className="w-[88%] rounded-2xl rounded-bl-md bg-white p-3 shadow-sm ring-1 ring-ink-200/40">
                <p className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
                  Available
                </p>
                <p className="mt-1 font-display text-3xl leading-none text-ink-900">
                  $142.50
                </p>
                <div className="mt-3 space-y-1.5 border-t border-ink-200/40 pt-3 text-[11px]">
                  <div className="flex justify-between text-ink-700">
                    <span>USDC</span>
                    <span className="font-mono">142.50</span>
                  </div>
                  <div className="flex justify-between text-ink-400">
                    <span>Last 24h</span>
                    <span className="text-emerald-600">+$25.00</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
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
        <div className="flex h-full flex-col">
          <ScreenHeader />
          <div className="flex flex-1 flex-col gap-2 bg-surface-100 p-3">
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
                  $50.00 <span className="text-base text-ink-500">USDC</span>
                </p>
                <p className="mt-1 text-[11px] text-ink-500">
                  from Adaeze Nwosu
                </p>
                <p className="mt-2 font-mono text-[9px] text-ink-300">
                  tx_9X3K1B · 09:22
                </p>
              </div>
            </div>
            <Bubble side="in" time="9:22">
              You've received $50 from Adaeze. New balance: $192.50.
            </Bubble>
          </div>
        </div>
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
        <div className="flex h-full flex-col">
          <ScreenHeader />
          <div className="flex flex-1 flex-col gap-2 bg-surface-100 p-3">
            <Bubble side="out" time="Mon">
              sent 5 to chuks for lunch
            </Bubble>
            <Bubble side="in" time="Mon">
              ✓ Sent $5 to Chuks Okafor.
            </Bubble>
            <div className="my-1 flex items-center gap-2 text-[9px] uppercase tracking-widest text-ink-300">
              <span className="h-px flex-1 bg-ink-200" />
              today
              <span className="h-px flex-1 bg-ink-200" />
            </div>
            <Bubble side="out" time="13:20">
              send him the same again
            </Bubble>
            <Bubble side="in" time="13:20">
              Sending $5 USDC to Chuks Okafor — confirm?
            </Bubble>
          </div>
        </div>
      </PhoneFrame>
    </div>
  );
}
