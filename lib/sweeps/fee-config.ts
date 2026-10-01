import { NO_FEES, type FeeConfig } from "./quote";

/**
 * The fee settings a quote is computed from.
 *
 * Today: no fees, and the sweep size limits from the environment. The admin-set
 * percentage and flat fees (validated on save, no hard-coded policy caps) are
 * the next slice; they replace this function's body and nothing that calls it.
 * Until then tella charges the user nothing of its own for a sweep. Circle's
 * burn and forwarding fee still applies and is always shown.
 *
 * TELLA_MAX_SWEEP_USDC bounds one leg. It defaults to 500 USDC rather than
 * "unlimited" on purpose: a burn cannot be undone and Circle's mint has been
 * seen to stall (circlefin/arc-node issue 200), so the first sweeps should
 * put a modest amount at risk. TELLA_MIN_SWEEP_USDC raises the smallest sweep
 * worth making above the floor Circle's fee already sets.
 */

const DEFAULT_MAX_SWEEP_USDC = 500;

function usdcEnvToMicro(raw: string | undefined, fallback: bigint): bigint {
  const t = raw?.trim();
  if (!t) return fallback;
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(t);
  // An unreadable value falls back to the DEFAULT, never to "no limit".
  if (!m || (BigInt(m[1]) === BigInt(0) && !m[2])) {
    console.error("[sweeps] ignoring unparseable sweep size setting", { raw: t });
    return fallback;
  }
  return BigInt(m[1]) * BigInt(1_000_000) + BigInt((m[2] ?? "").padEnd(6, "0") || "0");
}

export function loadFeeConfig(env: Record<string, string | undefined> = process.env): FeeConfig {
  return {
    ...NO_FEES,
    maxSweepMicro: usdcEnvToMicro(env.TELLA_MAX_SWEEP_USDC, BigInt(DEFAULT_MAX_SWEEP_USDC) * BigInt(1_000_000)),
    minSweepMicro: usdcEnvToMicro(env.TELLA_MIN_SWEEP_USDC, BigInt(0)),
  };
}
