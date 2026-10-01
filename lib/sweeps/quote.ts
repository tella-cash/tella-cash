import { computeMaxFee, type RouteFees } from "./cctp";
import { feeCeil } from "./micro";

/**
 * What a send would cost, and which sweeps (if any) it takes to make it.
 *
 * Sends leave from Arc only. A user's balance can be spread over Arc and other
 * chains; this is the one place that turns "send 40" into either "Arc has it"
 * or "move this much from Base first, and here is every fee on the way". It is
 * pure: balances, Circle's quoted prices and tella's fee settings come in as
 * values, a plan comes out, and nothing here reads a database or a network.
 * That is what lets the numbers a user is shown be tested to the micro-USDC,
 * and what lets the send snapshot them and execute from the snapshot rather
 * than from whatever the config says later.
 *
 * WHERE THE MONEY COMES FROM. Three fees can apply, all in integer micro-USDC:
 *
 *   send fee    tella's, a percentage with a floor and a ceiling, set by an
 *               admin. Taken on Arc, from the same balance the send uses.
 *   sweep fee   tella's, a flat amount, set by an admin, charged only when a
 *               sweep is needed. It covers the gas tella sponsors on the
 *               source chain, so no price oracle is involved. Taken on Arc.
 *   Circle's    the burn and forwarding fee, kept by Circle out of the burned
 *               amount. Circle keeps all of the ceiling we set, so it is
 *               quoted as a ceiling ("up to") and the unspent difference is
 *               never refunded — it stays inside what was burned.
 *
 * Both of tella's fees are settled on Arc, so a sweep only has to deliver
 * enough to cover `send + sendFee + sweepFee`; the sweep saga itself never
 * needs to know tella's fees exist.
 *
 * ROUNDING. Everything rounds in the direction that cannot leave a user short:
 * fees up, amounts a sweep must deliver up. A quote that is a micro-USDC
 * generous costs nothing visible; one that is a micro-USDC short is a send
 * that fails after money has already moved.
 */

const ZERO = BigInt(0);
const ONE = BigInt(1);
const BPS_DENOM = BigInt(10_000);
const MILLI_BPS_DENOM = BigInt(10_000_000);

/** Most legs one send will use. More than this is a balance too scattered to be worth chasing. */
export const MAX_SWEEP_LEGS = 3;

export interface FeeConfig {
  /** tella's send fee in basis points of the amount. 0 = none. */
  sendFeeBps: number;
  sendFeeMinMicro: bigint;
  /** null = no ceiling. */
  sendFeeMaxMicro: bigint | null;
  /** Flat, charged when a sweep is needed. 0 = none. */
  sweepFeeMicro: bigint;
  /** The most one sweep may move. Applies per leg. */
  maxSweepMicro: bigint;
  /** The least one sweep is worth making, on top of the floor Circle's own fee sets. 0 = no extra floor. */
  minSweepMicro: bigint;
}

/** Nothing charged, and a cap generous enough not to be the thing that decides. */
export const NO_FEES: FeeConfig = {
  sendFeeBps: 0,
  sendFeeMinMicro: ZERO,
  sendFeeMaxMicro: null,
  sweepFeeMicro: ZERO,
  maxSweepMicro: BigInt(10_000) * BigInt(1_000_000),
  minSweepMicro: ZERO,
};

/** A chain's balance, with Circle's current price for moving it to Arc (null if it could not be fetched). */
export interface ChainHolding {
  chainId: string;
  blockchain: string;
  displayName: string;
  balanceMicro: bigint;
  route: RouteFees | null;
  finality: 1000 | 2000;
}

export interface SweepLeg {
  chainId: string;
  blockchain: string;
  displayName: string;
  /** Burned on the source chain, and so pulled from the user's wallet there. */
  amountMicro: bigint;
  /** The ceiling Circle may keep. Passed to the sweep as max_fee_micro. */
  maxFeeMicro: bigint;
  /** What arrives on Arc if Circle keeps all of the ceiling. */
  minNetMicro: bigint;
  finality: 1000 | 2000;
}

export interface QuoteInput {
  sendMicro: bigint;
  arcMicro: bigint;
  holdings: ChainHolding[];
  config: FeeConfig;
}

export type InsufficientReason =
  // Arc plus everything elsewhere does not cover send + fees, whatever it costs to move.
  | "balance"
  // There is enough in total, but a chain that would have supplied it could not be priced.
  | "route_unavailable"
  // There is enough in total, but moving it is blocked by the per-sweep cap, the
  // size of the fee relative to the amount, or the number of chains involved.
  | "cannot_sweep";

export type Quote =
  | {
      kind: "direct";
      sendMicro: bigint;
      sendFeeMicro: bigint;
      /** send + send fee: what leaves the user's Arc balance. */
      totalMicro: bigint;
    }
  | {
      kind: "sweep";
      sendMicro: bigint;
      sendFeeMicro: bigint;
      sweepFeeMicro: bigint;
      legs: SweepLeg[];
      /** Sum of the legs' ceilings. The most Circle can keep. */
      circleFeeMaxMicro: bigint;
      /** send + both tella fees + the Circle ceiling: the most this costs the user in all. */
      totalMaxMicro: bigint;
    }
  | {
      kind: "insufficient";
      reason: InsufficientReason;
      /** What the send needs on Arc, fees included. */
      neededMicro: bigint;
      /** Arc plus every chain balance, before any fee for moving it. */
      unifiedMicro: bigint;
    };

