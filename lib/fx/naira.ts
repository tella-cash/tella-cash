/**
 * USD→NGN exchange rate lookup. USDC is the user-facing unit everywhere —
 * this is used only to compute a Naira figure for internal record-keeping
 * (stored on sends/transactions), not for anything shown to users.
 *
 * Primary + mirror are both free, keyless, static-JSON endpoints (no rate
 * limit) from the fawazahmed0/currency-api project. If both are
 * unreachable, fall back to a hardcoded rate rather than blocking money
 * movement on a third-party API being up.
 */

const PRIMARY_URL =
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@1/latest/currencies/usd/ngn.json";
const FALLBACK_URL =
  "https://latest.currency-api.pages.dev/v1/currencies/usd/ngn.json";
const FALLBACK_RATE = 1600;
const CACHE_TTL_MS = 60 * 60 * 1000;

let cached: { rate: number; fetchedAt: number } | null = null;

export async function getUsdToNgnRate(): Promise<number> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rate;
  }

  const rate =
    (await fetchRate(PRIMARY_URL)) ??
    (await fetchRate(FALLBACK_URL)) ??
    FALLBACK_RATE;

  cached = { rate, fetchedAt: Date.now() };
  return rate;
}

async function fetchRate(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { ngn?: unknown };
    const rate = data.ngn;
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch (err) {
    console.warn("[fx] rate fetch failed", { url, err });
    return null;
  }
}

export function usdToNgn(usdAmount: number, rate: number): number {
  return usdAmount * rate;
}

export function ngnToUsd(ngnAmount: number, rate: number): number {
  return ngnAmount / rate;
}

const nairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

export function formatNaira(amount: number): string {
  return nairaFormatter.format(amount);
}
