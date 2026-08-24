/**
 * The tap-to-choose option sets, defined once.
 *
 * These titles used to live in three places at once: hard-coded in
 * lib/meta/client.ts's button and list JSON, mirrored in the Twilio content
 * templates (scripts/create-content-templates.ts), and mirrored AGAIN in
 * fast-path.ts's TAPPED_TITLES so a tap could be recognised on the way back
 * in. A test pinned the pairs, which caught drift but did not prevent it.
 *
 * Defining them here and deriving all three removes the class of bug: a
 * renamed button cannot stop matching itself.
 *
 * THE CONTRACT EVERY RENDERER HONOURS, and the reason this file is small:
 * whatever widget a channel draws, a tap must arrive back as inbound text
 * equal to `title`. Meta echoes button_reply.title; the Telegram adapter
 * sends `id` as callback data and the route resolves it back to the title.
 * The core never learns which channel it is talking to.
 */

export interface Choice {
  id: string;
  title: string;
  /** Shown only by channels with a list-style widget. */
  description?: string;
}

/** The fast triage row. Three at most — WhatsApp's quick replies cap there. */
export const QUICK_CHOICES: Choice[] = [
  { id: "balance", title: "Balance" },
  { id: "address", title: "My address" },
  { id: "send", title: "Send" },
];

/** The fuller menu, with descriptions. */
export const MENU_CHOICES: Choice[] = [
  { id: "balance", title: "Balance", description: "Check your USDC balance" },
  { id: "address", title: "My address", description: "Get your wallet address" },
  {
    id: "send",
    title: "Send USDC",
    description: "Send to a number, address, or saved name",
  },
  { id: "history", title: "History", description: "See your recent transactions" },
  { id: "how", title: "How it works", description: "Learn how tella works" },
  { id: "safe", title: "Is it safe?", description: "How your money is protected" },
];

/** Offered alongside the freeze confirmation. See lib/agent/confirm-action.ts. */
export const FREEZE_CHOICES: Choice[] = [
  { id: "freeze", title: "Freeze it" },
  { id: "cancel", title: "Not now" },
];

/** Every choice this app can render, for the inbound title lookup. */
export const ALL_CHOICES: Choice[] = [
  ...QUICK_CHOICES,
  ...MENU_CHOICES,
  ...FREEZE_CHOICES,
];

/**
 * Resolve a choice id back to the title the user sees.
 *
 * Used by channels whose taps come back as an id rather than as text
 * (Telegram's callback_data), so that by the time the core sees it, a tap is
 * indistinguishable from someone having typed the button's label.
 */
export function titleForChoiceId(id: string): string | null {
  return ALL_CHOICES.find((c) => c.id === id)?.title ?? null;
}
