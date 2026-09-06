import type { Beneficiary, PendingActionPayload, SendFlowPendingPayload } from "@/lib/supabase/types";
import type { Choice } from "@/lib/agent/menus";
import { classifyRecipient } from "@/lib/agent/parse-send";

/**
 * The guided send: "Send" as a button that actually sends.
 *
 * WHAT THIS REPLACED. Tapping Send returned REPLIES.sendHelp — a button
 * labelled with a verb that answered by explaining a command to type. A user
 * put it plainly in testing: "I still have to type the command manually and
 * people can easily make mistakes doing that." On a wallet, a typo in a
 * hand-typed recipient is not a usability complaint; it is the failure mode
 * that has no undo once a transfer confirms.
 *
 * WHY IT IS LOCAL. Nothing here calls sendam-ai. The free-form path still
 * does, and should — "send 5 to chidi" is genuinely ambiguous text and the
 * decoder is good at it, with checkConfidence and a confirm prompt standing
 * behind a wrong reading. This path is different in kind: the user is
 * answering a question we asked, one field at a time, so each answer is
 * matched against an anchored pattern or refused. The rule the codebase
 * already states for tier 0 applies with more force here — conservative on
 * send — and it has the same free consequence: the flow keeps working when
 * the decoder is down.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not resolve a recipient, check a
 * balance, apply a limit, or mint a confirm link. It collects two fields and
 * hands them to startSendFlow as a ParsedSendIntent, which is the same
 * function the decoder path calls and the only place that turns an intent into
 * money. A second route to a transfer is exactly what this file must not
 * become.
 */

/**
 * How many saved recipients to offer.
 *
 * Meta's list picker caps at ten rows and Telegram gets unreadable long before
 * that. Someone with more saved names than this can still type one — the
 * prompt says so — and the alternative, a paginated address book, is a screen
 * this product does not have.
 */
export const MAX_OFFERED_BENEFICIARIES = 8;

/** Narrow a pending row's payload. The row's `kind` column is the authority. */
export function isSendFlowPayload(
  payload: PendingActionPayload,
): payload is SendFlowPendingPayload {
  return (payload as SendFlowPendingPayload).action === "send";
}

/**
 * The amount, parsed the strict way.
 *
 * Anchored at both ends and consuming the whole message, so "5" and "5 usdc"
 * are amounts and "about 5" and "5 to chidi" are not. Six decimal places
 * because that is USDC's real precision — more digits are invented, and
 * lib/wallet/circle.ts truncates them back off anyway.
 *
 * Returns the ORIGINAL digits rather than a Number. Everything downstream
 * carries the amount as a string, all the way to Circle's `amount: [amount]`,
 * and a round trip through a float is how 0.1 + 0.2 arithmetic gets into a
 * transfer.
 *
 * Rejects anything it is not certain of. A rejected amount costs one more
 * message; a misread one costs the difference.
 */
const AMOUNT_PATTERN = /^\s*(?:usdc\s+)?(\d+(?:\.\d{1,6})?)\s*(?:usdc)?\s*$/i;

export function parseSendAmount(text: string): string | null {
  const match = AMOUNT_PATTERN.exec(text.trim());
  if (!match) return null;

  const raw = match[1];
  const value = Number(raw);
  // Number() is what every downstream comparison uses, and NaN compares false
  // against everything — which would sail past a limit check rather than fail
  // one. Checked here so a value that cannot be compared never gets that far.
  if (!Number.isFinite(value) || value <= 0) return null;

  return raw;
}

export interface SendReplySlots {
  amount: string | null;
  recipient: string | null;
}

/**
 * Read whatever the user put in one reply — an amount, a recipient, or both.
 *
 * People do not answer "who are you sending to?" with only a name. They answer
 * "5 to chidi", or "chidi 5", or just "5" and expect to be asked the rest.
 * Taking the whole reply as a recipient label meant "5 to chidi" was looked up
 * as a beneficiary called "5 to chidi", which nobody has.
 *
 * Anchored patterns, whole-string, in the order below. Anything that matches
 * none of them is a recipient, because that is what the question asked for.
 *
 * TWO WAYS THIS COULD SEND MONEY TO THE WRONG PLACE, both guarded:
 *
 * A phone number written with spaces — "+234 801 234 5678" — ends in digits,
 * so the recipient-then-amount pattern would read the last group as an amount
 * and the truncated number as the destination. So a reply the classifier can
 * identify ON ITS OWN as a phone number or an address is never split.
 *
 * A saved name that ends in a number — "Landlord 2" — would split the same
 * way. That one cannot be settled here, because whether it is a name is a fact
 * about the user's address book: the caller checks saved labels against the
 * whole reply first, and a saved name always wins over any splitting.
 */
