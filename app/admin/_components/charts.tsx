import { cn } from "@/lib/utils/cn";

/**
 * The dashboard's charts, drawn on the server as plain HTML and a little SVG.
 *
 * No charting library, and no script. Hovering or tapping a column shows its
 * figures through CSS alone (`group-hover` / `group-focus`), so the numbers
 * are in the page the admin's session fetched and nowhere else: a bundle that
 * never ships is a bundle that cannot leak what it draws.
 *
 * Every chart is followed by the same figures as a table (TableView), which
 * is how they are read without a pointer. The tooltips add to that; they are
 * never the only way to a value.
 *
 * Rules these follow, so the page reads as one system:
 *   - colour is series identity only, and text never wears it;
 *   - bars are thin (24px at most), rounded at the data end, square at the
 *     baseline, and separated by a 2px gap of surface rather than an outline;
 *   - one y-axis per chart, starting at zero;
 *   - the bucket still in progress is drawn faded and labelled "so far".
 */

export interface ChartSeries {
  label: string;
  /** A background utility, written out in full where it is passed: "bg-chart-1". */
  swatch: string;
}

export interface ChartDatum {
  id: string;
  /** Short, under the axis. */
  tick: string;
  /** Full, in the tooltip. */
  name: string;
  /** One per series, in series order. */
  values: number[];
  isPartial?: boolean;
}

/** At most this many labels under an axis; the rest are in the tooltip and the table. */
const MAX_TICKS = 6;

/**
 * A round number at or above the largest value, so the gridlines land on
 * figures someone can read. Counts get an even top, so the middle line is a
 * whole number too.
 */
export function niceMax(value: number, integer: boolean): number {
  if (!(value > 0)) return integer ? 2 : 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const f = value / exp;
  const steps = integer && exp === 1 ? [2, 4, 6, 8, 10] : [1, 2, 4, 5, 8, 10];
  const step = steps.find((s) => f <= s + 1e-9) ?? 10;
  return step * exp;
}

function showTick(i: number, n: number, all: boolean): boolean {
  if (all) return true;
  const every = Math.ceil(n / MAX_TICKS);
  // Counted back from the newest bucket, so that one is always labelled.
  return (n - 1 - i) % every === 0;
}

function Grid({
  max,
  empty,
  axisFormat,
}: {
  max: number;
  /** Nothing to plot: keep the lines, but do not label a scale nothing is measured against. */
  empty: boolean;
  axisFormat: (n: number) => string;
}) {
  return (
    <>
      {[1, 0.5].map((f) => (
        <div
          key={f}
          className="pointer-events-none absolute inset-x-0 border-t border-ink-200/70"
          style={{ top: `${(1 - f) * 100}%` }}
        >
          {!empty && (
            <span className="absolute right-full mr-2 -translate-y-1/2 text-[11px] leading-none whitespace-nowrap text-ink-500 tabular-nums">
              {axisFormat(max * f)}
            </span>
          )}
        </div>
      ))}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-ink-300">
        <span className="absolute right-full mr-2 -translate-y-1/2 text-[11px] leading-none text-ink-500 tabular-nums">
          {axisFormat(0)}
        </span>
      </div>
    </>
  );
}

