import type {
  BeneficiaryPendingPayload,
  PendingActionPayload,
} from "@/lib/supabase/types";
import { isAffirmation, isDeclination, isNegation } from "@/lib/agent/confirm-action";

/**
 * "Want to save this recipient?", read locally.
 *
 * This file exists for the reason lib/agent/confirm-action.ts exists, and the
 * reason lib/agent/send-flow.ts parses amounts itself: a question tella asked
 * should not need a network call to hear the answer.
 *
 * The beneficiary offer used to run on sendam-ai's stateless token mechanism.
 * The recipient lived inside an opaque token minted by POST /flow/start, and
 * every reply went back to POST /decode to be told whether it meant yes. That
 * put a language model on both ends of "reply yes or no", and it put the mint
 * BEFORE the question — so when /flow/start was slow, or its circuit breaker
 * was already open because /decode had tripped it, the user was never asked at
 * all. Silently, once, with no retry, because the send was over by then.
 *
 * What the decoder was actually contributing was tolerance for replies that
 * are not yes or no. That is kept, and it is kept in a better form: an
 * unrecognised reply is read as the name the user thought we were asking for
 * and offered straight back — "Did you mean to save them as Chidi?" — which
 * the user can correct. A guess you show someone is worth more than a guess
 * you act on.
 */

/** Narrow a pending row's payload. The row's `kind` column is the authority. */
export function isBeneficiaryPayload(
  payload: PendingActionPayload,
): payload is BeneficiaryPendingPayload {
  return (payload as BeneficiaryPendingPayload).action === "save_beneficiary";
}

/**
 * Beneficiary labels are looser than user names — "Mum", "Landlord 2" etc.
 *
 * Thirty characters is not arbitrary: the guided send offers saved names as
 * tappable options, and lib/meta/client.ts matches a tapped title back
 * against them, so a label that cannot survive a button title cannot be
 * saved. See the note there.
 */
export function isValidBeneficiaryLabel(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.length < 2 || trimmed.length > 30) return false;
  return /^[\p{L}\p{N}][\p{L}\p{N}\s'-]*[\p{L}\p{N}]$/u.test(trimmed);
}

/**
 * How long a reply may be and still be read as a proposed name.
 *
 * Deliberately looser than isValidBeneficiaryLabel's 30, so a slightly
 * too-long name still gets offered back and earns the specific "that doesn't
 * look like a name I can save" answer rather than a blank re-ask. Someone
 * typing a paragraph is not proposing a name, and quoting it back in full
 * would be nonsense.
 */
export const MAX_PROPOSED_LABEL_LENGTH = 60;

/** What one reply at the `confirm` step means. */
export type ConfirmReading =
  /** A plain no. The offer is dropped. */
  | { kind: "declined" }
  /**
   * A plain yes. `label` is set when a name was already proposed and this
   * yes accepts it, and null when we still have to ask for one.
   */
  | { kind: "accepted"; label: string | null }
  /** Not yes or no, but it could be a name. Offer it back for confirmation. */
  | { kind: "proposed"; label: string }
  /** Nothing usable. Re-ask for a yes or a no. */
  | { kind: "unreadable" };

/**
 * Read a reply to "save this recipient?".
 *
 * Order matters and it is not the obvious one. A declination is checked
 * first, because isDeclination covers "cancel" and "stop" as well as "no" and
 * someone reaching for either of those wants out, not a name. Affirmation
 * comes next. Only what neither pattern claims is read as a name — which is
 * why both patterns are anchored: a loose one would eat "Yes-Man", a real
 * thing to call a beneficiary.
 */
export function readConfirmReply(
  text: string,
  payload: BeneficiaryPendingPayload,
): ConfirmReading {
  const trimmed = text.trim();

  if (isDeclination(trimmed) || isNegation(trimmed)) return { kind: "declined" };

  if (isAffirmation(trimmed)) {
    return { kind: "accepted", label: payload.proposedLabel ?? null };
  }

  // A name already proposed and not confirmed means the user answered
  // "did you mean X?" with something other than yes or no. Read that as a
  // correction — a second name — rather than as noise.
  if (!trimmed || trimmed.length > MAX_PROPOSED_LABEL_LENGTH) {
    return { kind: "unreadable" };
  }

  // A multi-line reply is a message, not a name.
  if (/[\r\n]/.test(trimmed)) return { kind: "unreadable" };

  return { kind: "proposed", label: trimmed };
}

/** The offer itself, worded once so the confirm path and the hold-release
 *  cron cannot drift apart. */
export function beneficiaryOfferPrompt(recipientLabel: string): string {
  return `Want to save ${recipientLabel} as a beneficiary? Reply *yes* or *no*.`;
}

export function beneficiaryNamePrompt(): string {
  return "Nice — what would you like to save them as?";
}

export function beneficiaryProposalPrompt(label: string): string {
  return [
    `Did you mean to save them as *${label}*?`,
    "",
    "Reply *yes* to save it, or *no* to skip.",
  ].join("\n");
}

export function beneficiaryReAskPrompt(): string {
  return "I need a *yes* or a *no* here — save this recipient as a beneficiary?";
}

export const BENEFICIARY_DECLINED_REPLY =
  "No problem, skipped. Let me know if you change your mind.";
