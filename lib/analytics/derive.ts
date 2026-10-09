import type { TimeWindow } from "./period";
import type { Distribution, Engagement, Funnel, RetentionRow, Summary } from "./queries";

/**
 * Turning counts into the things a reader sees: a change since last period, a
 * rate, a funnel step.
 *
 * THE RULE THIS FILE EXISTS FOR: a percentage is only shown when there is
 * enough behind it to mean something. "+200%" off a base of one transfer is
 * true and useless, and on a dashboard meant to be shown to someone outside
 * the company it is worse than useless. Below the thresholds here a figure
 * falls back to plain counts ("+2", "3 of 7"), which cannot mislead.
 *
 * The database returns counts and sums only (migrations/0033), so every
 * ratio on the page is made here, where it is pure and tested.
 */

/** Below this many in the comparison period, show "+N" and no percentage. */
export const MIN_DELTA_BASE = 5;
/** Below this denominator, show "k of n" and no percentage. */
export const MIN_RATE_DENOMINATOR = 10;
/** Below this many, a median or a cohort is described by its count alone. */
export const MIN_SAMPLE = 5;

const DAY = 24 * 60 * 60 * 1000;

/* ---------- change since the previous period ---------- */

/**
 * How much of the comparison window has data behind it.
 *
 * "none" when there is no window, or the product did not exist yet: a zero
 * there is "before we started", not "we had none". "partial" when the first
 * row lands inside the window, so it is shorter than the one it is compared
 * with.
 */
export type Coverage = "none" | "partial" | "full";

export function priorCoverage(previous: TimeWindow | null, firstAt: string | null): Coverage {
  if (!previous || !previous.from || !firstAt) return "none";
  const first = Date.parse(firstAt);
  if (!Number.isFinite(first)) return "none";
  if (first >= Date.parse(previous.to)) return "none";
  if (first > Date.parse(previous.from)) return "partial";
  return "full";
}

export type Delta =
  | { kind: "none" }
  | {
      kind: "absolute";
      diff: number;
      /** Why there is no percentage. Null only when the difference is the whole story. */
      caveat: "prior-zero" | "small-base" | "prior-incomplete";
    }
  | { kind: "percent"; diff: number; pct: number };

/**
 * `base` is how many things the previous figure is made of, when that is not
 * the figure itself: for a volume, the number of transfers behind it. A large
 * sum from two transfers is still a base of two.
 */
export function delta(
  current: number,
  previous: number | null | undefined,
  opts: { coverage: Coverage; base?: number | null },
): Delta {
  if (previous === null || previous === undefined || opts.coverage === "none") {
    return { kind: "none" };
  }
  const diff = current - previous;
  if (opts.coverage === "partial") return { kind: "absolute", diff, caveat: "prior-incomplete" };
  if (previous === 0) return { kind: "absolute", diff, caveat: "prior-zero" };
  if ((opts.base ?? previous) < MIN_DELTA_BASE) {
    return { kind: "absolute", diff, caveat: "small-base" };
  }
  return { kind: "percent", diff, pct: diff / previous };
}

/* ---------- rates ---------- */

export type Share =
  | { kind: "empty" }
  | { kind: "of"; k: number; n: number }
  | { kind: "percent"; k: number; n: number; pct: number };

export function share(k: number, n: number, min: number = MIN_RATE_DENOMINATOR): Share {
  if (n <= 0) return { kind: "empty" };
  if (n < min) return { kind: "of", k, n };
  return { kind: "percent", k, n, pct: k / n };
}

/* ---------- activation ---------- */

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  /** Share of the stage above. Null for the first. Drop-off is the useful read. */
  ofPrevious: Share | null;
  /** 0..1 of the first stage, for the bar's length. */
  ofTop: number;
}

export function buildFunnel(f: Funnel): FunnelStage[] {
  const stages: [string, string, number][] = [
    ["signed_up", "Started signup", f.signedUp],
    ["onboarded", "Finished signup", f.onboarded],
    ["wallet_active", "Wallet ready", f.walletActive],
    ["received", "Received money", f.received],
    ["sent", "Sent money", f.sent],
    ["sent_repeat", "Sent again", f.sentRepeat],
  ];
  const top = stages[0][2];
  return stages.map(([key, label, count], i) => ({
    key,
    label,
    count,
    ofPrevious: i === 0 ? null : share(count, stages[i - 1][2]),
    ofTop: top > 0 ? count / top : 0,
  }));
}

