import { PhoneFrame } from "@/components/ui/phone-frame";
import { ChatScreen, StaticBubble, ReceiptCard } from "@/components/ui/chat-mockup";

/**
 * Phone illustrations for the four feature sections. Each is a static
 * mockup (no animation) so the page doesn't have multiple competing
 * looping animations — only the hero loops. These show one frozen moment
 * of the product, chosen to communicate the feature at a glance.
 */

/**
 * SendIllustration — shows a transfer in progress with a confirmation card.
 */
export function SendIllustration() {
  return (
    <div className="relative mx-auto w-fit">
      <PhoneFrame>
        <ChatScreen>
          <StaticBubble side="out" time="11:02">
            cash out 25k to access bank
          </StaticBubble>
          <StaticBubble side="in" time="11:02">
            Cash out ₦ 25,000 to Access Bank ••1183? Reply yes to confirm.
          </StaticBubble>
          <StaticBubble side="out" time="11:03">
            yes
          </StaticBubble>
          <div className="flex justify-start">
            <ReceiptCard
              status="Cashed out"
              statusTone="confirmed"
              amount="₦ 25,000"
              detail="to Access Bank ••1183"
              reference="tx_4P7M2N"
              time="11:03"
            />
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
        <ChatScreen channel="telegram" subtitle="via Telegram">
          <StaticBubble side="out" time="14:40" channel="telegram">
            what&apos;s my balance?
          </StaticBubble>
          <div className="flex justify-start">
            <div className="w-[88%] rounded-2xl rounded-bl-md bg-white p-3 shadow-sm ring-1 ring-ink-200/40">
              <p className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
                Your available balance is
              </p>
              <p className="mt-1 font-sans text-3xl font-semibold leading-none tabular-nums text-ink-900">
                ₦ 235,125
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
            <ReceiptCard
              status="Received"
              statusTone="new"
              amount="₦ 50,000"
              detail="from Zara Designs"
              reference="tx_9X3K1B"
              time="09:22"
            />
          </div>
          <StaticBubble side="in" time="9:22">
            Payment received - Your balance is now ₦ 182,500 and is available anytime.
          </StaticBubble>
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
        <ChatScreen channel="telegram" subtitle="via Telegram">
          <StaticBubble side="out" time="Mon" channel="telegram">
            cash out 5k to gtbank
          </StaticBubble>
          <StaticBubble side="in" time="Mon">
            ✓ Cashed out ₦ 5,000 to GTBank.
          </StaticBubble>
          <div className="my-1 flex items-center gap-2 text-[9px] uppercase tracking-widest text-ink-300">
            <span className="h-px flex-1 bg-ink-200" />
            today
            <span className="h-px flex-1 bg-ink-200" />
          </div>
          <StaticBubble side="out" time="13:20" channel="telegram">
            cash out the same again
          </StaticBubble>
          <StaticBubble side="in" time="13:20">
            Cash out ₦ 5,000 to GTBank - confirm?
          </StaticBubble>
        </ChatScreen>
      </PhoneFrame>
    </div>
  );
}
