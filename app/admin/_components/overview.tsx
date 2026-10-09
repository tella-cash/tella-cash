import { delta, priorCoverage, transferSize } from "@/lib/analytics/derive";
import {
  bucketName,
  bucketTick,
  fmtInt,
  fmtSignedUsd,
  fmtUsd,
  fmtUsdCompact,
} from "@/lib/analytics/format";
import type { ResolvedPeriod } from "@/lib/analytics/period";
import type { AnalyticsData, Series, Summary } from "@/lib/analytics/queries";
import { ColumnChart, LineChart, ProportionBar, Sparkline, type ChartSeries } from "./charts";
import { DeltaNote, Key, Load, Panel, Section, TableView } from "./primitives";

/**
 * The top of the page: the four figures the dashboard exists for, then how
 * the user base is growing.
 *
 * Volume leads, alone and large, because it is the number a reader came for.
 * It is drawn as its three parts so nobody has to ask what is in it.
 */

/**
 * Tella-to-tella sits on the baseline of every stack, where its heights can
 * be compared bar to bar: it is the one flow that is pure product use, with a
 * tella wallet on both ends.
 */
const FLOWS: (ChartSeries & { key: "p2p" | "deposits" | "withdrawals" })[] = [
  { key: "p2p", label: "Tella to Tella", swatch: "bg-chart-1" },
  { key: "deposits", label: "Deposits", swatch: "bg-chart-2" },
  { key: "withdrawals", label: "Withdrawals", swatch: "bg-chart-3" },
];

const ACTIVE_SERIES: ChartSeries[] = [
  { label: "Returning", swatch: "bg-chart-1" },
  { label: "New", swatch: "bg-chart-2" },
];

function grainCaption(series: Series): string {
  const partial = series.points.some((p) => p.isPartial);
  return `By ${series.grain}, Lagos time${partial ? `. The current ${series.grain} is still in progress.` : ""}`;
}

export function Overview({ data }: { data: AnalyticsData }) {
  const { period } = data;
  const series = data.series.status === "ok" ? data.series.data : null;

  return (
    <section aria-label="Overview" className="pt-8 sm:pt-10">
      <Load from={data.summary}>
        {({ current, previous }) => (
          <>
            <div className="grid gap-6 lg:grid-cols-12">
              <VolumeHero
                current={current}
                previous={previous}
                period={period}
                series={series}
              />
              <HeadlineStats
                current={current}
                previous={previous}
                period={period}
                series={series}
              />
            </div>
            <FlowStrip current={current} />
          </>
        )}
      </Load>
    </section>
  );
}

function VolumeHero({
  current,
  previous,
  period,
  series,
}: {
  current: Summary;
  previous: Summary | null;
  period: ResolvedPeriod;
  series: Series | null;
}) {
  const { volume, transfers } = current;
  const coverage = priorCoverage(period.previous, current.meta.ledgerFirstAt);

  return (
    <div className="min-w-0 rounded-3xl bg-surface-0 p-6 ring-1 ring-ink-200/60 sm:p-8 lg:col-span-8">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[0.9375rem] font-medium text-ink-900">Transaction volume</h2>
        <span className="text-sm text-ink-500">{period.label}</span>
      </div>

      {/* The one hero figure on the page. Same sans as everything else, and
          proportional digits: tabular ones look loose at this size. */}
      <p className="mt-4 flex flex-wrap items-baseline gap-x-3 text-5xl leading-none font-medium tracking-[-0.035em] text-ink-900 sm:text-6xl">
        {fmtUsd(volume.total)}
        <span className="text-base font-normal tracking-normal text-ink-500">USDC</span>
      </p>

      {/* Held open for any windowed period, so the bar below does not jump
          when a comparison is missing; all time has none to show. */}
      {period.previous && (
        <div className="mt-3 min-h-5">
          <DeltaNote
            delta={delta(volume.total, previous?.volume.total, {
              coverage,
              base: previous?.transfers.total,
            })}
            versus={period.previousLabel}
            format={fmtSignedUsd}
          />
        </div>
      )}

      <div className="mt-7">
        <ProportionBar
          label="Share of volume by kind of transfer"
          parts={FLOWS.map((f) => ({ label: f.label, swatch: f.swatch, value: volume[f.key] }))}
        />
        <div className="mt-3.5 flex flex-wrap gap-x-7 gap-y-2">
          {FLOWS.map((f) => (
            <Key
              key={f.key}
              swatch={f.swatch}
              label={`${f.label} (${fmtInt(transfers[f.key])})`}
              value={fmtUsd(volume[f.key])}
            />
          ))}
        </div>
      </div>

      {series && (
        <div className="mt-9">
          <p className="mb-4 text-sm text-ink-500">{grainCaption(series)}</p>
          <ColumnChart
            series={FLOWS}
            data={series.points.map((p) => ({
              id: p.bucket,
              tick: bucketTick(p.bucket, series.grain),
              name: bucketName(p.bucket, series.grain),
              values: FLOWS.map((f) => p[f.key]),
              isPartial: p.isPartial,
            }))}
            format={fmtUsd}
            axisFormat={fmtUsdCompact}
            height="h-60"
            label={`Transaction volume by ${series.grain}, split into Tella to Tella, deposits and withdrawals`}
            emptyText="No settled transfers in these buckets yet."
          />
          <TableView
            caption={`Transaction volume by ${series.grain}`}
            head={[capitalise(series.grain), "Tella to Tella", "Deposits", "Withdrawals", "Volume", "Transfers"]}
            rows={[...series.points].reverse().map((p) => [
              bucketName(p.bucket, series.grain) + (p.isPartial ? " (so far)" : ""),
              fmtUsd(p.p2p),
              fmtUsd(p.deposits),
              fmtUsd(p.withdrawals),
              fmtUsd(p.volume),
              fmtInt(p.transfers),
            ])}
          />
        </div>
      )}
    </div>
  );
}

