/**
 * Period tests. Runner-free — run with `pnpm test`. Exits non-zero on any
 * failure.
 *
 * The windows decide which transfers a headline figure counts and what it is
 * compared with, so an off-by-one here is a wrong number on a page that gets
 * shown to people outside the company.
 */

import { parsePeriod, periodHref, resolvePeriod } from "./period";

const NOW = new Date("2026-10-09T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const ms = (iso: string | null) => Date.parse(iso ?? "");

type Check = [string, () => boolean];

const week = resolvePeriod("week", NOW);
const day = resolvePeriod("day", NOW);
const month = resolvePeriod("month", NOW);
const all = resolvePeriod("all", NOW);

const CHECKS: Check[] = [
  // --- reading the URL ---
  ["no parameter is all time", () => parsePeriod(undefined) === "all"],
  ["a known value is honoured", () => parsePeriod("week") === "week"],
  ["an unknown value falls back to all time", () => parsePeriod("year") === "all"],
  ["a repeated parameter uses the first", () => parsePeriod(["month", "day"]) === "month"],
  ["a non-string is all time", () => parsePeriod(7) === "all"],
  ["an inherited property name is not a period", () => parsePeriod("toString") === "all"],

  // --- all time ---
  ["all time starts at the beginning", () => all.current.from === null],
  ["all time ends now", () => all.current.to === NOW.toISOString()],
  ["all time has nothing to compare with", () => all.previous === null],
  ["all time lets the database pick the bucket", () => all.grain === "auto" && all.buckets === null],

  // --- rolling windows ---
  ["a day is 24 hours", () => ms(day.current.to) - ms(day.current.from) === 24 * HOUR],
  ["a week is 7 days", () => ms(week.current.to) - ms(week.current.from) === 7 * 24 * HOUR],
  ["a month is 30 days", () => ms(month.current.to) - ms(month.current.from) === 30 * 24 * HOUR],
  [
    "the previous window is the same length",
    () =>
      ms(week.previous!.to) - ms(week.previous!.from) ===
      ms(week.current.to) - ms(week.current.from),
  ],
  [
    "the previous window ends exactly where the current one starts",
    () => week.previous!.to === week.current.from,
  ],
  ["the window ends now", () => week.current.to === NOW.toISOString()],

  // --- what the charts are asked for ---
  ["day charts are 30 daily buckets", () => day.grain === "day" && day.buckets === 30],
  ["week charts are 12 weekly buckets", () => week.grain === "week" && week.buckets === 12],
  ["month charts are 12 monthly buckets", () => month.grain === "month" && month.buckets === 12],

  // --- labels and links ---
  ["the window is named for what it covers", () => week.label === "Last 7 days"],
  ["the comparison is named too", () => week.previousLabel === "previous 7 days"],
  ["all time is the bare path", () => periodHref("all") === "/admin"],
  ["other periods are a query parameter", () => periodHref("month") === "/admin?period=month"],
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

console.log(`analytics period: ${passed}/${CHECKS.length} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
