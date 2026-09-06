import type { tellaUser } from "@/lib/supabase/types";
import { resolveSpendableUsdc, type SpendableUsdc } from "@/lib/wallet/circle";
import { sumSentUsdcSince } from "@/lib/transactions/repository";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sumHeldUsdc } from "@/lib/held_sends/repository";

/**
 * Spending guards for the send path.
 *
 * THE DEPLOYMENT-WIDE CAPS ARE OFF BY DEFAULT. Users hated them, and a cap
 * that stops a legitimate person paying their rent is a cap that gets the
 * product uninstalled. What remains unconditional is the only check nobody
 * argues with: you cannot send money you do not have.
 *
 * Nothing was deleted to achieve that. Setting TELLA_MAX_SEND_USDC or
 * TELLA_DAILY_SEND_LIMIT_USDC re-imposes them globally without a deploy,
 * which is the property these were env vars for in the first place, and
 * per-user ceilings in tella_user_limits still apply for anyone who opts
 * into one.
 *
 * Worth being clear-eyed about the trade: these bounded the damage a
 * compromised account could do in a single burst. Without them that bound is
 * gone, and the freeze and panic code are what is left — both of which
 * depend on somebody noticing.
 *
 * Before this, nothing checked whether a user could afford a send or whether
 * the amount was sane — the first thing to notice a 10,000 USDC typo, or a
 * compromised session draining an account, was Circle. Three checks now sit
 * in front of every transfer:
 *
 *   1. Balance — reject before calling Circle rather than after it fails.
 *   2. Per-transaction cap — bounds the damage of a single bad confirm.
 *   3. Rolling 24h total — bounds the damage of a series of them.
 *
 * Both caps are env-configurable so they can be tightened during an incident
 * without a deploy.
 *
 * Checked twice on purpose: once in the agent when the send is composed (so
 * the user gets a useful message before a confirm link is minted) and again
 * in executePendingSend immediately before the transfer (because the pending
 * row can sit for five minutes, and the first check is advisory by then).
 */

export const DAILY_WINDOW_HOURS = 24;

export type LimitFailure =
  | { kind: "no_usdc" }
  | { kind: "insufficient"; available: number; requested: number }
  | { kind: "over_per_tx"; cap: number; requested: number }
  | { kind: "over_daily"; cap: number; alreadySent: number; requested: number }
  | { kind: "check_failed" };

export type LimitResult =
  | { ok: true; usdc: SpendableUsdc; limits: ResolvedLimits }
  | { ok: false; failure: LimitFailure };

/**
 * A cap from the environment, where "no cap" is a real answer.
 *
 * Returns Infinity when unset or explicitly switched off, and Infinity is not
 * a fudge here — every check below is a `>` comparison, so an infinite cap
 * simply never fails one. Nothing needs an `if (capsEnabled)` branch, which
 * means there is no second code path to get wrong and no way for the checks
 * to be half-applied.
 *
 * Accepts `off`, `none`, `unlimited` or `0` so switching them back on during
 * an incident is a config change with an obvious inverse, rather than
 * somebody having to remember which enormous number meant "disabled".
 */
const DISABLED = new Set(["off", "none", "unlimited", "0", "false"]);

function capFromEnv(name: string): number {
  const raw = process.env[name]?.trim();
  if (!raw) return Infinity;
  if (DISABLED.has(raw.toLowerCase())) return Infinity;

  const n = Number.parseFloat(raw);
  // A malformed value must not silently become "no limit" — if someone set
  // this deliberately, they meant to constrain something, and the safe
  // reading of a typo is the value they last successfully used. There is no
  // such value to fall back to, so refuse to guess and treat it as unset,
  // loudly.
  if (!Number.isFinite(n) || n <= 0) {
    console.error("[send-limits] ignoring unparseable cap", { name, raw });
    return Infinity;
  }
  return n;
}

/**
 * The deployment-wide defaults, applying to every user without an override.
 *
 * These stay env vars on purpose. The header above explains why: they are the
 * one knob that can be tightened mid-incident without a deploy. Backfilling
 * them into per-user rows would quietly destroy that property, so overrides
 * are stored sparsely and NULL keeps meaning "whatever the default is now".
 */