function HeadlineStats({
  current,
  previous,
  period,
  series,
}: {
  current: Summary;
  previous: Summary | null;
  period: ResolvedPeriod;
  series: Series | null;
}) {
  const { users, actives, transfers, meta } = current;
  const windowed = period.key !== "all";
  const userCoverage = priorCoverage(period.previous, meta.usersFirstAt);
  const ledgerCoverage = priorCoverage(period.previous, meta.ledgerFirstAt);
  const size = transferSize(transfers);
  // Trends leave out the bucket in progress: a part-finished week always
  // looks like a fall.
  const complete = series?.points.filter((p) => !p.isPartial) ?? [];

  return (
    <div className="grid min-w-0 divide-y divide-ink-200/60 rounded-3xl bg-surface-0 px-6 ring-1 ring-ink-200/60 sm:px-7 lg:col-span-4 lg:grid-rows-3">
      <Stat
        label="Total users"
        value={fmtInt(users.total)}
        spark={series && <Sparkline values={series.points.map((p) => p.cumulativeUsers)} />}
        delta={
          windowed && (
            // A running total only ever goes up, so what is compared is how
            // many joined in each window, and the line says "new" first so
            // the percentage cannot be read as growth in the total.
            <span className="inline-flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="text-ink-500">
                <strong className="font-medium text-ink-900">{fmtInt(users.new)}</strong> new
              </span>
              <DeltaNote
                delta={delta(users.new, previous?.users.new, { coverage: userCoverage })}
                versus={period.previousLabel}
              />
            </span>
          )
        }
        detail={`${fmtInt(users.onboarded)} finished signup, ${fmtInt(users.withWallet)} have a wallet.`}
      />
      <Stat
        label="Active wallets"
        value={fmtInt(actives.total)}
        spark={complete.length > 1 && <Sparkline values={complete.map((p) => p.activeWallets)} />}
        delta={
          <DeltaNote
            delta={delta(actives.total, previous?.actives.total, { coverage: ledgerCoverage })}
            versus={period.previousLabel}
          />
        }
        detail={
          <>
            {fmtInt(actives.senders)} sent, {fmtInt(actives.receiveOnly)} received only.
            {windowed && actives.total > 0 && (
              <>
                {" "}
                {fmtInt(actives.new)} for the first time.
              </>
            )}
          </>
        }
      />
      <Stat
        label="Successful transfers"
        value={fmtInt(transfers.total)}
        spark={complete.length > 1 && <Sparkline values={complete.map((p) => p.transfers)} />}
        delta={
          <DeltaNote
            delta={delta(transfers.total, previous?.transfers.total, { coverage: ledgerCoverage })}
            versus={period.previousLabel}
          />
        }
        detail={
          size
            ? `Median ${fmtUsd(size.median)}, average ${fmtUsd(size.avg)}.`
            : transfers.total > 0
              ? "Too few to quote a typical size."
              : "None settled in this window."
        }
      />
    </div>
  );
}

function Stat({
  label,
  value,
  spark,
  delta: change,
  detail,
}: {
  label: string;
  value: string;
  spark?: React.ReactNode;
  delta?: React.ReactNode;
  detail: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-center py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-normal text-ink-500">{label}</h3>
          <p className="mt-2 text-[2.125rem] leading-none font-medium tracking-[-0.025em] text-ink-900">
            {value}
          </p>
        </div>
        {spark}
      </div>
      {change && <div className="mt-2.5 empty:hidden">{change}</div>}
      <p className="mt-2 text-sm text-pretty text-ink-500">{detail}</p>
    </div>
  );
}

