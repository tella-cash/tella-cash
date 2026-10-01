/**
 * USDC as integer micro-units (6 decimals), the only form money takes inside a
 * sweep.
 *
 * Nothing here touches a float. "1.1" parsed as a number and multiplied is how
 * a fee comes out one micro-unit off, and on a burn that is not a rounding
 * error someone can ask about later.
 */

const DECIMALS = 6;
const SCALE = BigInt(1000000);
const ZERO = BigInt(0);

/**
 * "12.5" → 12500000n. Returns null for anything that is not a plain
 * non-negative decimal, and for more than six places: a longer string means
 * someone else's arithmetic leaked in, and truncating it here would hide that.
 */
export function parseMicro(value: string): bigint | null {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!m) return null;
  const whole = BigInt(m[1]);
  const frac = BigInt((m[2] ?? "").padEnd(DECIMALS, "0") || "0");
  return whole * SCALE + frac;
}

/**
 * Parse what Circle's balance API gives back: a decimal that may carry more
 * than six places (the native entry carries eighteen). Extra places are
 * TRUNCATED, never rounded — every rule near a balance errs downward, because
 * quoting more than a wallet holds turns into a transfer that reverts.
 */
export function parseMicroTruncating(value: string): bigint | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) return null;
  const frac = (m[2] ?? "").slice(0, DECIMALS).padEnd(DECIMALS, "0");
  return BigInt(m[1]) * SCALE + BigInt(frac);
}

/** 12500000n → "12.5". No trailing zeros, no exponent. */
export function formatMicro(micro: bigint): string {
  if (micro < ZERO) throw new Error("formatMicro: negative amount");
  const whole = micro / SCALE;
  const frac = (micro % SCALE).toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Stored as text (see migrations/0029_sweeps.sql). Throws on a value that is not. */
export function microFromDb(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error(`microFromDb: not an integer string: ${value}`);
  return BigInt(value);
}

/**
 * Circle quotes its fast-transfer fee in basis points and the figure is
 * fractional (0.325 at the time of writing). Carried as thousandths of a basis
 * point so the arithmetic below stays in integers.
 */
export function toMilliBps(bps: number): bigint | null {
  if (!Number.isFinite(bps) || bps < 0 || bps > 10_000) return null;
  // Rounded UP (less float noise): a fee ceiling that is a hair under the
  // quote is refused by Circle, one a hair over costs nothing visible.
  return BigInt(Math.ceil(bps * 1000 - 1e-9));
}

/** ceil(amount * milliBps / 10_000_000). Rounded UP: the fee must cover the quote. */
export function feeCeil(amount: bigint, milliBps: bigint): bigint {
  const d = BigInt(10_000_000);
  return (amount * milliBps + d - BigInt(1)) / d;
}
