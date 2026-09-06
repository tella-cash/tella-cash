import type {
  ConfirmPendingPayload,
  PendingActionPayload,
} from "@/lib/supabase/types";

/**
 * Yes and no, matched locally.
 *
 * This exists for one reason and it is the same reason
 * detect-freeze-request.ts exists: the kill switch must not acquire a
 * network dependency. Splitting a freeze into two messages already costs
 * time; routing the second message through the decoder would mean that a
 * sendam-ai outage leaves someone who typed "freeze", read the prompt, and
 * typed "yes" with an unfrozen account and a "I'm having trouble
 * understanding right now" reply. That would be the single worst moment
 * this system can produce.
 *
 * So: no decode, no model, no fetch. Two anchored patterns and nothing else.
 *
 * They are anchored on purpose. A confirmation is a one-word answer, and
 * anything longer is a person saying something else — which the handler
 * treats as declining and then answers normally, rather than guessing.
 */

const AFFIRMATIONS =
  /^\s*(freeze|freeze\s+it|yes|yeah|yep|y|ok|okay|confirm|confirmed|do\s+it|go\s+ahead)\s*[.!]?\s*$/i;

const DECLINATIONS =
  /^\s*(no|nope|nah|n|cancel|stop|not\s+now|nevermind|never\s+mind)\s*[.!]?\s*$/i;

export function isAffirmation(text: string): boolean {
  return AFFIRMATIONS.test(text);
}

export function isDeclination(text: string): boolean {
  return DECLINATIONS.test(text);
}

/**
 * A plain "no", and nothing else.
 *
 * Narrower than isDeclination on purpose, and the narrowness is the whole
 * point. buildConfirmBody tells the user "Reply *no* to cancel", and until
 * now nothing kept that promise: a pending SEND lives in tella_pending_send,
 * while isDeclination is only ever consulted for a pending ACTION — the
 * freeze confirmation. So "no" fell through to the decoder, came back
 * UNKNOWN, and the user was shown the generic help menu while the confirm
 * link they were trying to kill stayed live for the rest of its five
 * minutes. That is the worst shape a cancel can fail in: it looks like the
 * bot did not understand, so the user tries again instead of tapping the
 * link they now need to avoid.
 *
 * It deliberately does NOT include "cancel", "stop" or "nevermind". Those
 * already route through the CANCEL intent to cancelMostRecent, which reaches
 * a queued 24-hour transfer first — and that ordering is correct for someone
 * who typed the word out of the blue. "no" is different: it is an answer to
 * the question directly in front of the user, so it resolves to the send
 * that asked it.
 */
const NEGATIONS =
  /^\s*(no|nope|nah|n|no\s+thanks|no\s+thank\s+you|don'?t|do\s+not)\s*[.!]?\s*$/i;

export function isNegation(text: string): boolean {
  return NEGATIONS.test(text);
}

/**
 * Narrow a pending row's payload.
 *
 * The row's `kind` column is the authority — this only exists so TypeScript
 * agrees, and so a malformed payload on a correctly-kinded row is caught
 * rather than read as undefined.
 */
export function isConfirmPayload(
  payload: PendingActionPayload,
): payload is ConfirmPendingPayload {
  // Matched on the literal, not on "has an action field". The guided send
  // payload also carries `action`, so the looser test that was here would have
  // narrowed a send row to ConfirmPendingPayload and read `source`/`reason`
  // off a shape that has neither. Dispatch is on `kind` and never reaches
  // that, but a type guard that is only correct because of where it is called
  // is a guard waiting to be called somewhere else.
  return (payload as ConfirmPendingPayload).action === "freeze";
}
