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
 * The hold threshold, from the environment. Infinity means no holds.
 *
 * OFF BY DEFAULT. A 24-hour delay on a payment is the single most intrusive
 * thing this product can do to someone, and it lands on exactly the people
 * moving the most money — who are least willing to wait for it.
 *
 * It used to derive from the per-transaction cap (half of it), which was neat
 * and wrong: re-imposing a cap during an incident would have silently
 * reintroduced 24-hour delays as a side effect, which is not a thing anybody
 * would have chosen deliberately at that moment. It gets its own switch.
 *
 * Per-user thresholds in tella_user_limits still apply, so a cautious user
 * can opt into a delay on their own account without it being imposed on
 * everyone.
 */
const DISABLED = new Set(["off", "none", "never", "0", "false"]);

function envHoldThreshold(): number {
  const raw = process.env.TELLA_HOLD_THRESHOLD_USDC?.trim();
  if (!raw) return Infinity;
  if (DISABLED.has(raw.toLowerCase())) return Infinity;

  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) {
    console.error("[tiers] ignoring unparseable hold threshold", { raw });
    return Infinity;
  }
  return n;
}

export function holdThreshold(limits: ResolvedLimits): number {
  return limits.holdThreshold ?? envHoldThreshold();
}

export function tierFor(amount: number, limits: ResolvedLimits): SendTier {
  if (!Number.isFinite(amount) || amount <= 0) return "normal";
  return amount > holdThreshold(limits) ? "hold" : "normal";
}
