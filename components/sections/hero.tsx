import { CtaButton } from "@/components/ui/cta-button";
import { PhoneFrame } from "@/components/ui/phone-frame";
import { ChatBubble } from "@/components/ui/chat-bubble";
import { Spark } from "@/components/ui/spark";
import { SITE } from "@/lib/data/site";

/**
 * Hero
 *
 * Above-the-fold section. Two-column on desktop:
 *   - Left: oversized display headline with a Spark accent inside it,
 *     subhead paragraph, and primary CTA.
 *   - Right: a hero phone mockup with a sample WhatsApp transfer thread,
 *     plus two floating "notification" chips that overlap the phone for
 *     depth (one at top-left, one at bottom-right).
 *
 * On mobile the columns stack and the phone is centered below the text.
 *
 * The cream radial behind the column gives the hero a sunlit feel without
 * needing imagery.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Soft sun glow behind the right column */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 -z-10 h-[600px] w-[600px] translate-x-1/4 -translate-y-1/4 rounded-full bg-gradient-to-br from-accent-300/40 via-accent-300/10 to-transparent blur-3xl"
      />

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-24 pt-16 lg:grid-cols-12 lg:pb-32 lg:pt-24">
        {/* Copy column */}
        <div className="lg:col-span-7">
          <h1 className="font-display text-5xl font-medium leading-[1.05] tracking-tight text-ink-900 sm:text-6xl lg:text-[5.5rem]">
            Your AI money
            <br />
            companion,
            <span className="relative ml-3 inline-block">
              <span className="text-pago-700">anywhere</span>
              <Spark
                className="absolute -right-7 -top-2 h-6 w-6 animate-float-slow"
                tone="accent"
              />
            </span>
            <br />
            you chat.
          </h1>

          <p className="mt-8 max-w-xl text-lg text-ink-700">
            Move money, settle bills, and get a clear read on your spending —
            all from a WhatsApp message. No new apps. No menus. Just type, talk,
            or snap a photo.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <CtaButton
              href={SITE.whatsappLink}
              target="_blank"
              rel="noopener"
              className="text-base"
            >
              Try Pago now
            </CtaButton>
            <a
              href="#features"
              className="text-sm font-medium text-ink-700 underline-offset-4 hover:text-pago-900 hover:underline"
            >
              See how it works
            </a>
          </div>

          {/* Trust strip */}
          <div className="mt-16 flex flex-wrap items-center gap-x-8 gap-y-3 text-xs uppercase tracking-widest text-ink-500">
            <span>End-to-end encrypted</span>
            <span className="h-1 w-1 rounded-full bg-ink-500/50" />
            <span>50+ banks supported</span>
            <span className="h-1 w-1 rounded-full bg-ink-500/50" />
            <span>Voice & text & images</span>
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

/**
 * HeroPhone
 *
 * Composes the phone frame with a chat thread and two floating notification
 * cards. Extracted from `Hero` to keep the section component shape readable.
 */
function HeroPhone() {
  return (
    <div className="relative mx-auto w-fit">
      {/* Floating outgoing notification, top-left */}
      <div className="absolute -left-6 top-12 z-10 flex w-56 items-center gap-3 rounded-2xl bg-white p-3 shadow-[0_18px_36px_-12px_rgba(13,61,39,0.25)] sm:-left-12 lg:-left-8">
        <Avatar initials="MN" />
        <div className="flex-1">
          <p className="text-xs text-ink-500">Sent</p>
          <p className="font-display text-base font-semibold text-ink-900">
            ₦20,000
          </p>
          <p className="text-xs text-ink-500">to Mama Ngozi</p>
        </div>
      </div>

      {/* Floating accent stat card, bottom-right */}
      <div className="absolute -right-6 bottom-16 z-10 w-44 rounded-2xl bg-pago-800 p-4 text-cream-50 shadow-[0_18px_36px_-12px_rgba(13,61,39,0.4)] sm:-right-10 lg:-right-4">
        <Spark className="mb-2 h-5 w-5" tone="accent" />
        <p className="font-display text-3xl font-semibold leading-none">50+</p>
        <p className="mt-1 text-xs text-cream-50/70">
          banks supported, all from one chat.
        </p>
      </div>

      <PhoneFrame>
        <HeroChatThread />
      </PhoneFrame>
    </div>
  );
}

/**
 * HeroChatThread
 *
 * The example WhatsApp conversation rendered inside the hero phone screen.
 * Designed to read at a glance — the user asks Pago to send money, Pago
 * confirms, the user approves, the receipt appears.
 */
function HeroChatThread() {
  return (
    <div className="flex h-full flex-col bg-cream-100">
      {/* Chat header */}
      <div className="flex items-center gap-2 bg-pago-800 px-4 pb-2 pt-10 text-cream-50">
        <div className="grid h-7 w-7 place-items-center rounded-full bg-cream-50/15 text-[11px] font-semibold">
          P
        </div>
        <div className="leading-tight">
          <p className="text-[12px] font-medium">Pago</p>
          <p className="text-[9px] text-cream-50/70">online</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex flex-1 flex-col gap-2 px-3 py-3">
        <ChatBubble side="outgoing" time="9:14">
          send 20k to mama ngozi for the soup pot
        </ChatBubble>
        <ChatBubble side="incoming" time="9:14">
          Got it — ₦20,000 to Mama Ngozi (GTBank · 0123). Confirm?
        </ChatBubble>
        <ChatBubble side="outgoing" time="9:14">
          yes, send
        </ChatBubble>

        {/* Receipt card as bot message */}
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
              ₦20,000
            </p>
            <p className="mt-0.5 text-[10px] text-ink-500">
              to Mama Ngozi · GTBank
            </p>
            <p className="mt-2 text-[9px] text-ink-300">REF · 8K2L9F · 9:14 AM</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Avatar — tiny circular initials disc used in floating notifications.
 */
function Avatar({ initials }: { initials: string }) {
  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-pago-100 text-sm font-semibold text-pago-800">
      {initials}
    </div>
  );
}
