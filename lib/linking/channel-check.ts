import { isAffirmation, isDeclination, isNegation } from "@/lib/agent/confirm-action";
import type { MessageProvider } from "@/lib/messaging/processed-messages";
export { CHANNEL_CHECK_CHOICES } from "@/lib/agent/menus";

/**
 * The first-contact question: does this person already have a tella account on
 * the other app? Asked before a wallet exists, so that someone who does is
 * joined to it instead of being handed a second, empty one.
 *
 * Asked in both directions: a new WhatsApp number is asked about Telegram, and
 * a new Telegram chat is asked about WhatsApp.
 */

export type ChannelAnswer = "yes" | "no" | "other";

export type OtherApp = "Telegram" | "WhatsApp";

/** The app to ask about, given where the person is writing from. */
export function otherAppFor(origin: MessageProvider): OtherApp {
  return origin === "telegram" ? "WhatsApp" : "Telegram";
}

const YES_EXTRA = /^\s*(i\s+do|i\s+have|yes\s+i\s+do|yes\s+i\s+have|yup|sure)\s*[.!]?\s*$/i;
const NO_EXTRA =
  /^\s*(new|i'?m\s+new|im\s+new|i\s+am\s+new|none|i\s+don'?t|i\s+do\s+not|i\s+dont|don'?t\s+have\s+one|no\s+i\s+don'?t|create\s+(one|new|a\s+new\s+one)|new\s+wallet|start\s+fresh)\s*[.!]?\s*$/i;

/** Reads a reply to the question. "other" means ask again, never guess. */
export function classifyChannelAnswer(text: string): ChannelAnswer {
  const t = text.trim();
  if (!t) return "other";
  if (isAffirmation(t) || YES_EXTRA.test(t)) return "yes";
  if (isNegation(t) || isDeclination(t) || NO_EXTRA.test(t)) return "no";
  return "other";
}

export function channelCheckPrompt(otherApp: OtherApp): string {
  return [
    "👋 Welcome to tella!",
    "",
    "Send and receive USDC right here in chat — no exchange, no app, no seed phrase to lose.",
    "",
    `Quick question before I set you up: do you already have a tella account on ${otherApp}?`,
    "",
    "Reply *yes* to connect it, or *no* to create a new wallet here.",
  ].join("\n");
}

export const NEW_WALLET_PROMPT = [
  "No problem, I'll set you up with a new wallet. I'll have it ready in about 30 seconds.",
  "",
  "What should I call you?",
  "",
  "(Just reply with your name)",
].join("\n");

export function connectExistingText(otherApp: OtherApp): string {
  if (otherApp === "WhatsApp") {
    // The existing account is the WhatsApp one: the person sends it a
    // prefilled "link telegram", and it hands this chat back a link.
    return [
      "Great. Tap below to open tella on WhatsApp and send the message it fills in. I'll walk you through confirming it's you.",
      "",
      "This Telegram chat joins your existing wallet, so there's nothing new to set up.",
      "",
      "Not on WhatsApp after all? Reply *new* and I'll create a fresh wallet here.",
    ].join("\n");
  }
  return [
    `Great. Tap below to open tella on ${otherApp}, press Start, and I'll walk you through confirming it's you.`,
    "",
    `Your number joins your existing wallet, so there's nothing new to set up.`,
    "",
    `Not on ${otherApp} after all? Reply *new* and I'll create a fresh wallet here.`,
  ].join("\n");
}