/**
 * Median time from signup to a first settled transfer, among the people who
 * have one. Hidden under a handful: one fast tester would set the number.
 */
export function timeToFirstTransfer(f: Funnel): { seconds: number; n: number } | null {
  if (f.medianSecondsToFirstTx === null || f.firstTxN < MIN_SAMPLE) return null;
  return { seconds: f.medianSecondsToFirstTx, n: f.firstTxN };
}

/* ---------- retention ---------- */

export interface Cohort {
  month: string;
  size: number;
  /** Indexed by months since the cohort's first transfer; absent months are missing. */
  cells: { offset: number; active: number; share: Share; isPartial: boolean }[];
}

export function shapeRetention(rows: RetentionRow[]): Cohort[] {
  const byMonth = new Map<string, Cohort>();
  for (const r of rows) {
    let cohort = byMonth.get(r.cohortMonth);
    if (!cohort) {
      cohort = { month: r.cohortMonth, size: r.cohortSize, cells: [] };
      byMonth.set(r.cohortMonth, cohort);
    }
    cohort.cells.push({
      offset: r.monthOffset,
      active: r.active,
      share: share(r.active, r.cohortSize, MIN_SAMPLE),
      isPartial: r.isPartial,
    });
  }
  return [...byMonth.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((c) => ({ ...c, cells: c.cells.sort((a, b) => a.offset - b.offset) }));
}

/* ---------- engagement ---------- */

/**
 * Average daily transacting users over monthly transacting users.
 *
 * Null until there is a month of history and enough monthly users for the
 * ratio to be stable: before that the two inputs are shown as numbers.
 */
export function stickiness(e: Engagement, now: Date): number | null {
  if (e.mau < MIN_RATE_DENOMINATOR) return null;
  if (!e.ledgerFirstAt) return null;
  const first = Date.parse(e.ledgerFirstAt);
  if (!Number.isFinite(first) || now.getTime() - first < 30 * DAY) return null;
  return e.avgDau30d / e.mau;
}

/* ---------- concentration ---------- */

export type Concentration =
  | { kind: "none" }
  | { kind: "largest"; pct: number; wallets: number }
  | { kind: "top"; pct: number; top: number; wallets: number };

/**
 * How much of the volume a few wallets account for.
 *
 * "The top 10%" is one wallet until there are ten, so under ten it is said
 * as what it is: the largest wallet's share.
 */
export function concentration(c: Distribution["concentration"]): Concentration {
  if (c.n < 3 || c.total <= 0) return { kind: "none" };
  if (c.n < 10) return { kind: "largest", pct: c.top1 / c.total, wallets: c.n };
  return { kind: "top", pct: c.topK / c.total, top: c.k, wallets: c.n };
}

/* ---------- transfer size ---------- */

/** Median first: one large transfer drags an average a long way. */
export function transferSize(t: Summary["transfers"]): { median: number; avg: number } | null {
  if (t.total < MIN_SAMPLE || t.median === null || t.avg === null) return null;
  return { median: t.median, avg: t.avg };
}

/** "Under $1", "$1 to $5", ..., "$500 and over". */
export function sizeBucketLabel(i: number, edges: number[]): string {
  if (edges.length === 0) return "";
  if (i <= 0) return `Under $${edges[0]}`;
  if (i >= edges.length) return `$${edges[edges.length - 1]} and over`;
  return `$${edges[i - 1]} to $${edges[i]}`;
}

/* ---------- consistency ---------- */

/**
 * Things that must be true of a summary if the database did its sums the way
 * the page describes them. A failure here means a definition drifted, and it
 * is logged rather than shown, because the reader cannot do anything with it.
 */
export function invariantFailures(s: Summary): string[] {
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const out: string[] = [];
  const { volume: v, actives: a, transfers: t } = s;
  if (!close(v.total, v.deposits + v.p2p + v.withdrawals)) {
    out.push("volume total is not deposits + tella-to-tella + withdrawals");
  }
  if (!close(v.netFlow, v.deposits - v.withdrawals)) {
    out.push("net flow is not deposits - withdrawals");
  }
  if (a.total !== a.senders + a.receiveOnly) {
    out.push("active wallets is not senders + receive-only");
  }
  if (a.total !== a.new + a.returning) {
    out.push("active wallets is not new + returning");
  }
  if (t.total !== t.deposits + t.p2p + t.withdrawals) {
    out.push("transfer count is not the sum of its three kinds");
  }
  return out;
}
