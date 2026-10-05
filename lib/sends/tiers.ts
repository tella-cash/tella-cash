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
export const HOLD_HOURS = 6;

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

/**
 * How long after a security change every send is held, whatever its size.
 *
 * A PIN reset needs nothing but the chat — possession of the WhatsApp or
 * Telegram account IS the recovery factor. So the PIN protects nothing
 * against someone holding the chat unless there is a gap between "set a new
 * PIN" and "money moves" in which the owner can hear about it and freeze.
 * This is that gap. Passkey removal and linking a new channel count too:
 * each is something an attacker holding the chat does on the way to a drain.
 *
 * Was 48, now equal to HOLD_HOURS (both were cut: the window from 48 to 6, the
 * hold from 24 to 6). A send made inside the window is held for HOLD_HOURS, one
 * made after it is not held at all, so this is how long someone holding the
 * chat has to wait before a send goes out normally, and how long the owner has
 * to notice and freeze before then.
 */
export const FACTOR_CHANGE_HOLD_HOURS = 6;

/** True while a recent security change puts every send on hold. */
export function inFactorChangeWindow(
  factorsChangedAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!factorsChangedAt) return false;
  const changed = new Date(factorsChangedAt).getTime();
  if (!Number.isFinite(changed)) return false;
  return now - changed < FACTOR_CHANGE_HOLD_HOURS * 60 * 60 * 1000;
}

export function tierFor(
  amount: number,
  limits: ResolvedLimits,
  factorsChangedAt?: string | null,
  now: number = Date.now(),
): SendTier {
  if (!Number.isFinite(amount) || amount <= 0) return "normal";
  if (inFactorChangeWindow(factorsChangedAt, now)) return "hold";
  return amount > holdThreshold(limits) ? "hold" : "normal";
}
