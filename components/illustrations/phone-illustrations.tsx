import { PhoneFrame } from "@/components/ui/phone-frame";
import { ChatBubble } from "@/components/ui/chat-bubble";
import { Spark } from "@/components/ui/spark";

/**
 * TransferIllustration
 *
 * Phone mockup showing a money transfer flow. Includes a floating "✓ Success"
 * receipt card overlapping the phone for visual interest.
 */
export function TransferIllustration() {
  return (
    <div className="relative mx-auto w-fit">
      <FloatingReceipt />
      <FloatingBankBadge />
      <PhoneFrame>
        <div className="flex h-full flex-col bg-cream-100">
          <ScreenHeader title="Transfer" />
          <div className="flex flex-1 flex-col gap-2 px-3 py-4">
            <ChatBubble side="outgoing" time="11:02">
              pay folake 15k for the design work
            </ChatBubble>
            <ChatBubble side="incoming" time="11:02">
              Folake Adeyemi · Access Bank · 0987 — sending ₦15,000?
            </ChatBubble>
            <ChatBubble side="outgoing" time="11:03">
              yes
            </ChatBubble>
            <SuccessCard amount="₦15,000" recipient="Folake · Access" />
          </div>
        </div>
      </PhoneFrame>
    </div>
  );
}

/**
 * SpendingIllustration
 *
 * Shows a spending breakdown card inside the phone — bot-rendered analytics
 * in response to a casual question.
 */
