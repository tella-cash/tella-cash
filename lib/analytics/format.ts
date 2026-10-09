import { ANALYTICS_TZ, type Grain } from "./period";

/**
 * How the dashboard writes numbers and dates. One place, so a figure reads
 * the same in a tile, a tooltip and a table.
 */

const LOCALE = "en-NG";
/** A real minus, not a hyphen: it lines up with "+" and reads as a sign. */
const MINUS = "−";

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString(LOCALE);
}

/** "$1,234.56". Always two decimals: a volume that drops its cents looks rounded. */
export function fmtUsd(n: number): string {
  const abs = Math.abs(n).toLocaleString(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? MINUS : ""}$${abs}`;
}

/** "$1.2K", for axis ticks, where the exact cents are in the tooltip. */
export function fmtUsdCompact(n: number): string {
  return `$${fmtCompact(n)}`;
}

export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs < 1000) return String(Math.round(abs * 100) / 100);
  return abs.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
}

/** One decimal under 10%, none above: "4.2%", "38%". */
export function fmtPct(p: number): string {
  const v = Math.abs(p) * 100;
  const digits = v < 10 && v !== 0 ? 1 : 0;
  return `${v.toLocaleString(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: digits })}%`;
}

export function sign(n: number): string {
  return n > 0 ? "+" : n < 0 ? MINUS : "";
}

export function fmtSignedInt(n: number): string {
  return `${sign(n)}${fmtInt(Math.abs(n))}`;
}

export function fmtSignedUsd(n: number): string {
  return `${sign(n)}${fmtUsd(Math.abs(n))}`;
}

export function fmtSignedPct(p: number): string {
  return `${sign(p)}${fmtPct(p)}`;
}

/** "3 minutes", "5 hours", "2.5 days". */
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, seconds);
  const unit = (value: number, name: string) => {
    const shown = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
    return `${shown} ${name}${shown === 1 ? "" : "s"}`;
  };
  if (s < 90) return unit(Math.round(s), "second");
  if (s < 90 * 60) return unit(s / 60, "minute");
  if (s < 36 * 3600) return unit(s / 3600, "hour");
  return unit(s / 86400, "day");
}

/** A bucket's date is already local; parse and print it as UTC so it never shifts a day. */
function bucketDate(bucket: string): Date {
  return new Date(`${bucket}T00:00:00Z`);
}

/** Short, for an axis: "09 Oct", "Oct". */
export function bucketTick(bucket: string, grain: Grain): string {
  const d = bucketDate(bucket);
  if (Number.isNaN(d.getTime())) return bucket;
  return grain === "month"
    ? d.toLocaleDateString(LOCALE, { month: "short", timeZone: "UTC" })
    : d.toLocaleDateString(LOCALE, { day: "2-digit", month: "short", timeZone: "UTC" });
}

/** Full, for a tooltip or a table row: "Thu 9 Oct 2026", "Week of 5 Oct 2026", "October 2026". */
export function bucketName(bucket: string, grain: Grain): string {
  const d = bucketDate(bucket);
  if (Number.isNaN(d.getTime())) return bucket;
  if (grain === "month") {
    return d.toLocaleDateString(LOCALE, { month: "long", year: "numeric", timeZone: "UTC" });
  }
  const day = d.toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  if (grain === "week") return `Week of ${day}`;
  const weekday = d.toLocaleDateString(LOCALE, { weekday: "short", timeZone: "UTC" });
  return `${weekday} ${day}`;
}

/** A cohort month: "Jul 2026". */
export function fmtMonth(isoDate: string): string {
  const d = bucketDate(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(LOCALE, { month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, {
    timeZone: ANALYTICS_TZ,
    dateStyle: "medium",
    timeStyle: "short",
  });
}