/** The raw two-sided totals, shown apart from the headline and labelled as overlapping. */
function FlowStrip({ current }: { current: Summary }) {
  const { volume, transfers, actives } = current;
  const perWallet =
    actives.total >= 5 ? (transfers.total / actives.total).toFixed(1) : "—";

  const items = [
    { label: "Sent", value: fmtUsd(volume.rawSent), note: "Everything users sent" },
    { label: "Received", value: fmtUsd(volume.rawReceived), note: "Everything users received" },
    {
      label: "Recorded net flow",
      value: fmtSignedUsd(volume.netFlow),
      note: "Deposits minus withdrawals",
    },
    {
      label: "Transfers per active wallet",
      value: perWallet,
      note:
        actives.total >= 5
          ? `${fmtInt(transfers.total)} across ${fmtInt(actives.total)} wallets`
          : "Shown from five active wallets",
    },
  ];

  return (
    <div className="mt-8">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="border-l border-ink-200 pl-4">
            <dt className="text-sm text-ink-500">{item.label}</dt>
            <dd className="mt-1.5 text-xl font-medium tracking-[-0.015em] text-ink-900">
              {item.value}
            </dd>
            <dd className="mt-1 text-xs text-ink-500">{item.note}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 max-w-[78ch] text-sm text-pretty text-ink-500">
        Sent and Received both include transfers between two Tella users, so they overlap.
        Transaction volume counts each of those once.
      </p>
    </div>
  );
}

export function Growth({ data }: { data: AnalyticsData }) {
  const caption = data.series.status === "ok" ? grainCaption(data.series.data) : undefined;

  return (
    <Section id="growth" title="Growth" caption={caption}>
      <Load from={data.series}>
        {(series) => {
          const { grain, points } = series;
          const datum = (p: (typeof points)[number]) => ({
            id: p.bucket,
            tick: bucketTick(p.bucket, grain),
            name: bucketName(p.bucket, grain),
            isPartial: p.isPartial,
          });
          return (
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Users" hint="An account exists from someone's first message to Tella.">
                <p className="mb-3 text-sm text-ink-500">New per {grain}</p>
                <ColumnChart
                  series={[{ label: "New users", swatch: "bg-chart-1" }]}
                  data={points.map((p) => ({ ...datum(p), values: [p.newUsers] }))}
                  format={fmtInt}
                  integer
                  height="h-36"
                  label={`New users per ${grain}`}
                  emptyText="No signups in these buckets yet."
                />
                <p className="mt-6 mb-3 text-sm text-ink-500">Running total</p>
                <LineChart
                  seriesLabel="Total users"
                  data={points.map((p) => ({ ...datum(p), value: p.cumulativeUsers }))}
                  format={fmtInt}
                  integer
                  height="h-36"
                  label={`Total users at the end of each ${grain}`}
                  emptyText="No users yet."
                />
                <TableView
                  caption={`Users by ${grain}`}
                  head={[capitalise(grain), "New users", "Total users"]}
                  rows={[...points].reverse().map((p) => [
                    bucketName(p.bucket, grain) + (p.isPartial ? " (so far)" : ""),
                    fmtInt(p.newUsers),
                    fmtInt(p.cumulativeUsers),
                  ])}
                />
              </Panel>

              <Panel
                title="Active wallets"
                hint={`Wallets with at least one settled transfer in the ${grain}. New means it was their first ever.`}
              >
                <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2">
                  {ACTIVE_SERIES.map((s) => (
                    <Key key={s.label} swatch={s.swatch} label={s.label} />
                  ))}
                </div>
                <ColumnChart
                  series={ACTIVE_SERIES}
                  data={points.map((p) => ({
                    ...datum(p),
                    values: [p.returningActives, p.newActives],
                  }))}
                  format={fmtInt}
                  integer
                  height="h-84"
                  label={`Active wallets per ${grain}, split into returning and new`}
                  emptyText="No wallet has transacted in these buckets yet."
                />
                <TableView
                  caption={`Active wallets by ${grain}`}
                  head={[capitalise(grain), "Active", "Returning", "New"]}
                  rows={[...points].reverse().map((p) => [
                    bucketName(p.bucket, grain) + (p.isPartial ? " (so far)" : ""),
                    fmtInt(p.activeWallets),
                    fmtInt(p.returningActives),
                    fmtInt(p.newActives),
                  ])}
                />
              </Panel>
            </div>
          );
        }}
      </Load>
    </Section>
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
