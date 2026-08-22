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
  // --- derived threshold: half the per-transaction cap ---
  ["the derived threshold is half the per-tx cap", () => holdThreshold(limits()) === 50],
  ["below the derived threshold goes straight out", () => tierFor(10, limits()) === "normal"],
  ["exactly at the threshold goes straight out", () => tierFor(50, limits()) === "normal"],
  ["above the threshold is held", () => tierFor(50.01, limits()) === "hold"],
  ["well above the threshold is held", () => tierFor(99, limits()) === "hold"],

  // The threshold follows the cap down, which is the point of deriving it
  // rather than hardcoding a number: tightening the deployment cap during an
  // incident tightens this too, instead of leaving a threshold above the new
  // cap where it could never fire.
  [
    "a tightened per-tx cap tightens the derived threshold with it",
    () => holdThreshold(limits({ perTx: 20 })) === 10 && tierFor(15, limits({ perTx: 20 })) === "hold",
  ],

  // --- explicit user threshold wins ---
  [
    "an explicit threshold is used instead of the derived one",
    () => holdThreshold(limits({ holdThreshold: 5 })) === 5,
  ],
  [
    "a user who set a low threshold gets more held, not less",
    () =>
      tierFor(10, limits({ holdThreshold: 5 })) === "hold" &&
      tierFor(10, limits()) === "normal",
  ],
  [
    "at exactly the user's own threshold, nothing is held",
    () => tierFor(5, limits({ holdThreshold: 5 })) === "normal",
  ],

  // --- degenerate inputs must not silently become "hold everything" or
  //     "hold nothing"; they are not sends at all and checkSendLimits has
  //     already rejected them by the time this runs.
  ["zero is not held", () => tierFor(0, limits()) === "normal"],
  ["negative is not held", () => tierFor(-5, limits()) === "normal"],
  ["NaN is not held", () => tierFor(NaN, limits()) === "normal"],

  ["the hold is a full day", () => HOLD_HOURS === 24],
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