function Ticks({ data, allTicks }: { data: { id: string; tick: string }[]; allTicks: boolean }) {
  return (
    <div aria-hidden="true" className="flex h-5 pt-2">
      {data.map((d, i) => (
        <div key={d.id} className="relative min-w-0 flex-1">
          {showTick(i, data.length, allTicks) && (
            <span
              className={cn(
                "absolute top-0 left-1/2 -translate-x-1/2 text-[11px] leading-none whitespace-nowrap text-ink-500",
                // A chart that labels every column still drops every other
                // label on a phone, where they would run into each other.
                allTicks && data.length > MAX_TICKS && i % 2 === 1 && "max-sm:hidden",
              )}
            >
              {d.tick}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Shown beside the column it belongs to, inside the plot, on whichever side
 * has room. Values lead and labels follow: here the reader has the series and
 * wants the number.
 */
function Tooltip({
  side,
  title,
  total,
  rows,
}: {
  side: "left" | "right";
  title: string;
  total?: string;
  rows: { label: string; swatch: string; value: string }[];
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute top-0 z-20 hidden w-max max-w-60 rounded-xl bg-surface-0 px-3 py-2.5 text-left shadow-card ring-1 ring-ink-200/70 group-hover/col:block group-focus/col:block",
        side === "right" ? "left-[calc(50%+0.875rem)]" : "right-[calc(50%+0.875rem)]",
      )}
    >
      <div className="text-xs text-ink-500">{title}</div>
      {total && (
        <div className="mt-1 text-sm font-medium text-ink-900 tabular-nums">{total}</div>
      )}
      <ul className={cn("flex flex-col gap-1", total ? "mt-2" : "mt-1.5")}>
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-5 text-xs">
            <span className="flex items-center gap-1.5 text-ink-500">
              <span aria-hidden="true" className={cn("h-0.5 w-3 rounded-full", r.swatch)} />
              {r.label}
            </span>
            <span className="font-medium text-ink-900 tabular-nums">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Columns over time or over categories; stacked when there is more than one
 * series. The first series sits on the baseline, which is the only one whose
 * heights can be compared directly, so put the series that matters first.
 */
export function ColumnChart({
  series,
  data,
  format,
  axisFormat = format,
  integer = false,
  height = "h-56",
  label,
  emptyText,
  allTicks = false,
}: {
  series: ChartSeries[];
  data: ChartDatum[];
  format: (n: number) => string;
  axisFormat?: (n: number) => string;
  integer?: boolean;
  height?: string;
  label: string;
  emptyText: string;
  allTicks?: boolean;
}) {
  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const peak = Math.max(0, ...totals);
  const max = niceMax(peak, integer);
  const stacked = series.length > 1;

  return (
    <figure className="m-0 pl-11">
      <div role="img" aria-label={label} className={cn("relative", height)}>
        <Grid max={max} empty={peak === 0} axisFormat={axisFormat} />

        <div className="absolute inset-0 flex">
          {data.map((d, i) => {
            const total = totals[i];
            const top = d.values.reduce((last, v, k) => (v > 0 ? k : last), -1);
            return (
              <div
                key={d.id}
                tabIndex={-1}
                className="group/col relative flex h-full min-w-0 flex-1 items-end justify-center outline-none"
              >
                {/* The whole slot is the target, so a 3px bar is as easy to hit as a tall one. */}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-px inset-y-0 rounded-md bg-ink-900/5 opacity-0 transition-opacity duration-150 group-hover/col:opacity-100 group-focus/col:opacity-100"
                />
                {total > 0 && (
                  <div
                    className={cn(
                      "relative flex min-h-[3px] w-[calc(100%-2px)] max-w-6 flex-col-reverse gap-0.5",
                      d.isPartial && "opacity-50",
                    )}
                    style={{ height: `${(total / max) * 100}%` }}
                  >
                    {d.values.map((v, k) =>
                      v > 0 ? (
                        <div
                          key={series[k].label}
                          className={cn(
                            "min-h-0.5 w-full",
                            series[k].swatch,
                            k === top && "rounded-t-[4px]",
                          )}
                          style={{ flexGrow: v, flexBasis: 0 }}
                        />
                      ) : null,
                    )}
                  </div>
                )}
                <Tooltip
                  side={i < data.length / 2 ? "right" : "left"}
                  title={d.isPartial ? `${d.name} · so far` : d.name}
                  total={stacked ? format(total) : undefined}
                  rows={series.map((s, k) => ({
                    label: s.label,
                    swatch: s.swatch,
                    value: format(d.values[k] ?? 0),
                  }))}
                />
              </div>
            );
          })}
        </div>

        {peak === 0 && (
          <div className="absolute inset-0 grid place-items-center px-4">
            <p className="max-w-[36ch] rounded-md bg-surface-0 px-3 py-1 text-center text-sm text-pretty text-ink-500">
              {emptyText}
            </p>
          </div>
        )}
      </div>
      <Ticks data={data} allTicks={allTicks} />
    </figure>
  );
}

/**
 * One series over time, as a line with a faint wash under it. For a running
 * total, where the shape is the point and the bars would all be nearly the
 * same height.
 */
export function LineChart({
  seriesLabel,
  data,
  format,
  axisFormat = format,
  integer = false,
  height = "h-40",
  label,
  emptyText,
}: {
  seriesLabel: string;
  data: { id: string; tick: string; name: string; value: number; isPartial?: boolean }[];
  format: (n: number) => string;
  axisFormat?: (n: number) => string;
  integer?: boolean;
  height?: string;
  label: string;
  emptyText: string;
}) {
  const peak = Math.max(0, ...data.map((d) => d.value));
  const max = niceMax(peak, integer);
  const n = data.length;
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => 100 - (v / max) * 100;
  const points = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  const last = n - 1;

  return (
    <figure className="m-0 pl-11">
      <div role="img" aria-label={label} className={cn("relative", height)}>
        <Grid max={max} empty={peak === 0} axisFormat={axisFormat} />

        {peak > 0 && n > 0 && (
          <>
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
              className="absolute inset-0 h-full w-full overflow-visible"
            >
              <polygon
                points={`${x(0)},100 ${points} ${x(last)},100`}
                className="fill-chart-1 opacity-10"
              />
              <polyline
                points={points}
                fill="none"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className="stroke-chart-1"
              />
            </svg>
            {/* The end of the line, where the eye lands. A ring of surface keeps it clear of the line. */}
            <span
              aria-hidden="true"
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-1 ring-2 ring-surface-0"
              style={{ left: `${x(last)}%`, top: `${y(data[last].value)}%` }}
            />
          </>
        )}

        <div className="absolute inset-0 flex">
          {data.map((d, i) => (
            <div
              key={d.id}
              tabIndex={-1}
              className="group/col relative h-full min-w-0 flex-1 outline-none"
            >
              {/* The crosshair finds the date; nobody has to aim at a 2px line. */}
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-1/2 w-px bg-ink-300 opacity-0 group-hover/col:opacity-100 group-focus/col:opacity-100"
              />
              {peak > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-1 opacity-0 ring-2 ring-surface-0 group-hover/col:opacity-100 group-focus/col:opacity-100"
                  style={{ top: `${y(d.value)}%` }}
                />
              )}
              <Tooltip
                side={i < n / 2 ? "right" : "left"}
                title={d.isPartial ? `${d.name} · so far` : d.name}
                rows={[{ label: seriesLabel, swatch: "bg-chart-1", value: format(d.value) }]}
              />
            </div>
          ))}
        </div>

        {peak === 0 && (
          <div className="absolute inset-0 grid place-items-center px-4">
            <p className="max-w-[36ch] rounded-md bg-surface-0 px-3 py-1 text-center text-sm text-pretty text-ink-500">
              {emptyText}
            </p>
          </div>
        )}
      </div>
      <Ticks data={data} allTicks={false} />
    </figure>
  );
}

/**
 * A trend in the corner of a stat. Decoration beside a number that is already
 * stated, so it is hidden from assistive technology; the full chart and its
 * table are further down the page.
 *
 * Grey, with only the latest point in colour: it shows direction, and should
 * not compete with the figure it sits next to.
 */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  const n = values.length;
  const x = (i: number) => (i / (n - 1)) * 100;
  // Kept off the top and bottom edges so the stroke and the dot are not clipped.
  const y = (v: number) => (span === 0 ? 50 : 88 - ((v - lo) / span) * 76);

  return (
    <span aria-hidden="true" className="relative block h-8 w-24 shrink-0">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        <polyline
          points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
          fill="none"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="stroke-ink-300"
        />
      </svg>
      <span
        className="absolute right-0 size-1.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-1 ring-2 ring-surface-0"
        style={{ top: `${y(values[n - 1])}%` }}
      />
    </span>
  );
}

/**
 * Parts of one whole, as a single bar. For "what is this total made of",
 * where a pie would make three close values hard to compare.
 */
export function ProportionBar({
  parts,
  label,
}: {
  parts: { label: string; swatch: string; value: number }[];
  label: string;
}) {
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div
      role="img"
      aria-label={label}
      className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-100"
    >
      {shown.map((p) => (
        <div
          key={p.label}
          className={cn("h-full min-w-1", p.swatch)}
          style={{ flexGrow: p.value, flexBasis: 0 }}
        />
      ))}
    </div>
  );
}
