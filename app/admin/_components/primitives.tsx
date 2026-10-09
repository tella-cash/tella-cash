import type { Delta, Share } from "@/lib/analytics/derive";
import { fmtInt, fmtPct, fmtSignedInt, fmtSignedPct } from "@/lib/analytics/format";
import type { Section as Loaded, UnavailableReason } from "@/lib/analytics/queries";

/**
 * The small pieces every section of the dashboard is built from.
 *
 * All server-rendered. Nothing here has state, so the figures are in the
 * HTML the admin's session fetched and in no script.
 */

export const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500";

/** A titled band of the page. The caption says what stretch of time it covers. */
export function Section({
  id,
  title,
  caption,
  children,
}: {
  id: string;
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-14 border-t border-ink-200/60 pt-7 sm:mt-16">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id={id} className="font-display text-[1.75rem] leading-none text-ink-900">
          {title}
        </h2>
        {caption && <p className="text-sm text-ink-500">{caption}</p>}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** A surface that groups one chart or one list. A hairline ring, no shadow. */
export function Panel({
  title,
  hint,
  aside,
  className = "",
  children,
}: {
  title?: string;
  hint?: string;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // min-w-0: a grid child is as wide as its widest content unless told
    // otherwise, and a wide table inside would push the whole page sideways on
    // a phone instead of scrolling within its own box.
    <div
      className={`min-w-0 rounded-2xl bg-surface-0 p-5 ring-1 ring-ink-200/60 sm:p-6 ${className}`}
    >
      {(title || aside) && (
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div>
            {title && <h3 className="text-[0.9375rem] font-medium text-ink-900">{title}</h3>}
            {hint && <p className="mt-1 max-w-[52ch] text-sm text-pretty text-ink-500">{hint}</p>}
          </div>
          {aside}
        </div>
      )}
      {children}
    </div>
  );
}

const UNAVAILABLE: Record<UnavailableReason, string> = {
  migration: "This needs migration 0033, which hasn't been applied to this database yet.",
  permission: "The database refused this query. Check the grants in migration 0033.",
  timeout: "This took too long to load. Reload the page to try again.",
  error: "This couldn't be loaded. Reload the page to try again.",
};

/**
 * Render a section's data, or a plain note saying why it is not there. One
 * failed query costs one card, and the card says what happened.
 */
export function Load<T>({
  from,
  children,
}: {
  from: Loaded<T>;
  children: (data: T) => React.ReactNode;
}) {
  if (from.status === "ok") return <>{children(from.data)}</>;
  return (
    <p role="status" className="rounded-xl bg-surface-100 px-4 py-3 text-sm text-ink-500">
      {UNAVAILABLE[from.reason]}
    </p>
  );
}

/** For a chart or list with nothing in it yet. Says so, instead of drawing empty axes. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl bg-surface-100 px-4 py-6 text-center text-sm text-pretty text-ink-500">
      {children}
    </p>
  );
}

/**
 * Change since the previous period.
 *
 * Direction is carried three ways (arrow, sign, colour), so it never depends
 * on telling green from red. `format` writes the absolute difference; a
 * percentage is only ever shown when derive.ts decided there is enough behind
 * it.
 */
export function DeltaNote({
  delta,
  versus,
  format = fmtSignedInt,
}: {
  delta: Delta;
  versus: string | null;
  format?: (diff: number) => string;
}) {
  if (delta.kind === "none" || !versus) return null;

  const tone =
    delta.diff > 0 ? "text-up" : delta.diff < 0 ? "text-down" : "text-ink-500";

  const figure = delta.kind === "percent" ? fmtSignedPct(delta.pct) : format(delta.diff);

  const context =
    delta.kind === "percent"
      ? `vs ${versus}`
      : delta.caveat === "prior-zero"
        ? `from none in the ${versus}`
        : delta.caveat === "prior-incomplete"
          ? "vs a shorter earlier period"
          : `vs ${versus}`;

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 text-sm">
      <span className={`inline-flex items-center gap-1 font-medium ${tone}`}>
        <Arrow diff={delta.diff} />
        {figure}
      </span>
      <span className="text-ink-500">{context}</span>
    </span>
  );
}

function Arrow({ diff }: { diff: number }) {
  if (diff === 0) return null;
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
      className={diff < 0 ? "rotate-180" : undefined}
    >
      <path d="M5 1.5 9 8H1z" fill="currentColor" />
    </svg>
  );
}

/** "38%", or "3 of 7" when there are too few for a percentage to mean anything. */
export function shareText(s: Share): string {
  if (s.kind === "empty") return "—";
  if (s.kind === "of") return `${fmtInt(s.k)} of ${fmtInt(s.n)}`;
  return fmtPct(s.pct);
}

/** A swatch and a label. The legend entry for one series; the label stays ink. */
export function Key({
  swatch,
  label,
  value,
}: {
  swatch: string;
  label: string;
  value?: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-2 text-sm">
      <span
        aria-hidden="true"
        className={`inline-block size-2.5 shrink-0 translate-y-px rounded-[3px] ${swatch}`}
      />
      <span className="text-ink-500">{label}</span>
      {value && <span className="font-medium text-ink-900 tabular-nums">{value}</span>}
    </span>
  );
}

/**
 * The same numbers as the chart above it, as a table.
 *
 * Every chart has one. It is how the figures are read without a pointer, and
 * it is the literal "per day / per week / per month" list.
 */
export function TableView({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="group mt-4">
      <summary
        className={`inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md text-sm text-ink-500 transition-colors duration-200 hover:text-ink-900 [&::-webkit-details-marker]:hidden ${FOCUS}`}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
          className="transition-transform duration-200 group-open:rotate-90"
        >
          <path d="M3 1.5 7 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        View as table
      </summary>
      <div className="mt-3 max-h-80 overflow-auto rounded-xl ring-1 ring-ink-200/60">
        <table className="w-full min-w-max border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-surface-100 text-left text-ink-500">
            <tr>
              {head.map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={`px-3 py-2 font-medium whitespace-nowrap ${i > 0 ? "text-right" : ""}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200/60">
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, i) =>
                  i === 0 ? (
                    <th
                      key={i}
                      scope="row"
                      className="px-3 py-2 text-left font-normal whitespace-nowrap text-ink-900"
                    >
                      {cell}
                    </th>
                  ) : (
                    <td key={i} className="px-3 py-2 text-right whitespace-nowrap text-ink-700 tabular-nums">
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Labelled horizontal bars for a handful of unordered things (channels,
 * networks). One colour for all of them: the bars are one series, and their
 * length already says which is bigger.
 */
export function BarList({
  rows,
  total,
}: {
  rows: { label: string; value: number; display: string; note?: string }[];
  total?: number;
}) {
  const scale = Math.max(1, total ?? Math.max(...rows.map((r) => r.value)));
  return (
    <ul className="flex flex-col gap-3.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-ink-900">{r.label}</span>
            <span className="text-ink-500 tabular-nums">
              <span className="font-medium text-ink-900">{r.display}</span>
              {r.note && <span className="ml-2">{r.note}</span>}
            </span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-surface-100">
            {r.value > 0 && (
              <div
                className="h-full min-w-1 rounded-full bg-chart-1"
                style={{ width: `${Math.min(100, (r.value / scale) * 100)}%` }}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
