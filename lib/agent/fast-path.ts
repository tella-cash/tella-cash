import type { DecodedIntent } from "@/lib/sendam-ai/client";
import { isEvmAddress, normalizePhone } from "@/lib/utils/phone";

/**
 * Tier 0: intents resolved without leaving this server.
 *
 * Two things justify it. The obvious one is resilience — when the decoder is
 * slow or down, "balance" should still answer, and it now does. The less
 * obvious one is that a large share of inbound messages are not free text at
 * all: they are taps on buttons whose titles WE wrote, arriving back as the
 * literal string we chose. Sending those to a language model to be told what
 * they mean is pure cost and pure risk on a closed set we already control.
 *
 * THE RULE THIS FILE IS BUILT ON, and the one to re-read before "improving"
 * any pattern below:
 *
 *   CONSERVATIVE ON SEND, LIBERAL ON READS.
 *
 * A false positive on `balance` wastes one message. A false positive on a
 * send amount or recipient moves the wrong money to the wrong person. So the
 * read patterns are generous and the send pattern is anchored, single-shaped,
 * and refuses anything it does not fully consume. Returning null is always
 * safe: it just means a slower, smarter tier gets the message.
 */

function intent(
  kind: DecodedIntent["intent"],
  extra: Partial<DecodedIntent> = {},
): DecodedIntent {
  return {
    intent: kind,
    amount: null,
    asset: null,
    recipient: null,
    // Tier 0 only ever fires on exact, closed-set matches. There is no
    // guessing here to express doubt about.
    confidence: 1,
    ...extra,
  };
}

/**
 * Titles of the interactive buttons and list rows tella itself sends, exactly
 * as WhatsApp echoes them back on a tap.
 *
 * These are authored in lib/meta/client.ts and mirrored in the Twilio content
 * templates (create-content-templates.ts). If a title changes there, it has
 * to change here, and the test file pins the pairs so a drift shows up as a
 * failure rather than as a mysterious rise in decoder cost.
 */
const TAPPED_TITLES: Record<string, DecodedIntent["intent"]> = {
  balance: "BALANCE",
  "my address": "ADDRESS",
  send: "SEND",
  "send usdc": "SEND",
  history: "HISTORY",
  "how it works": "HOW_IT_WORKS",
  "is it safe?": "SECURITY",
  menu: "HELP",
};

/**
 * Typed shorthands. Generous on purpose: every one of these is a read, and
 * the worst case for a wrong match is one unhelpful reply.
 */
const TYPED: Array<[RegExp, DecodedIntent["intent"]]> = [
  [/^(balance|bal|my balance|whats my balance|what'?s my balance)$/i, "BALANCE"],
  [/^(address|my address|wallet address|my wallet address|receive)$/i, "ADDRESS"],
  [/^(history|transactions|my transactions|recent)$/i, "HISTORY"],
  [/^(help|menu|options|commands|start)$/i, "HELP"],
  [/^(cancel|stop it|nevermind|never mind)$/i, "CANCEL"],
  [/^(hi|hey|hello|yo|good morning|good afternoon|good evening)$/i, "GREETING"],
  [/^(thanks|thank you|thx|ta)$/i, "THANKS"],
  [/^(bye|goodbye|later|see you)$/i, "GOODBYE"],
];

/**
 * The one send shape tier 0 will accept.
 *
 * Anchored at both ends, so anything with trailing words falls through. One
 * optional asset word. Nothing else — no "please", no memo, no "and also".
 */
const CANONICAL_SEND =
  /^send\s+(\d+(?:\.\d{1,6})?)\s*(usdc)?\s+to\s+(.+?)\s*$/i;

/** A single word of a name: letters, and the punctuation names actually use. */
const SINGLE_WORD_LABEL = /^[a-z][a-z'’-]{0,31}$/i;

export function fastPathDecode(text: string): DecodedIntent | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();

  const tapped = TAPPED_TITLES[lowered];
  if (tapped) return intent(tapped);

  for (const [pattern, kind] of TYPED) {
    if (pattern.test(trimmed)) return intent(kind);
  }

  return canonicalSend(trimmed);
}

/**
 * The careful half.
 *
 * Every rejection here is deliberate and costs only a fall-through to a tier
 * that can think about it. Accepting something ambiguous costs money.
 */
function canonicalSend(text: string): DecodedIntent | null {
  const match = CANONICAL_SEND.exec(text);
  if (!match) return null;

  const [, rawAmount, , rawRecipient] = match;

  // The regex already bounds the shape, but Number is the thing downstream
  // actually relies on, so it is what gets checked.
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const recipient = rawRecipient.trim();
  if (!recipient) return null;

  // An address or a phone number is unambiguous: it either parses or it does
  // not, and there is no interpretation in between.
  if (isEvmAddress(recipient) || normalizePhone(recipient)) {
    return intent("SEND", { amount: rawAmount, asset: "USDC", recipient });
  }

  // A bare single word is a beneficiary label and is safe enough: worst case
  // it misses and the user is told no such beneficiary is saved.
  //
  // Anything longer falls through on purpose. "send 5 to chidi please" and
  // "send 5 to my landlord for rent" both have a real recipient buried in
  // prose, and guessing which words are the name is exactly the judgement
  // this tier must not make.
  if (SINGLE_WORD_LABEL.test(recipient)) {
    return intent("SEND", { amount: rawAmount, asset: "USDC", recipient });
  }

  return null;
}
