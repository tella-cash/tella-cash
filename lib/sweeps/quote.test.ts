/**
 * Send quoting: when a sweep is needed, how big, and what it costs.
 * Runner-free — run with `pnpm test`.
 */

import type { RouteFees } from "./cctp";
import { feeCeil } from "./micro";
import { MAX_SWEEP_LEGS, NO_FEES, grossFor, minViableSweep, quoteSend, sendFeeMicro, type ChainHolding, type FeeConfig } from "./quote";

const U = (n: number) => BigInt(Math.round(n * 1_000_000));

// Mainnet Base -> Arc, from the 2026-09-21 reading: fast 0.325 bps, forward high 19221.
const ROUTE: RouteFees = { milliBps: BigInt(325), forwardLow: BigInt(16975), forwardMed: BigInt(17338), forwardHigh: BigInt(19221) };

function holding(over: Partial<ChainHolding> = {}): ChainHolding {
  return { chainId: "c-base", blockchain: "BASE", displayName: "Base", balanceMicro: U(100), route: ROUTE, finality: 1000, ...over };
}
const cfg = (over: Partial<FeeConfig> = {}): FeeConfig => ({ ...NO_FEES, ...over });
const q = (sendUsdc: number, arcUsdc: number, holdings: ChainHolding[], config: FeeConfig = NO_FEES) =>
  quoteSend({ sendMicro: U(sendUsdc), arcMicro: U(arcUsdc), holdings, config });

type Check = [string, () => boolean];

