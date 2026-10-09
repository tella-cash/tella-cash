/**
 * Derivation tests. Runner-free — run with `pnpm test`. Exits non-zero on any
 * failure.
 *
 * These pin the rule the dashboard is built on: no percentage without enough
 * behind it. Each case below is a way a true number could still mislead.
 */

import {
  buildFunnel,
  concentration,
  delta,
  invariantFailures,
  priorCoverage,
  shapeRetention,
  share,
  sizeBucketLabel,
  stickiness,
  timeToFirstTransfer,
  transferSize,
} from "./derive";
import { fmtDuration, fmtPct, fmtSignedInt, fmtUsd, bucketName, bucketTick } from "./format";
import type { Engagement, Funnel, Summary } from "./queries";

const PREV = { from: "2026-09-25T12:00:00.000Z", to: "2026-10-02T12:00:00.000Z" };
const NOW = new Date("2026-10-09T12:00:00.000Z");

const funnel = (over: Partial<Funnel> = {}): Funnel => ({
  signedUp: 200,
  onboarded: 150,
  walletActive: 140,
  received: 90,
  sent: 60,
  sentRepeat: 30,
  anySent: 64,
  sentWithoutReceiving: 4,
  medianSecondsToFirstTx: 5400,
  firstTxN: 92,
  ...over,
});

const engagement = (over: Partial<Engagement> = {}): Engagement => ({
  asOfDay: "2026-10-08",
  dauYesterday: 9,
  dauToday: 2,
  wau: 30,
  mau: 80,
  avgDau30d: 8,
  daysWithActivity: 28,
  ledgerFirstAt: "2026-06-01T00:00:00.000Z",
  ...over,
});

const summary = (): Summary => ({
  users: { total: 6, new: 6, onboarded: 5, withWallet: 5 },
  actives: { total: 5, senders: 4, receiveOnly: 1, new: 5, returning: 0 },
  volume: {
    deposits: 172.5,
    p2p: 51,
    withdrawals: 25,
    total: 248.5,
    netFlow: 147.5,
    rawSent: 81,
    rawReceived: 241.5,
  },
  transfers: { total: 8, deposits: 4, p2p: 3, withdrawals: 1, avg: 31.06, median: 22.5 },
  meta: { usersFirstAt: null, ledgerFirstAt: null, excludedUsers: 1 },
});

type Check = [string, () => boolean];

