import { PhoneFrame } from "@/components/ui/phone-frame";
import { ChatBubble } from "@/components/ui/chat-bubble";
import { Spark } from "@/components/ui/spark";

/**
 * TransferIllustration
 *
 * Phone mockup showing a USDC offramp flow: user sells USDC, UPAY
 * quotes the live rate, user confirms, receipt is dropped in chat.
 */
export function TransferIllustration() {
  return (
    <div className="relative mx-auto w-fit">
      <FloatingReceipt />
      <FloatingSettlementBadge />
      <PhoneFrame>
        <div className="flex h-full flex-col bg-cream-100">
          <ScreenHeader title="UPAY" />
          <div className="flex flex-1 flex-col gap-2 px-3 py-4">
            <ChatBubble side="outgoing" time="11:02">
              sell 30 usdc
            </ChatBubble>
            <ChatBubble side="incoming" time="11:02">
              30 USDC → ₦49,500 (₦1,650/USDC). To Access Bank · 0987. Confirm?
            </ChatBubble>
            <ChatBubble side="outgoing" time="11:03">
              yes
            </ChatBubble>
            <OfframpReceiptCard amount="₦49,500" detail="Access Bank · 0987 · via ARC" />
          </div>
        </div>
      </PhoneFrame>
    </div>
  );
}

/**
 * SpendingIllustration
 *
 * Repurposed as a "Live Rates" illustration — shows a rate card inside
 * the phone in response to a casual rate check.
 */
