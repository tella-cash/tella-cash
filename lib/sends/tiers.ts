import type { ResolvedLimits } from "./limits";

/**
 * How much friction an amount has to clear.
 *
 * The original design had three tiers, with a middle one requiring two
 * DIFFERENT factors. TOTP was dropped, and without it there is no second
 * factor to step up to: PIN and passkey are mutually exclusive under the
 * enrollment gate, so "prove two of them" is unsatisfiable for essentially
 * every account. Shipping a tier that always fails, or that silently
 * downgrades to one factor, would be worse than not having it — so there are
 * two tiers, and the hold does the work.
 *
 * That is not much of a loss. Step-up asks the user to prove themselves
 * harder, which stops an attacker who has one factor and not another. The
 * hold does something strictly broader: it stops an attacker who has
 * EVERYTHING, because the defence is elapsed time and a notification rather
 * than a credential.
 */
export type SendTier = "normal" | "hold";

/** How long a held send waits. Long enough to sleep through and notice. */
export const HOLD_HOURS = 24;

/**
 * Default hold threshold as a fraction of the per-transaction cap.
 *
 * Expressed relative to the cap rather than as its own absolute number so a
 * deployment that tightens TELLA_MAX_SEND_USDC during an incident tightens
 * this with it, instead of leaving a hold threshold above the new cap where
 * it would never fire.
 */
const DEFAULT_HOLD_FRACTION = 0.5;

export function holdThreshold(limits: ResolvedLimits): number {
  return limits.holdThreshold ?? limits.perTx * DEFAULT_HOLD_FRACTION;
}

/**
 * Pure, so the boundary is testable without a wallet.
 *
 * Amounts strictly ABOVE the threshold are held. At exactly the threshold a
 * send goes straight through, which matters because a user who sets their own
 * threshold to 50 means "50 is fine, more than 50 is not".
 */
export function tierFor(amount: number, limits: ResolvedLimits): SendTier {
  if (!Number.isFinite(amount) || amount <= 0) return "normal";
  return amount > holdThreshold(limits) ? "hold" : "normal";
}
