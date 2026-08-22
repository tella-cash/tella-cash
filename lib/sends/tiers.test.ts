/**
 * tierFor tests. Runner-free — run with `pnpm test`. Exits non-zero on any
 * failure.
 *
 * The boundary is the whole content of this module, and it decides whether a
 * transfer leaves immediately or waits a day, so it is worth pinning exactly.
 */

import { tierFor, holdThreshold, HOLD_HOURS } from "./tiers";
import type { ResolvedLimits } from "./limits";

function limits(over: Partial<ResolvedLimits> = {}): ResolvedLimits {
  return { perTx: 100, daily: 500, holdThreshold: null, customised: false, ...over };
}

type Check = [string, () => boolean];

const CHECKS: Check[] = [
  // --- off by default, which is the whole point of this change ---
  ["with nothing configured, the threshold is infinite", () => holdThreshold(limits()) === Infinity],
  ["a small send is not held", () => tierFor(5, limits()) === "normal"],
  ["a large send is not held either", () => tierFor(100_000, limits()) === "normal"],
  [
    "a per-tx cap no longer drags holds back in as a side effect",
    () => tierFor(90, limits({ perTx: 100 })) === "normal",
  ],

  // --- a user who opts in still gets one ---
  [
    "an explicit per-user threshold is honoured",
    () => holdThreshold(limits({ holdThreshold: 5 })) === 5,
  ],
  [
    "above a user's own threshold is held",
    () => tierFor(10, limits({ holdThreshold: 5 })) === "hold",
  ],
  [
    "at exactly their threshold, nothing is held",
    () => tierFor(5, limits({ holdThreshold: 5 })) === "normal",
  ],
  [
    "below their threshold, nothing is held",
    () => tierFor(1, limits({ holdThreshold: 5 })) === "normal",
  ],

  // --- degenerate inputs are not sends; checkSendLimits rejected them already ---
  ["zero is not held", () => tierFor(0, limits({ holdThreshold: 5 })) === "normal"],
  ["negative is not held", () => tierFor(-5, limits({ holdThreshold: 5 })) === "normal"],
  ["NaN is not held", () => tierFor(NaN, limits({ holdThreshold: 5 })) === "normal"],

  ["the hold, when one applies, is still a full day", () => HOLD_HOURS === 24],
];

let passed = 0;
const failures: string[] = [];

for (const [name, check] of CHECKS) {
  let ok = false;
  try {
    ok = check();
  } catch (err) {
    failures.push(`  ✗ ${name} threw: ${(err as Error).message}`);
    continue;
  }
  if (ok) passed++;
  else failures.push(`  ✗ ${name}`);
}

console.log(`tiers: ${passed}/${CHECKS.length} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