export function SpendingIllustration() {
  return (
    <div className="relative mx-auto w-fit">
      <FloatingCategory icon="🚗" label="Transport" amount="₦14k" position="top-left" />
      <FloatingCategory icon="🍲" label="Food" amount="₦32k" position="bottom-right" />

      <PhoneFrame>
        <div className="flex h-full flex-col bg-cream-100">
          <ScreenHeader title="Pago" />
          <div className="flex flex-1 flex-col gap-2 px-3 py-4">
            <ChatBubble side="outgoing" time="14:40">
              how much did i spend last week?
            </ChatBubble>
            <div className="flex w-full justify-start">
              <div className="w-[88%] rounded-2xl rounded-bl-md bg-white p-3 shadow-sm">
                <p className="text-[10px] uppercase tracking-wider text-pago-700">
                  Last 7 days
                </p>
                <p className="mt-1 font-display text-2xl font-semibold text-ink-900">
                  ₦68,400
                </p>
                <SpendingBars />
                <p className="mt-2 text-[10px] text-ink-500">
                  Mostly food and transport — about ₦9,800/day on average.
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
 * A support thread mockup with quick-reply chip suggestions visible at the
 * bottom of the phone.
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
          <ScreenHeader title="Pago Support" subtitle="here to help 👋" />
          <div className="flex flex-1 flex-col gap-2 px-3 py-4">
            <ChatBubble side="incoming" time="08:01">
              Hi 👋 What can I help you with today?
            </ChatBubble>
            <ChatBubble side="outgoing" time="08:01">
              my last transfer is showing as pending
            </ChatBubble>
            <ChatBubble side="incoming" time="08:02">
              Found it — ₦5,000 to Iyanu Barber. Bank confirmed receipt 11s ago,
              your receipt is on the way now.
            </ChatBubble>

            {/* Quick reply chips */}
            <div className="mt-auto space-y-1.5 pt-2">
              <ReplyChip>Transfer not arriving</ReplyChip>
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
 * Demonstrates Pago remembering prior context — user says "send same amount
 * to him" and the assistant resolves both the recipient and the amount from
 * earlier in the thread.
 */
export function ContextIllustration() {
  return (
    <div className="relative mx-auto w-fit">
      <FloatingMemoryBadge />
      <PhoneFrame>
        <div className="flex h-full flex-col bg-cream-100">
          <ScreenHeader title="Pago" />
          <div className="flex flex-1 flex-col gap-2 px-3 py-4">
            <ChatBubble side="outgoing" time="Mon">
              sent 5k to chuks for lunch
            </ChatBubble>
            <ChatBubble side="incoming" time="Mon">
              ✓ Sent ₦5,000 to Chuks Okafor.
            </ChatBubble>

            <div className="my-2 flex items-center gap-2 text-[9px] uppercase tracking-widest text-ink-300">
              <span className="h-px flex-1 bg-ink-300/40" />
              today
              <span className="h-px flex-1 bg-ink-300/40" />
            </div>

            <ChatBubble side="outgoing" time="13:20">
              send him the same amount again
            </ChatBubble>
            <ChatBubble side="incoming" time="13:20">
              Sending ₦5,000 to Chuks Okafor — confirm?
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

/**
 * The green status bar at the top of each phone screen, sitting just under
 * the notch. Includes a circular avatar disc and a name/status pair.
 */
function ScreenHeader({
  title,
  subtitle = "online",
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-pago-800 px-4 pb-2 pt-10 text-cream-50">
      <div className="grid h-7 w-7 place-items-center rounded-full bg-cream-50/15 text-[11px] font-semibold">
        P
      </div>
      <div className="leading-tight">
        <p className="text-[12px] font-medium">{title}</p>
        <p className="text-[9px] text-cream-50/70">{subtitle}</p>
      </div>
    </div>
  );
}

/** Receipt card shown inside transfer chat thread. */
function SuccessCard({ amount, recipient }: { amount: string; recipient: string }) {
  return (
    <div className="flex w-full justify-start">
      <div className="w-[78%] rounded-2xl rounded-bl-md bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-pago-700">
            Sent
          </span>
          <span className="rounded-full bg-pago-100 px-2 py-0.5 text-[9px] font-medium text-pago-800">
            ✓ Success
          </span>
        </div>
        <p className="mt-1 font-display text-2xl font-semibold text-ink-900">
          {amount}
        </p>
        <p className="mt-0.5 text-[10px] text-ink-500">to {recipient}</p>
      </div>
    </div>
  );
}

/** Floating "Sent ₦20k" notification used as a Transfer section flourish. */
function FloatingReceipt() {
  return (
    <div className="absolute -left-12 top-24 z-10 flex w-52 items-center gap-3 rounded-2xl bg-white p-3 shadow-[0_18px_36px_-12px_rgba(13,61,39,0.25)]">
      <div className="grid h-9 w-9 place-items-center rounded-full bg-pago-100 text-xs font-semibold text-pago-800">
        FA
      </div>
      <div className="flex-1">
        <p className="text-[10px] text-ink-500">Sent</p>
        <p className="font-display text-base font-semibold text-ink-900">
          ₦15,000
        </p>
        <p className="text-[10px] text-ink-500">to Folake</p>
      </div>
    </div>
  );
}

/** Floating "50+ banks" badge with spark accent. */
function FloatingBankBadge() {
  return (
    <div className="absolute -right-10 bottom-20 z-10 w-44 rounded-2xl bg-pago-800 p-4 text-cream-50 shadow-[0_18px_36px_-12px_rgba(13,61,39,0.4)]">
      <Spark className="mb-2 h-5 w-5" tone="accent" />
      <p className="font-display text-3xl font-semibold leading-none">50+</p>
      <p className="mt-1 text-[10px] text-cream-50/70">Banks supported</p>
    </div>
  );
}

/** Floating category breakdown chip — reusable, positionable. */
function FloatingCategory({
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

/** Decorative "remembers context" badge for the Context section. */
function FloatingMemoryBadge() {
  return (
    <div className="absolute -right-10 top-20 z-10 w-44 rounded-2xl bg-cream-50 p-4 ring-1 ring-pago-900/10 shadow-[0_18px_36px_-12px_rgba(13,61,39,0.18)]">
      <p className="text-[10px] uppercase tracking-wider text-pago-700">
        Memory
      </p>
      <p className="mt-1 font-display text-base font-medium leading-tight text-ink-900">
        knows "him" = Chuks
      </p>
    </div>
  );
}

/** Suggested-reply chip used inside Support phone screen. */
function ReplyChip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-full border border-pago-700/30 bg-cream-50 px-3 py-1 text-[10px] font-medium text-pago-800">
      {children}
    </div>
  );
}

/** Tiny inline bar chart inside the spending card. */
function SpendingBars() {
  // Heights tuned so the visual shape reads as "food dominant".
  const bars = [
    { label: "Food", value: 32, color: "bg-pago-700" },
    { label: "Transp.", value: 14, color: "bg-pago-500" },
    { label: "Bills", value: 12, color: "bg-pago-400" },
    { label: "Shop", value: 6, color: "bg-pago-300" },
    { label: "Other", value: 4, color: "bg-pago-200" },
  ];
  const max = Math.max(...bars.map((b) => b.value));

  return (
    <div className="mt-2 flex h-12 items-end gap-1.5">
      {bars.map((b) => (
        <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
          <div
            className={`${b.color} w-full rounded-t-sm`}
            style={{ height: `${(b.value / max) * 100}%` }}
          />
          <span className="text-[7px] text-ink-500">{b.label}</span>
        </div>
      ))}
    </div>
  );
}