export function defaultPerTxCap(): number {
  return capFromEnv("TELLA_MAX_SEND_USDC");
}

export function defaultDailyCap(): number {
  return capFromEnv("TELLA_DAILY_SEND_LIMIT_USDC");
}

export interface ResolvedLimits {
  perTx: number;
  daily: number;
  /** Above this, a send is held rather than executed. Null means derive it. */
  holdThreshold: number | null;
  /** True when this user has an override row, for logging and settings UI. */
  customised: boolean;
}

/**
 * A user's effective caps: their overrides where set, the deployment default
 * everywhere else.
 *
 * Note what this does NOT do — it never takes the larger of the two. An
 * override is only ever consulted as the user's own ceiling, and the env
 * default still applies wherever they have not set one, so tightening the
 * deployment-wide value during an incident cannot be escaped by having a row
 * here. A user raising their own limit above the deployment cap is a decision
 * for a settings surface that does not exist yet; until it does, min() is the
 * conservative reading and the one that cannot surprise anyone.
 */
export async function resolveLimits(userId: string): Promise<ResolvedLimits> {
  const perTxDefault = defaultPerTxCap();
  const dailyDefault = defaultDailyCap();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_user_limits")
    .select("per_tx_cap_usdc, daily_cap_usdc, hold_threshold_usdc")
    .eq("user_id", userId)
    .maybeSingle();

  // Throws rather than defaulting. checkSendLimits already fails closed on
  // any error in this path, and "we could not read your limits" must not
  // resolve to "so use the generous ones".
  if (error) throw new Error(`resolveLimits failed: ${error.message}`);

  return mergeLimits(
    data as LimitOverrideRow | null,
    { perTx: perTxDefault, daily: dailyDefault },
  );
}

export interface LimitOverrideRow {
  per_tx_cap_usdc: number | null;
  daily_cap_usdc: number | null;
  hold_threshold_usdc?: number | null;
}

/**
 * The resolution rule, separated from the query so it can be tested without
 * a database. Three cases and they are easy to get subtly wrong:
 *
 *   no row        → the defaults, untouched
 *   row, NULL col → the default for that column only; the other may still
 *                   be overridden, since a row need not set both
 *   row, a value  → the LOWER of the two, never the higher
 *
 * That last one is the important one. An override is a user's own ceiling,
 * not a licence to exceed the deployment-wide cap, so tightening the env var
 * during an incident still binds everybody — including users who have set
 * their own, higher, limit.
 */
export function mergeLimits(
  row: LimitOverrideRow | null,
  defaults: { perTx: number; daily: number },
): ResolvedLimits {
  if (!row) {
    return {
      perTx: defaults.perTx,
      daily: defaults.daily,
      holdThreshold: null,
      customised: false,
    };
  }

  const pick = (override: number | null, fallback: number): number =>
    override === null || !Number.isFinite(override) || override <= 0
      ? fallback
      : Math.min(override, fallback);

  const hold = row.hold_threshold_usdc;

  return {
    perTx: pick(row.per_tx_cap_usdc, defaults.perTx),
    daily: pick(row.daily_cap_usdc, defaults.daily),
    // Unlike the caps, a user's hold threshold is taken as given rather than
    // min'd against a default. A cap is a ceiling the deployment enforces; a
    // hold threshold is the user saying how much they are comfortable moving
    // without a day to think about it, and lowering it is the only direction
    // that adds safety. There is no deployment-wide value to undercut.
    holdThreshold:
      hold === null || hold === undefined || !Number.isFinite(hold) || hold <= 0
        ? null
        : hold,
    customised: true,
  };
}

