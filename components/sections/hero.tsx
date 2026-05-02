import { CtaButton } from "@/components/ui/cta-button";
import { PhoneFrame } from "@/components/ui/phone-frame";
import { ChatBubble } from "@/components/ui/chat-bubble";
import { Spark } from "@/components/ui/spark";
import { SITE } from "@/lib/data/site";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 -z-10 h-[600px] w-[600px] translate-x-1/4 -translate-y-1/4 rounded-full bg-gradient-to-br from-accent-300/40 via-accent-300/10 to-transparent blur-3xl"
      />

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-24 pt-16 lg:grid-cols-12 lg:pb-32 lg:pt-24">
        {/* Copy column */}
        <div className="lg:col-span-7">
          <h1 className="font-display text-5xl font-medium leading-[1.05] tracking-tight text-ink-900 sm:text-6xl lg:text-[5.5rem]">
            Your USDC,
            <br />
            your Naira,
            <span className="relative ml-3 inline-block">
              <span className="text-upay-700">instantly.</span>
              <Spark
                className="absolute -right-7 -top-2 h-6 w-6 animate-float-slow"
                tone="accent"
              />
            </span>
          </h1>

          <p className="mt-8 max-w-xl text-lg text-ink-700">
            Message UPAY on WhatsApp, tell it how much USDC to offramp, and
            Naira lands in your Nigerian bank account in seconds. No exchange
            account. No app. Just chat.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <CtaButton
              href={SITE.whatsappLink}
              target="_blank"
              rel="noopener"
              className="text-base"
            >
              Try UPAY now
            </CtaButton>
            <a
              href="#features"
              className="text-sm font-medium text-ink-700 underline-offset-4 hover:text-upay-900 hover:underline"
            >
              See how it works
            </a>
          </div>

          {/* Trust strip */}
          <div className="mt-16 flex flex-wrap items-center gap-x-8 gap-y-3 text-xs uppercase tracking-widest text-ink-500">
            <span>All Nigerian banks</span>
            <span className="h-1 w-1 rounded-full bg-ink-500/50" />
            <span>Near-zero finality</span>
            <span className="h-1 w-1 rounded-full bg-ink-500/50" />
            <span>Powered by ARC</span>
          </div>
        </div>

        {/* Phone column */}
        <div className="relative lg:col-span-5">
          <HeroPhone />
        </div>
      </div>
    </section>
  );
}

function HeroPhone() {
  return (
    <div className="relative mx-auto w-fit">
      {/* Floating received notification, top-left */}
      <div className="absolute -left-6 top-12 z-10 flex w-56 items-center gap-3 rounded-2xl bg-white p-3 shadow-[0_18px_36px_-12px_rgba(13,61,39,0.25)] sm:-left-12 lg:-left-8">
        <BankAvatar letters="GT" />
        <div className="flex-1">
          <p className="text-xs text-ink-500">Received</p>
          <p className="font-display text-base font-semibold text-ink-900">
            ₦82,500
          </p>
          <p className="text-xs text-ink-500">GTBank · 4521</p>
        </div>
      </div>

      {/* Floating settlement stat card, bottom-right */}
      <div className="absolute -right-6 bottom-16 z-10 w-44 rounded-2xl bg-upay-800 p-4 text-cream-50 shadow-[0_18px_36px_-12px_rgba(13,61,39,0.4)] sm:-right-10 lg:-right-4">
        <Spark className="mb-2 h-5 w-5" tone="accent" />
        <p className="font-display text-3xl font-semibold leading-none">&lt;1s</p>
        <p className="mt-1 text-xs text-cream-50/70">
          average settlement time on ARC.
        </p>
      </div>

      <PhoneFrame>
        <HeroChatThread />
      </PhoneFrame>
    </div>
  );
}

function HeroChatThread() {
  return (
    <div className="flex h-full flex-col bg-cream-100">
      {/* Chat header */}
      <div className="flex items-center gap-2 bg-upay-800 px-4 pb-2 pt-10 text-cream-50">
        <div className="grid h-7 w-7 place-items-center rounded-full bg-cream-50/15 text-[11px] font-semibold">
          U
        </div>
        <div className="leading-tight">
          <p className="text-[12px] font-medium">UPAY</p>
          <p className="text-[9px] text-cream-50/70">online</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex flex-1 flex-col gap-2 px-3 py-3">
        <ChatBubble side="outgoing" time="9:14">
          sell 50 usdc
        </ChatBubble>
        <ChatBubble side="incoming" time="9:14">
          Got it — 50 USDC → ₦82,500 (₦1,650/USDC). To GTBank · 4521. Confirm?
        </ChatBubble>
        <ChatBubble side="outgoing" time="9:14">
          yes
        </ChatBubble>

        {/* Receipt card as bot message */}
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
              ₦82,500
            </p>
            <p className="mt-0.5 text-[10px] text-ink-500">
              GTBank · 4521 · via ARC
            </p>
            <p className="mt-2 text-[9px] text-ink-300">REF · 4R9K2M · 9:14 AM</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BankAvatar({ letters }: { letters: string }) {
  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-upay-100 text-sm font-semibold text-upay-800">
      {letters}
    </div>
  );
}