/** clamp(ceil(amount * bps / 10_000), min, max). */
export function sendFeeMicro(amount: bigint, cfg: FeeConfig): bigint {
  if (!Number.isInteger(cfg.sendFeeBps) || cfg.sendFeeBps < 0) {
    throw new Error("sendFeeBps must be a non-negative integer");
  }
  const bps = BigInt(cfg.sendFeeBps);
  let fee = (amount * bps + BPS_DENOM - ONE) / BPS_DENOM;
  if (cfg.sendFeeBps === 0) fee = ZERO;
  if (fee < cfg.sendFeeMinMicro) fee = cfg.sendFeeMinMicro;
  if (cfg.sendFeeMaxMicro !== null && fee > cfg.sendFeeMaxMicro) fee = cfg.sendFeeMaxMicro;
  return fee;
}

/** What arrives on Arc from burning `amount`, if Circle keeps its whole ceiling. */
function minNet(amount: bigint, fees: RouteFees): bigint {
  return amount - feeCeil(amount, fees.milliBps) - fees.forwardHigh;
}

/**
 * The smallest burn that still delivers `net` after Circle's ceiling, or null
 * if the route's price is nonsense (a fee of 100% or more).
 */
export function grossFor(net: bigint, fees: RouteFees): bigint | null {
  if (fees.milliBps >= MILLI_BPS_DENOM) return null;
  const keep = MILLI_BPS_DENOM - fees.milliBps;
  // Closed form for the percentage part, then walked to the exact answer: the
  // ceiling inside feeCeil makes the closed form off by a micro-unit at most.
  let x = ((net + fees.forwardHigh) * MILLI_BPS_DENOM + keep - ONE) / keep;
  while (minNet(x, fees) < net) x += ONE;
  while (x > ZERO && minNet(x - ONE, fees) >= net) x -= ONE;
  return x;
}

/**
 * The smallest burn Circle's fee leaves worth making: the one computeMaxFee
 * accepts. Below it the fee is a large share of what moves, so a user who is a
 * few micro-USDC short would be refused a send that moving a little MORE would
 * have made possible. The surplus is not lost; it lands on Arc.
 */
export function minViableSweep(fees: RouteFees): bigint | null {
  if (fees.milliBps >= MILLI_BPS_DENOM) return null;
  // The share rule is fee <= 10% of the amount. Start from the forward fee
  // alone, which dominates, and walk to the first amount computeMaxFee takes.
  let a = fees.forwardHigh * BigInt(10);
  for (let i = 0; i < 1_000_000 && !computeMaxFee(a, fees).ok; i++) a += ONE;
  return computeMaxFee(a, fees).ok ? a : null;
}

export function quoteSend(input: QuoteInput): Quote {
  const { sendMicro, arcMicro, holdings, config } = input;
  const sendFee = sendFeeMicro(sendMicro, config);
  const need = sendMicro + sendFee;

  if (arcMicro >= need) {
    return { kind: "direct", sendMicro, sendFeeMicro: sendFee, totalMicro: need };
  }

  // A sweep is needed, so its flat fee is too, and it is paid from Arc as well.
  const neededMicro = need + config.sweepFeeMicro;
  const unifiedMicro = holdings.reduce((sum, h) => sum + h.balanceMicro, arcMicro);
  if (unifiedMicro < neededMicro) {
    return { kind: "insufficient", reason: "balance", neededMicro, unifiedMicro };
  }
  // Arc alone covers it once the sweep fee is added back: nothing to sweep.
  // (Cannot happen while arcMicro < need, but a sweep fee makes need grow, so
  // the direction of that inequality is stated rather than assumed.)

  let remaining = neededMicro - arcMicro;
  const legs: SweepLeg[] = [];
  let unpriced = false;

  // Largest balance first: fewest legs, so fewest fixed forwarding fees.
  const candidates = holdings
    .filter((h) => h.balanceMicro > ZERO)
    .sort((a, b) => (a.balanceMicro < b.balanceMicro ? 1 : a.balanceMicro > b.balanceMicro ? -1 : 0));

  for (const h of candidates) {
    if (legs.length >= MAX_SWEEP_LEGS || remaining <= ZERO) break;
    if (!h.route) {
      unpriced = true;
      continue;
    }

    const cap = h.balanceMicro < config.maxSweepMicro ? h.balanceMicro : config.maxSweepMicro;
    const exact = grossFor(remaining, h.route);
    const floor = minViableSweep(h.route);
    if (exact === null || floor === null) continue;
    const least = floor > config.minSweepMicro ? floor : config.minSweepMicro;
    // Never less than is worth moving, never more than may be moved.
    const want = exact > least ? exact : least;
    if (cap < least) continue;
    const amount = want <= cap ? want : cap;

    const fee = computeMaxFee(amount, h.route);
    if (!fee.ok) continue; // too small to be worth its fee; another chain may do better

    legs.push({
      chainId: h.chainId,
      blockchain: h.blockchain,
      displayName: h.displayName,
      amountMicro: amount,
      maxFeeMicro: fee.maxFee,
      minNetMicro: fee.net,
      finality: h.finality,
    });
    remaining -= fee.net;
  }

  if (remaining > ZERO) {
    return {
      kind: "insufficient",
      reason: unpriced && legs.length === 0 ? "route_unavailable" : "cannot_sweep",
      neededMicro,
      unifiedMicro,
    };
  }

  const circleFeeMaxMicro = legs.reduce((s, l) => s + l.maxFeeMicro, ZERO);
  return {
    kind: "sweep",
    sendMicro,
    sendFeeMicro: sendFee,
    sweepFeeMicro: config.sweepFeeMicro,
    legs,
    circleFeeMaxMicro,
    totalMaxMicro: sendMicro + sendFee + config.sweepFeeMicro + circleFeeMaxMicro,
  };
}
