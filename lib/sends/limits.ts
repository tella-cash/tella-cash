import type { tellaUser } from "@/lib/supabase/types";
import { resolveSpendableUsdc, type SpendableUsdc } from "@/lib/wallet/circle";
import { sumSentUsdcSince } from "@/lib/transactions/repository";

/**
 * Spending guards for the send path.
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

const DAILY_WINDOW_HOURS = 24;

export type LimitFailure =
  | { kind: "no_usdc" }
  | { kind: "insufficient"; available: number; requested: number }
  | { kind: "over_per_tx"; cap: number; requested: number }
  | { kind: "over_daily"; cap: number; alreadySent: number; requested: number }
  | { kind: "check_failed" };

export type LimitResult =
  | { ok: true; usdc: SpendableUsdc }
  | { ok: false; failure: LimitFailure };

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function perTxCap(): number {
  return numberFromEnv("TELLA_MAX_SEND_USDC", 100);
}

export function dailyCap(): number {
  return numberFromEnv("TELLA_DAILY_SEND_LIMIT_USDC", 500);
}

export async function checkSendLimits({
  user,
  amount,
}: {
  user: tellaUser;
  amount: string;
}): Promise<LimitResult> {
  const requested = Number.parseFloat(amount);
  if (!Number.isFinite(requested) || requested <= 0) {
    return { ok: false, failure: { kind: "check_failed" } };
  }

  const txCap = perTxCap();
  if (requested > txCap) {
    return { ok: false, failure: { kind: "over_per_tx", cap: txCap, requested } };
  }

  if (!user.circle_wallet_id) {
    return { ok: false, failure: { kind: "no_usdc" } };
  }

  let usdc: SpendableUsdc | null;
  let alreadySent: number;
  try {
    [usdc, alreadySent] = await Promise.all([
      resolveSpendableUsdc(user.circle_wallet_id),
      sumSentUsdcSince(user.id, DAILY_WINDOW_HOURS),
    ]);
  } catch (err) {
    // Fails CLOSED. If we can't establish that a send is within limits, we
    // don't send. An unavailable balance API is not permission to spend.
    console.error("[send-limits] check failed, refusing send", {
      userId: user.id,
      err,
    });
    return { ok: false, failure: { kind: "check_failed" } };
  }

  if (!usdc) {
    return { ok: false, failure: { kind: "no_usdc" } };
  }

  const day = dailyCap();
  if (alreadySent + requested > day) {
    return {
      ok: false,
      failure: { kind: "over_daily", cap: day, alreadySent, requested },
    };
  }

  if (requested > usdc.available) {
    return {
      ok: false,
      failure: {
        kind: "insufficient",
        available: usdc.available,
        requested,
      },
    };
  }

  return { ok: true, usdc };
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
