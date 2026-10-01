import type { Quote, SweepLeg } from "./quote";

/**
 * A sweep quote as stored on tella_sweep_send.quote.
 *
 * JSON has no bigint and this must survive a round trip through Postgres, so
 * every amount is a decimal string of integer micro-USDC. What is stored is
 * what the user was shown; the settle job reads it back rather than asking
 * what the fees are today.
 */
export interface QuoteSnapshot {
  v: 1;
  sendMicro: string;
  sendFeeMicro: string;
  sweepFeeMicro: string;
  circleFeeMaxMicro: string;
  totalMaxMicro: string;
  legs: Array<{
    chainId: string;
    blockchain: string;
    displayName: string;
    amountMicro: string;
    maxFeeMicro: string;
    minNetMicro: string;
    finality: 1000 | 2000;
  }>;
}

export function snapshotQuote(quote: Extract<Quote, { kind: "sweep" }>): QuoteSnapshot {
  return {
    v: 1,
    sendMicro: quote.sendMicro.toString(),
    sendFeeMicro: quote.sendFeeMicro.toString(),
    sweepFeeMicro: quote.sweepFeeMicro.toString(),
    circleFeeMaxMicro: quote.circleFeeMaxMicro.toString(),
    totalMaxMicro: quote.totalMaxMicro.toString(),
    legs: quote.legs.map((l) => ({
      chainId: l.chainId,
      blockchain: l.blockchain,
      displayName: l.displayName,
      amountMicro: l.amountMicro.toString(),
      maxFeeMicro: l.maxFeeMicro.toString(),
      minNetMicro: l.minNetMicro.toString(),
      finality: l.finality,
    })),
  };
}

const INT = /^\d+$/;

/** Null for anything that is not a snapshot this code wrote. Never throws. */
export function readSnapshot(value: unknown): Extract<Quote, { kind: "sweep" }> | null {
  if (typeof value !== "object" || value === null) return null;
  const s = value as Partial<QuoteSnapshot>;
  if (s.v !== 1 || !Array.isArray(s.legs) || s.legs.length === 0) return null;
  const nums = [s.sendMicro, s.sendFeeMicro, s.sweepFeeMicro, s.circleFeeMaxMicro, s.totalMaxMicro];
  if (!nums.every((n) => typeof n === "string" && INT.test(n))) return null;

  const legs: SweepLeg[] = [];
  for (const l of s.legs) {
    if (
      typeof l?.chainId !== "string" ||
      typeof l.blockchain !== "string" ||
      typeof l.displayName !== "string" ||
      !INT.test(String(l.amountMicro)) ||
      !INT.test(String(l.maxFeeMicro)) ||
      !INT.test(String(l.minNetMicro)) ||
      (l.finality !== 1000 && l.finality !== 2000)
    ) {
      return null;
    }
    legs.push({
      chainId: l.chainId,
      blockchain: l.blockchain,
      displayName: l.displayName,
      amountMicro: BigInt(l.amountMicro),
      maxFeeMicro: BigInt(l.maxFeeMicro),
      minNetMicro: BigInt(l.minNetMicro),
      finality: l.finality,
    });
  }

  return {
    kind: "sweep",
    sendMicro: BigInt(s.sendMicro!),
    sendFeeMicro: BigInt(s.sendFeeMicro!),
    sweepFeeMicro: BigInt(s.sweepFeeMicro!),
    circleFeeMaxMicro: BigInt(s.circleFeeMaxMicro!),
    totalMaxMicro: BigInt(s.totalMaxMicro!),
    legs,
  };
}
