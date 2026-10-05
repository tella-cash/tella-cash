/**
 * tierFor tests. Runner-free — run with `pnpm test`. Exits non-zero on any
 * failure.
 *
 * The boundary is the whole content of this module, and it decides whether a
 * transfer leaves immediately or waits a day, so it is worth pinning exactly.
 */

import {
  tierFor,
  holdThreshold,
  inFactorChangeWindow,
  HOLD_HOURS,
  FACTOR_CHANGE_HOLD_HOURS,
} from "./tiers";

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-09-17T12:00:00Z");
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

  // Pinned exactly, so a change to the hold is a deliberate edit here too.
  // Was 24; reduced to 6 hours at the owner's request.
  ["the hold, when one applies, is 6 hours", () => HOLD_HOURS === 6],

  // The post-change window. A PIN reset needs only the chat, so without this
  // a reset followed by a send moves the whole balance at once.
  [
    "a small send right after a PIN reset is held",
    () => tierFor(1, limits(), new Date(NOW - HOUR).toISOString(), NOW) === "hold",
  ],
  [
    "the window holds sends even with the size threshold switched off",
    () => holdThreshold(limits()) === Infinity && tierFor(5, limits(), new Date(NOW).toISOString(), NOW) === "hold",
  ],
  [
    "just inside the window is still held",
    () =>
      tierFor(5, limits(), new Date(NOW - (FACTOR_CHANGE_HOLD_HOURS * HOUR - 1000)).toISOString(), NOW) ===
      "hold",
  ],
  [
    "once the window has passed, sends go out normally",
    () => tierFor(5, limits(), new Date(NOW - FACTOR_CHANGE_HOLD_HOURS * HOUR).toISOString(), NOW) === "normal",
  ],
  ["no recorded change means no window", () => tierFor(5, limits(), null, NOW) === "normal"],
  ["a garbage timestamp does not open a window", () => !inFactorChangeWindow("not a date", NOW)],
  // Was "the window outlasts the hold it imposes". Dropped on purpose when the
  // window went from 48 to 6 hours and the hold from 24 to 6: a send inside the
  // window is held HOLD_HOURS, one after it is not held at all.
  ["the window and the hold are both positive", () => FACTOR_CHANGE_HOLD_HOURS > 0 && HOLD_HOURS > 0],
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