export function SpendingIllustration() {
  return (
    <div className="relative mx-auto w-fit">
      <FloatingRateChip icon="💵" label="USDC/NGN" amount="₦1,650" position="top-left" />
      <FloatingRateChip icon="⚡" label="Spread" amount="Competitive" position="bottom-right" />

      <PhoneFrame>
        <div className="flex h-full flex-col bg-cream-100">
          <ScreenHeader title="UPAY" />
          <div className="flex flex-1 flex-col gap-2 px-3 py-4">
            <ChatBubble side="outgoing" time="14:40">
              what's the rate right now?
            </ChatBubble>
            <div className="flex w-full justify-start">
              <div className="w-[88%] rounded-2xl rounded-bl-md bg-white p-3 shadow-sm">
                <p className="text-[10px] uppercase tracking-wider text-upay-700">
                  Live Rate
                </p>
                <p className="mt-1 font-display text-2xl font-semibold text-ink-900">
                  ₦1,650 / USDC
                </p>
                <RateBars />
                <p className="mt-2 text-[10px] text-ink-500">
                  Live market rate · competitive spread · no hidden fees.
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
 * SupportIllustration
 *
 * A support thread showing a user checking on an offramp status.
 * UPAY resolves it instantly via ARC's transaction record.
 */
export function SupportIllustration() {
  return (
    <div className="relative mx-auto w-fit">
      <Spark
        className="absolute -left-4 top-8 h-10 w-10 animate-float-slow"
        tone="accent"
      />
      <PhoneFrame>
        <div className="flex h-full flex-col bg-cream-100">
          <ScreenHeader title="UPAY" subtitle="here to help 👋" />
          <div className="flex flex-1 flex-col gap-2 px-3 py-4">
            <ChatBubble side="incoming" time="08:01">
              Hi 👋 What can I help you with today?
            </ChatBubble>
            <ChatBubble side="outgoing" time="08:01">
              my last offramp is showing as pending
            </ChatBubble>
            <ChatBubble side="incoming" time="08:02">
              Found it — 50 USDC → ₦82,500. Settled on ARC 3s ago, your bank
              credit is on the way now.
            </ChatBubble>

            {/* Quick reply chips */}
            <div className="mt-auto space-y-1.5 pt-2">
              <ReplyChip>Offramp not arriving</ReplyChip>
              <ReplyChip>Reset my PIN</ReplyChip>
              <ReplyChip>Speak to a human</ReplyChip>
            </div>
          </div>
        </div>
      </PhoneFrame>
    </div>
  );
}

/**
 * ContextIllustration
 *
 * Demonstrates UPAY remembering a prior offramp — user says "sell same
 * amount" and UPAY resolves both the amount and bank from the thread.
 */
export function ContextIllustration() {
  return (
    <div className="relative mx-auto w-fit">
      <FloatingMemoryBadge />
      <PhoneFrame>
        <div className="flex h-full flex-col bg-cream-100">
          <ScreenHeader title="UPAY" />
          <div className="flex flex-1 flex-col gap-2 px-3 py-4">
            <ChatBubble side="outgoing" time="Mon">
              sell 50 usdc
            </ChatBubble>
            <ChatBubble side="incoming" time="Mon">
              ✓ ₦82,500 received · Access Bank · 0987
            </ChatBubble>

            <div className="my-2 flex items-center gap-2 text-[9px] uppercase tracking-widest text-ink-300">
              <span className="h-px flex-1 bg-ink-300/40" />
              today
              <span className="h-px flex-1 bg-ink-300/40" />
            </div>

            <ChatBubble side="outgoing" time="13:20">
              sell same amount again
            </ChatBubble>
            <ChatBubble side="incoming" time="13:20">
              50 USDC → ₦82,500 (₦1,650/USDC). Same bank. Confirm?
            </ChatBubble>
          </div>
        </div>
      </PhoneFrame>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Internal helpers — only used by illustrations above                */
/* ------------------------------------------------------------------ */

function ScreenHeader({
  title,
  subtitle = "online",
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-upay-800 px-4 pb-2 pt-10 text-cream-50">
      <div className="grid h-7 w-7 place-items-center rounded-full bg-cream-50/15 text-[11px] font-semibold">
        U
      </div>
      <div className="leading-tight">
        <p className="text-[12px] font-medium">{title}</p>
        <p className="text-[9px] text-cream-50/70">{subtitle}</p>
      </div>
    </div>
  );
}

function OfframpReceiptCard({ amount, detail }: { amount: string; detail: string }) {
  return (
    <div className="flex w-full justify-start">
      <div className="w-[78%] rounded-2xl rounded-bl-md bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-upay-700">
            Received
          </span>
          <span className="rounded-full bg-upay-100 px-2 py-0.5 text-[9px] font-medium text-upay-800">
            ✓ Settled
          </span>
        </div>
        <p className="mt-1 font-display text-2xl font-semibold text-ink-900">
          {amount}
        </p>
        <p className="mt-0.5 text-[10px] text-ink-500">{detail}</p>
      </div>
    </div>
  );
}

/** Floating "Received ₦49,500" notification for the Offramp section. */
function FloatingReceipt() {
  return (
    <div className="absolute -left-12 top-24 z-10 flex w-52 items-center gap-3 rounded-2xl bg-white p-3 shadow-[0_18px_36px_-12px_rgba(13,61,39,0.25)]">
      <div className="grid h-9 w-9 place-items-center rounded-full bg-upay-100 text-xs font-semibold text-upay-800">
        AB
      </div>
      <div className="flex-1">
        <p className="text-[10px] text-ink-500">Received</p>
        <p className="font-display text-base font-semibold text-ink-900">
          ₦49,500
        </p>
        <p className="text-[10px] text-ink-500">Access Bank · 0987</p>
      </div>
    </div>
  );
}

/** Floating settlement speed badge for the Offramp section. */
function FloatingSettlementBadge() {
  return (
    <div className="absolute -right-10 bottom-20 z-10 w-44 rounded-2xl bg-upay-800 p-4 text-cream-50 shadow-[0_18px_36px_-12px_rgba(13,61,39,0.4)]">
      <Spark className="mb-2 h-5 w-5" tone="accent" />
      <p className="font-display text-3xl font-semibold leading-none">&lt;1s</p>
      <p className="mt-1 text-[10px] text-cream-50/70">settlement on ARC</p>
    </div>
  );
}

/** Floating rate/info chip for the Live Rates section — reusable, positionable. */
function FloatingRateChip({
  icon,
  label,
  amount,
  position,
}: {
  icon: string;
  label: string;
  amount: string;
  position: "top-left" | "bottom-right";
}) {
  const placement =
    position === "top-left"
      ? "-left-12 top-16"
      : "-right-12 bottom-20";

  return (
    <div
      className={`absolute ${placement} z-10 flex items-center gap-3 rounded-2xl bg-white p-3 shadow-[0_18px_36px_-12px_rgba(13,61,39,0.25)]`}
    >
      <div className="grid h-9 w-9 place-items-center rounded-full bg-cream-100 text-base">
        {icon}
      </div>
      <div className="leading-tight">
        <p className="text-[10px] uppercase tracking-wider text-ink-500">
          {label}
        </p>
        <p className="font-display text-base font-semibold text-ink-900">
          {amount}
        </p>
      </div>
    </div>
  );
}

/** Decorative "remembers last offramp" badge for the Repeat section. */
function FloatingMemoryBadge() {
  return (
    <div className="absolute -right-10 top-20 z-10 w-44 rounded-2xl bg-cream-50 p-4 ring-1 ring-upay-900/10 shadow-[0_18px_36px_-12px_rgba(13,61,39,0.18)]">
      <p className="text-[10px] uppercase tracking-wider text-upay-700">
        Memory
      </p>
      <p className="mt-1 font-display text-base font-medium leading-tight text-ink-900">
        last sell = 50 USDC
      </p>
    </div>
  );
}

/** Suggested-reply chip inside the Support phone screen. */
function ReplyChip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-full border border-upay-700/30 bg-cream-50 px-3 py-1 text-[10px] font-medium text-upay-800">
      {children}
    </div>
  );
}

/** Mini bar chart repurposed as a USDC rate trend visualization. */
function RateBars() {
  const bars = [
    { label: "Mon", value: 1620, color: "bg-upay-300" },
    { label: "Tue", value: 1635, color: "bg-upay-400" },
    { label: "Wed", value: 1628, color: "bg-upay-400" },
    { label: "Thu", value: 1645, color: "bg-upay-500" },
    { label: "Now", value: 1650, color: "bg-upay-700" },
  ];
  const min = Math.min(...bars.map((b) => b.value));
  const max = Math.max(...bars.map((b) => b.value));

  return (
    <div className="mt-2 flex h-12 items-end gap-1.5">
      {bars.map((b) => (
        <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
          <div
            className={`${b.color} w-full rounded-t-sm`}
            style={{ height: `${30 + ((b.value - min) / (max - min)) * 70}%` }}
          />
          <span className="text-[7px] text-ink-500">{b.label}</span>
        </div>
      ))}
    </div>
  );
}
