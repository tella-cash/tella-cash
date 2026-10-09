/**
 * The dashboard's one filter: which stretch of time the figures cover.
 *
 * Two things hang off a single choice, and they are deliberately different
 * kinds of window:
 *
 *   - The headline figures use a ROLLING window (the last 24 hours, 7 days,
 *     30 days) and compare it with the equal window before. A calendar
 *     "today" is nearly empty every morning and a calendar "this week" is
 *     never comparable with last week until Sunday night.
 *   - The charts use CALENDAR buckets (days, weeks, months in Lagos time),
 *     because a bar has to mean a nameable day or month.
 *
 * Pure, so the arithmetic can be tested without a clock or a database.
 */

export type Period = "all" | "day" | "week" | "month";

export const PERIODS: readonly Period[] = ["all", "day", "week", "month"];

/** Every bucket boundary is computed in this zone. No daylight saving. */
export const ANALYTICS_TZ = "Africa/Lagos";

export type Grain = "day" | "week" | "month";

/** [from, to), ISO strings. `from` is null for "since the beginning". */
export interface TimeWindow {
  from: string | null;
  to: string;
}

export interface ResolvedPeriod {
  key: Period;
  current: TimeWindow;
  /** Null for all time: there is nothing before the beginning. */
  previous: TimeWindow | null;
  /** What to ask the series for. "auto" lets the database pick by age. */
  grain: Grain | "auto";
  buckets: number | null;
  /** "Last 7 days". Shown beside every figure the filter scopes. */
  label: string;
  /** "previous 7 days", for "vs previous 7 days". */
  previousLabel: string | null;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const SPEC: Record<
  Exclude<Period, "all">,
  { ms: number; grain: Grain; buckets: number; label: string; previousLabel: string }
> = {
  day: { ms: DAY, grain: "day", buckets: 30, label: "Last 24 hours", previousLabel: "previous 24 hours" },
  week: { ms: 7 * DAY, grain: "week", buckets: 12, label: "Last 7 days", previousLabel: "previous 7 days" },
  month: { ms: 30 * DAY, grain: "month", buckets: 12, label: "Last 30 days", previousLabel: "previous 30 days" },
};

/**
 * Read `?period=` off the URL. Anything unrecognised is all time, which is
 * the default view, rather than an error: a mistyped link should still show
 * a dashboard.
 */
export function parsePeriod(raw: unknown): Period {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && (PERIODS as readonly string[]).includes(value)
    ? (value as Period)
    : "all";
}

export function resolvePeriod(key: Period, now: Date): ResolvedPeriod {
  const to = now.toISOString();

  if (key === "all") {
    return {
      key,
      current: { from: null, to },
      previous: null,
      grain: "auto",
      buckets: null,
      label: "All time",
      previousLabel: null,
    };
  }

  const spec = SPEC[key];
  const from = new Date(now.getTime() - spec.ms);
  const before = new Date(from.getTime() - spec.ms);

  return {
    key,
    current: { from: from.toISOString(), to },
    // Ends exactly where the current one starts: adjacent, equal, no overlap.
    previous: { from: before.toISOString(), to: from.toISOString() },
    grain: spec.grain,
    buckets: spec.buckets,
    label: spec.label,
    previousLabel: spec.previousLabel,
  };
}

/** The link for a period. All time is the bare path, so it has one URL. */
export function periodHref(key: Period): string {
  return key === "all" ? "/admin" : `/admin?period=${key}`;
}
