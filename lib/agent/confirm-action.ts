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
 * Narrow a pending row's payload.
 *
 * The row's `kind` column is the authority — this only exists so TypeScript
 * agrees, and so a malformed payload on a correctly-kinded row is caught
 * rather than read as undefined.
 */
export function isConfirmPayload(
  payload: PendingActionPayload,
): payload is ConfirmPendingPayload {
  return typeof (payload as ConfirmPendingPayload).action === "string";
}