const CHECKS: Check[] = [
  // fees
  ["no config charges nothing", () => sendFeeMicro(U(100), NO_FEES) === BigInt(0)],
  ["percentage fee rounds up", () => sendFeeMicro(BigInt(1), cfg({ sendFeeBps: 50 })) === BigInt(1)],
  ["0.5% of 100 USDC is 0.5", () => sendFeeMicro(U(100), cfg({ sendFeeBps: 50 })) === U(0.5)],
  ["the floor applies to small sends", () => sendFeeMicro(U(1), cfg({ sendFeeBps: 50, sendFeeMinMicro: U(0.05) })) === U(0.05)],
  ["the ceiling applies to big sends", () => sendFeeMicro(U(10_000), cfg({ sendFeeBps: 50, sendFeeMaxMicro: U(2) })) === U(2)],
  ["a floor with zero bps still charges the floor", () => sendFeeMicro(U(10), cfg({ sendFeeMinMicro: U(0.01) })) === U(0.01)],
  ["a negative or fractional bps is refused", () => {
    try { sendFeeMicro(U(1), cfg({ sendFeeBps: -1 })); return false; } catch { /* expected */ }
    try { sendFeeMicro(U(1), cfg({ sendFeeBps: 0.5 })); return false; } catch { return true; }
  }],

  // grossFor
  ["grossFor delivers at least the net, one less would not", () => {
    for (const net of [U(1), U(24.5), U(0.123457), BigInt(1_000_000_007)]) {
      const x = grossFor(net, ROUTE)!;
      const delivers = (a: bigint) => a - feeCeil(a, ROUTE.milliBps) - ROUTE.forwardHigh;
      if (delivers(x) < net || delivers(x - BigInt(1)) >= net) return false;
    }
    return true;
  }],
  ["a route that charges 100% is refused, not divided by zero", () => grossFor(U(1), { ...ROUTE, milliBps: BigInt(10_000_000) }) === null],

  // direct
  ["Arc covering the send is direct", () => q(10, 50, [holding()]).kind === "direct"],
  ["direct carries the send fee in the total", () => {
    const r = q(10, 50, [], cfg({ sendFeeBps: 100 }));
    return r.kind === "direct" && r.sendFeeMicro === U(0.1) && r.totalMicro === U(10.1);
  }],
  ["Arc exactly equal to send plus fee is still direct", () => q(10, 10.1, [], cfg({ sendFeeBps: 100 })).kind === "direct"],
  ["one micro short of send plus fee needs a sweep", () => {
    const r = quoteSend({ sendMicro: U(10), arcMicro: U(10.1) - BigInt(1), holdings: [holding()], config: cfg({ sendFeeBps: 100 }) });
    return r.kind === "sweep";
  }],
  ["a tiny shortfall moves a viable amount, not the shortfall itself", () => {
    const r = quoteSend({ sendMicro: U(10), arcMicro: U(10) - BigInt(1), holdings: [holding()], config: NO_FEES });
    return r.kind === "sweep" && r.legs[0].amountMicro === minViableSweep(ROUTE)! && r.legs[0].minNetMicro >= BigInt(1);
  }],
  ["the viable floor is the first amount whose fee is within the share limit", () => {
    const f = minViableSweep(ROUTE)!;
    const share = (a: bigint) => (feeCeil(a, ROUTE.milliBps) + ROUTE.forwardHigh) * BigInt(10_000) <= a * BigInt(1000);
    return share(f) && !share(f - BigInt(1));
  }],
  ["a configured minimum raises the floor", () => {
    const r = q(10, 9.999999, [holding()], cfg({ minSweepMicro: U(5) }));
    return r.kind === "sweep" && r.legs[0].amountMicro === U(5);
  }],
  ["a balance under the floor cannot be swept at all", () => {
    const r = q(0.01, 0, [holding({ balanceMicro: U(0.1) })]);
    return r.kind === "insufficient" && r.reason === "cannot_sweep";
  }],

  // single sweep
  ["a shortfall is covered by one leg on Base", () => {
    const r = q(40, 15, [holding({ balanceMicro: U(100) })]);
    return r.kind === "sweep" && r.legs.length === 1 && r.legs[0].blockchain === "BASE";
  }],
  ["the leg delivers at least the shortfall after Circle's ceiling", () => {
    const r = q(40, 15, [holding()]);
    return r.kind === "sweep" && r.legs[0].minNetMicro >= U(25);
  }],
  ["the leg is the smallest burn that does so", () => {
    const r = q(40, 15, [holding()]);
    return r.kind === "sweep" && r.legs[0].minNetMicro - U(25) < BigInt(2);
  }],
  ["the ceiling is exactly Circle's fee for that amount", () => {
    const r = q(40, 15, [holding()]);
    return r.kind === "sweep" && r.legs[0].maxFeeMicro === feeCeil(r.legs[0].amountMicro, ROUTE.milliBps) + ROUTE.forwardHigh;
  }],
  ["both tella fees ride on Arc and raise the shortfall", () => {
    const plain = q(40, 15, [holding()]);
    const fee = q(40, 15, [holding()], cfg({ sendFeeBps: 100, sweepFeeMicro: U(0.2) }));
    return plain.kind === "sweep" && fee.kind === "sweep" && fee.legs[0].minNetMicro >= U(25.6) && fee.legs[0].amountMicro > plain.legs[0].amountMicro;
  }],
  ["the total is send + send fee + sweep fee + Circle's ceiling", () => {
    const r = q(40, 15, [holding()], cfg({ sendFeeBps: 100, sweepFeeMicro: U(0.2) }));
    return r.kind === "sweep" && r.totalMaxMicro === U(40) + U(0.4) + U(0.2) + r.circleFeeMaxMicro;
  }],
  ["the sweep fee is not charged when no sweep is needed", () => {
    const r = q(10, 50, [holding()], cfg({ sweepFeeMicro: U(1) }));
    return r.kind === "direct" && r.totalMicro === U(10);
  }],

  // balance
  ["not enough anywhere is insufficient: balance", () => {
    const r = q(500, 10, [holding({ balanceMicro: U(20) })]);
    return r.kind === "insufficient" && r.reason === "balance" && r.unifiedMicro === U(30) && r.neededMicro === U(500);
  }],
  ["the sweep fee can tip an exact balance into insufficient", () => {
    const r = q(40, 15, [holding({ balanceMicro: U(25) })], cfg({ sweepFeeMicro: U(0.1) }));
    return r.kind === "insufficient" && r.reason === "balance";
  }],
  ["enough in total but Circle's fee eats the margin is cannot_sweep", () => {
    const r = q(40, 15, [holding({ balanceMicro: U(25) })]);
    return r.kind === "insufficient" && r.reason === "cannot_sweep";
  }],

  // multiple chains and caps
  ["the largest balance is used first", () => {
    const r = q(40, 0, [holding({ chainId: "a", blockchain: "OP", balanceMicro: U(50) }), holding({ chainId: "b", blockchain: "BASE", balanceMicro: U(500) })]);
    return r.kind === "sweep" && r.legs.length === 1 && r.legs[0].blockchain === "BASE";
  }],
  ["two chains are combined when neither covers it alone", () => {
    const r = q(80, 0, [holding({ chainId: "a", blockchain: "OP", balanceMicro: U(50) }), holding({ chainId: "b", blockchain: "BASE", balanceMicro: U(50) })]);
    return r.kind === "sweep" && r.legs.length === 2 && r.legs.reduce((s, l) => s + l.minNetMicro, BigInt(0)) >= U(80);
  }],
  ["the per-sweep cap splits a large move across chains", () => {
    const r = q(80, 0, [holding({ chainId: "a", blockchain: "OP", balanceMicro: U(500) }), holding({ chainId: "b", blockchain: "BASE", balanceMicro: U(500) })], cfg({ maxSweepMicro: U(50) }));
    return r.kind === "sweep" && r.legs.length === 2 && r.legs.every((l) => l.amountMicro <= U(50));
  }],
  ["a cap too low to cover it is cannot_sweep", () => {
    const r = q(80, 0, [holding({ balanceMicro: U(500) })], cfg({ maxSweepMicro: U(50) }));
    return r.kind === "insufficient" && r.reason === "cannot_sweep";
  }],
  ["no more legs than the limit", () => {
    const many = Array.from({ length: 6 }, (_, i) => holding({ chainId: `c${i}`, blockchain: `C${i}`, balanceMicro: U(10) }));
    const r = q(55, 0, many);
    return r.kind === "insufficient" && r.reason === "cannot_sweep" && MAX_SWEEP_LEGS === 3;
  }],

  // pricing availability
  ["an unpriced chain is never swept", () => q(40, 0, [holding({ route: null })]).kind === "insufficient"],
  ["an unpriced chain with enough in total reports route_unavailable", () => {
    const r = q(40, 0, [holding({ route: null, balanceMicro: U(100) })]);
    return r.kind === "insufficient" && r.reason === "route_unavailable";
  }],
  ["a priced chain is used when another is unpriced", () => {
    const r = q(40, 0, [holding({ chainId: "x", route: null, balanceMicro: U(900) }), holding({ chainId: "b", balanceMicro: U(100) })]);
    return r.kind === "sweep" && r.legs[0].chainId === "b";
  }],
  ["a zero-balance chain is ignored", () => q(10, 0, [holding({ balanceMicro: BigInt(0) })]).kind === "insufficient"],
  ["finality is carried onto the leg", () => {
    const r = q(40, 0, [holding({ finality: 2000 })]);
    return r.kind === "sweep" && r.legs[0].finality === 2000;
  }],
];

let failed = 0;
for (const [name, fn] of CHECKS) {
  let ok = false;
  try {
    ok = fn();
  } catch (err) {
    console.error("  threw:", err);
  }
  if (!ok) {
    failed++;
    console.error(`FAIL  ${name}`);
  }
}
if (failed) {
  console.error(`${failed} of ${CHECKS.length} quote checks failed`);
  process.exit(1);
}
console.log(`quote: ${CHECKS.length} checks passed`);