const CHECKS: Check[] = [
  // --- is there anything to compare with ---
  ["no previous window is no coverage", () => priorCoverage(null, "2026-01-01T00:00:00Z") === "none"],
  ["no data at all is no coverage", () => priorCoverage(PREV, null) === "none"],
  [
    "a product that started after the window has no coverage",
    () => priorCoverage(PREV, "2026-10-03T00:00:00Z") === "none",
  ],
  [
    "a product that started exactly at its end has no coverage",
    () => priorCoverage(PREV, PREV.to) === "none",
  ],
  [
    "a product that started inside the window covers part of it",
    () => priorCoverage(PREV, "2026-09-28T00:00:00Z") === "partial",
  ],
  [
    "a product older than the window covers all of it",
    () => priorCoverage(PREV, "2026-01-01T00:00:00Z") === "full",
  ],
  ["an unreadable first date is no coverage", () => priorCoverage(PREV, "soon") === "none"],

  // --- change since the previous period ---
  ["all time has no delta", () => delta(100, null, { coverage: "none" }).kind === "none"],
  [
    "before the product existed is not 'up from zero'",
    () => delta(40, 0, { coverage: "none" }).kind === "none",
  ],
  [
    "from zero is a count, never a percentage",
    () => {
      const d = delta(12, 0, { coverage: "full" });
      return d.kind === "absolute" && d.diff === 12 && d.caveat === "prior-zero";
    },
  ],
  [
    "a small base is a count, never a percentage",
    () => {
      const d = delta(9, 3, { coverage: "full" });
      return d.kind === "absolute" && d.diff === 6 && d.caveat === "small-base";
    },
  ],
  [
    "a base of exactly the minimum earns a percentage",
    () => delta(10, 5, { coverage: "full" }).kind === "percent",
  ],
  [
    "a large sum from two transfers is still a small base",
    () => {
      const d = delta(9000, 4000, { coverage: "full", base: 2 });
      return d.kind === "absolute" && d.caveat === "small-base";
    },
  ],
  [
    "a short comparison window is a count, and says why",
    () => {
      const d = delta(50, 20, { coverage: "partial" });
      return d.kind === "absolute" && d.caveat === "prior-incomplete";
    },
  ],
  [
    "a real change is a percentage of the previous figure",
    () => {
      const d = delta(150, 120, { coverage: "full" });
      return d.kind === "percent" && d.diff === 30 && d.pct === 0.25;
    },
  ],
  [
    "a fall is negative",
    () => {
      const d = delta(60, 120, { coverage: "full" });
      return d.kind === "percent" && d.pct === -0.5;
    },
  ],

  // --- rates ---
  ["nothing over nothing is empty, not 0%", () => share(0, 0).kind === "empty"],
  [
    "under ten is 'k of n'",
    () => {
      const s = share(3, 7);
      return s.kind === "of" && s.k === 3 && s.n === 7;
    },
  ],
  [
    "ten or more is a percentage",
    () => {
      const s = share(4, 10);
      return s.kind === "percent" && s.pct === 0.4;
    },
  ],

  // --- funnel ---
  [
    "the funnel never grows from one stage to the next",
    () => {
      const stages = buildFunnel(funnel());
      return stages.every((s, i) => i === 0 || s.count <= stages[i - 1].count);
    },
  ],
  ["the first stage has nothing above it", () => buildFunnel(funnel())[0].ofPrevious === null],
  [
    "each stage is a share of the one above, not of the top",
    () => {
      const s = buildFunnel(funnel())[4].ofPrevious;
      return s !== null && s.kind === "percent" && s.n === 90 && s.k === 60;
    },
  ],
  ["bar length is a share of the top", () => buildFunnel(funnel())[1].ofTop === 0.75],
  [
    "an empty funnel has zero-length bars rather than NaN",
    () =>
      buildFunnel(
        funnel({ signedUp: 0, onboarded: 0, walletActive: 0, received: 0, sent: 0, sentRepeat: 0 }),
      ).every((s) => s.ofTop === 0),
  ],
  [
    "a small funnel reads as counts",
    () => buildFunnel(funnel({ signedUp: 6, onboarded: 5 }))[1].ofPrevious?.kind === "of",
  ],

  // --- time to first transfer ---
  ["shown with enough people behind it", () => timeToFirstTransfer(funnel())?.seconds === 5400],
  ["hidden under a handful", () => timeToFirstTransfer(funnel({ firstTxN: 4 })) === null],
  [
    "hidden when nobody has transacted",
    () => timeToFirstTransfer(funnel({ medianSecondsToFirstTx: null, firstTxN: 0 })) === null,
  ],

  // --- retention ---
  [
    "cohorts come out oldest first with their months in order",
    () => {
      const cohorts = shapeRetention([
        { cohortMonth: "2026-08-01", cohortSize: 20, monthOffset: 1, active: 9, isPartial: false },
        { cohortMonth: "2026-07-01", cohortSize: 12, monthOffset: 0, active: 12, isPartial: false },
        { cohortMonth: "2026-08-01", cohortSize: 20, monthOffset: 0, active: 20, isPartial: false },
      ]);
      return (
        cohorts.length === 2 &&
        cohorts[0].month === "2026-07-01" &&
        cohorts[1].cells.map((c) => c.offset).join() === "0,1"
      );
    },
  ],
  [
    "a small cohort is counts, a larger one is a percentage",
    () => {
      const cohorts = shapeRetention([
        { cohortMonth: "2026-07-01", cohortSize: 4, monthOffset: 1, active: 2, isPartial: false },
        { cohortMonth: "2026-08-01", cohortSize: 20, monthOffset: 1, active: 9, isPartial: true },
      ]);
      return (
        cohorts[0].cells[0].share.kind === "of" &&
        cohorts[1].cells[0].share.kind === "percent" &&
        cohorts[1].cells[0].isPartial
      );
    },
  ],

  // --- stickiness ---
  ["a ratio once there is a month of history", () => stickiness(engagement(), NOW) === 0.1],
  ["no ratio with few monthly users", () => stickiness(engagement({ mau: 9 }), NOW) === null],
  [
    "no ratio in the first month",
    () => stickiness(engagement({ ledgerFirstAt: "2026-09-20T00:00:00.000Z" }), NOW) === null,
  ],
  ["no ratio with no history", () => stickiness(engagement({ ledgerFirstAt: null }), NOW) === null],

  // --- concentration ---
  [
    "no wallets, no statement",
    () => concentration({ n: 0, k: 0, total: 0, topK: 0, top1: 0 }).kind === "none",
  ],
  [
    "two wallets, no statement",
    () => concentration({ n: 2, k: 1, total: 100, topK: 90, top1: 90 }).kind === "none",
  ],
  [
    "under ten wallets it is the largest wallet's share",
    () => {
      const c = concentration({ n: 9, k: 1, total: 200, topK: 80, top1: 80 });
      return c.kind === "largest" && c.pct === 0.4 && c.wallets === 9;
    },
  ],
  [
    "from ten wallets it is the top tenth",
    () => {
      const c = concentration({ n: 10, k: 1, total: 200, topK: 80, top1: 80 });
      return c.kind === "top" && c.top === 1;
    },
  ],
  [
    "eleven wallets round the tenth up to two",
    () => {
      const c = concentration({ n: 11, k: 2, total: 200, topK: 120, top1: 80 });
      return c.kind === "top" && c.top === 2 && c.pct === 0.6;
    },
  ],

  // --- transfer size ---
  ["median and average with enough transfers", () => transferSize(summary().transfers)?.median === 22.5],
  [
    "neither with a handful",
    () => transferSize({ ...summary().transfers, total: 4 }) === null,
  ],
  ["the smallest bucket has no lower bound", () => sizeBucketLabel(0, [1, 5, 10]) === "Under $1"],
  ["a middle bucket names both ends", () => sizeBucketLabel(1, [1, 5, 10]) === "$1 to $5"],
  ["the largest bucket has no upper bound", () => sizeBucketLabel(3, [1, 5, 10]) === "$10 and over"],

  // --- consistency ---
  ["a consistent summary has no failures", () => invariantFailures(summary()).length === 0],
  [
    "a volume that does not add up is caught",
    () => {
      const s = summary();
      s.volume.total = 300;
      return invariantFailures(s).length === 1;
    },
  ],
  [
    "active wallets that do not split cleanly are caught",
    () => {
      const s = summary();
      s.actives.senders = 5;
      return invariantFailures(s).some((f) => f.includes("senders"));
    },
  ],

  // --- formatting ---
  ["money keeps its cents", () => fmtUsd(1234.5) === "$1,234.50"],
  ["negative money uses a real minus", () => fmtUsd(-3) === "−$3.00"],
  ["a small percentage keeps a decimal", () => fmtPct(0.042) === "4.2%"],
  ["a large percentage does not", () => fmtPct(0.384) === "38%"],
  ["a signed count shows its plus", () => fmtSignedInt(38) === "+38"],
  ["zero has no sign", () => fmtSignedInt(0) === "0"],
  ["seconds", () => fmtDuration(42) === "42 seconds"],
  ["minutes", () => fmtDuration(1800) === "30 minutes"],
  ["ninety minutes reads as hours", () => fmtDuration(5400) === "1.5 hours"],
  ["hours", () => fmtDuration(6 * 3600) === "6 hours"],
  ["days", () => fmtDuration(60 * 3600) === "2.5 days"],
  ["one of something is singular", () => fmtDuration(86400 * 100) === "100 days" && fmtDuration(1) === "1 second"],
  ["a bucket date never shifts a day", () => bucketTick("2026-10-01", "day") === "01 Oct"],
  ["a month bucket is named by its month", () => bucketName("2026-10-01", "month") === "October 2026"],
  ["a week bucket says it is a week", () => bucketName("2026-10-05", "week").startsWith("Week of 5 Oct")],
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

console.log(`analytics derive: ${passed}/${CHECKS.length} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