export async function checkSendLimits({
  user,
  amount,
  excludeHeldSendId,
}: {
  user: tellaUser;
  amount: string;
  /**
   * A held send that must not count against itself.
   *
   * Only the release job passes this, and only for the row it is about to
   * execute. Every other caller leaves it unset, so a hold still reserves its
   * amount against every new send the user composes — which is the whole
   * reason sumHeldUsdc exists. See its comment for what went wrong without it.
   */
  excludeHeldSendId?: string;
}): Promise<LimitResult> {
  const requested = Number.parseFloat(amount);
  if (!Number.isFinite(requested) || requested <= 0) {
    return { ok: false, failure: { kind: "check_failed" } };
  }

  if (!user.circle_wallet_id) {
    return { ok: false, failure: { kind: "no_usdc" } };
  }

  let usdc: SpendableUsdc | null;
  let alreadySent: number;
  let limits: ResolvedLimits;
  let held: number;
  try {
    // Resolving the user's caps joins the existing pair rather than running
    // before them, so per-user limits cost no extra round trip. The
    // consequence is that the per-transaction check below now happens after
    // this fetch instead of before it — one more query before an over-cap
    // send is rejected, and the same answer.
    [usdc, alreadySent, limits, held] = await Promise.all([
      resolveSpendableUsdc(user.circle_wallet_id),
      sumSentUsdcSince(user.id, DAILY_WINDOW_HOURS),
      resolveLimits(user.id),
      sumHeldUsdc(user.id, excludeHeldSendId),
    ]);
  } catch (err) {
    // Fails CLOSED. If we can't establish that a send is within limits, we
    // don't send. An unavailable balance API is not permission to spend, and
    // neither is an unreadable limits row.
    console.error("[send-limits] check failed, refusing send", {
      userId: user.id,
      err,
    });
    return { ok: false, failure: { kind: "check_failed" } };
  }

  // Checked in this order deliberately: the per-transaction cap is about the
  // amount alone, the daily cap adds history, and affordability adds the
  // wallet. Each message is more specific than the last, so the first one
  // that fails is the most useful thing to say.
  if (requested > limits.perTx) {
    return {
      ok: false,
      failure: { kind: "over_per_tx", cap: limits.perTx, requested },
    };
  }

  if (!usdc) {
    return { ok: false, failure: { kind: "no_usdc" } };
  }

  // Held sends are counted as already committed against BOTH the daily
  // allowance and the balance. They have produced no tella_transactions row
  // and Circle's balance knows nothing about them, so without this a queued
  // transfer is invisible to every check — and two large holds could each
  // pass on their own at authorization time, then both fail a day later with
  // "insufficient balance". Fail-closed, but a baffling thing to receive
  // twenty-four hours after the fact.
  //
  // A hold released across the boundary is briefly counted twice, once as
  // reserved and once as sent. That double-count is conservative in the safe
  // direction, so it is documented rather than papered over.
  const committed = alreadySent + held;

  if (committed + requested > limits.daily) {
    return {
      ok: false,
      failure: {
        kind: "over_daily",
        cap: limits.daily,
        alreadySent: committed,
        requested,
      },
    };
  }

  const spendable = usdc.available - held;
  if (requested > spendable) {
    return {
      ok: false,
      failure: {
        kind: "insufficient",
        available: Math.max(spendable, 0),
        requested,
      },
    };
  }

  return { ok: true, usdc, limits };
}

/** Chat-facing explanation. Says what's wrong and what to do about it. */
export function formatLimitFailure(failure: LimitFailure): string {
  switch (failure.kind) {
    case "no_usdc":
      return "You don't have any USDC to send yet. Ask me for your address to top up.";
    case "insufficient":
      return [
        `You've got ${trim(failure.available)} USDC — not enough to send ${trim(failure.requested)}.`,
        "",
        "Try a smaller amount, or top up first.",
      ].join("\n");
    case "over_per_tx":
      return `${trim(failure.requested)} USDC is over the ${trim(failure.cap)} USDC per-transfer limit. Send it in smaller amounts.`;
    case "over_daily":
      return [
        `That would put you over the ${trim(failure.cap)} USDC daily limit — you've sent ${trim(failure.alreadySent)} USDC in the last 24 hours.`,
        "",
        "The limit rolls, so this frees up as those transfers age out.",
      ].join("\n");
    case "check_failed":
      return "I couldn't check your balance just now, so I didn't send anything. Try again in a moment.";
  }
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}