const AMOUNT = String.raw`\d+(?:\.\d{1,6})?`;

const AMOUNT_ONLY = new RegExp(`^(?:usdc\\s+)?(${AMOUNT})\\s*(?:usdc)?$`, "i");
const AMOUNT_THEN_RECIPIENT = new RegExp(
  `^(?:send\\s+)?(${AMOUNT})\\s*(?:usdc)?\\s+(?:to\\s+)?(.+?)$`,
  "i",
);
const RECIPIENT_THEN_AMOUNT = new RegExp(
  `^(.+?)\\s+(${AMOUNT})\\s*(?:usdc)?$`,
  "i",
);

export function parseSendReply(text: string): SendReplySlots {
  const trimmed = text.trim();
  if (!trimmed) return { amount: null, recipient: null };

  // Never split something that is already a complete destination.
  const whole = classifyRecipient(trimmed);
  if (whole.kind === "phone" || whole.kind === "address") {
    return { amount: null, recipient: trimmed };
  }

  const amountOnly = AMOUNT_ONLY.exec(trimmed);
  if (amountOnly) return { amount: amountOnly[1], recipient: null };

  const amountFirst = AMOUNT_THEN_RECIPIENT.exec(trimmed);
  if (amountFirst) {
    return { amount: amountFirst[1], recipient: amountFirst[2].trim() };
  }

  const amountLast = RECIPIENT_THEN_AMOUNT.exec(trimmed);
  if (amountLast) {
    return { amount: amountLast[2], recipient: amountLast[1].trim() };
  }

  return { amount: null, recipient: trimmed };
}

/**
 * The saved recipients, as tappable options.
 *
 * Titles are the labels themselves, because the contract in menus.ts is that a
 * tap arrives back as text equal to the title — and the text the core needs
 * here is exactly what findBeneficiaryByLabel looks up. Ids are namespaced so
 * that a beneficiary someone nicknamed "balance" cannot collide with the
 * static Balance button.
 *
 * A channel that cannot draw a set this wide, or a name this long, returns
 * null from its own renderer and the whole set degrades to a line of text.
 * That path is not a defeat: the names are still readable and typing one back
 * lands in exactly the same place.
 */
export function beneficiaryChoices(beneficiaries: Beneficiary[]): Choice[] {
  return beneficiaries.slice(0, MAX_OFFERED_BENEFICIARIES).map((b) => ({
    id: `bene:${b.id}`,
    title: b.label,
  }));
}

/** The question that opens the flow, with saved names to tap. */
export function recipientPrompt(hasSaved: boolean): string {
  return hasSaved
    ? [
        "Who are you sending to?",
        "",
        "Tap a saved name below, or send me a phone number or a 0x wallet address.",
      ].join("\n")
    : [
        "Who are you sending to?",
        "",
        "Send me their phone number with the country code, like +234 801 234 5678 — or a 0x wallet address.",
        "",
        "Once you've paid someone I'll offer to save them, so next time it's one tap.",
      ].join("\n");
}

/** Asked when the amount arrived first — "send 5" — and the name has not. */
export function recipientPromptWithAmount(amount: string, hasSaved: boolean): string {
  return [
    `${amount} USDC to who?`,
    "",
    hasSaved
      ? "Tap a saved name below, or send me a phone number or a 0x wallet address."
      : "Send me their phone number with the country code, or a 0x wallet address.",
  ].join("\n");
}

export function amountPrompt(recipientLabel: string): string {
  return [
    `How much USDC do you want to send to ${recipientLabel}?`,
    "",
    "Reply with just the amount, like *5* or *12.50*.",
  ].join("\n");
}

export function amountRetryPrompt(recipientLabel: string): string {
  return [
    `I need just a number for that one.`,
    "",
    `How much USDC to ${recipientLabel}? Reply with the amount on its own — *5*, or *12.50*.`,
  ].join("\n");
}

/** What "cancel" or "no" gets, mid-flow. Nothing has been created yet. */
export const ABANDONED_REPLY = [
  "No problem — I've dropped that send.",
  "",
  "Nothing was set up and nothing has left your wallet.",
].join("\n");
