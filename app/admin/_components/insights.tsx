import {
  buildFunnel,
  concentration,
  shapeRetention,
  sizeBucketLabel,
  stickiness,
  timeToFirstTransfer,
  type Cohort,
} from "@/lib/analytics/derive";
import { fmtDuration, fmtInt, fmtMonth, fmtPct, fmtUsd } from "@/lib/analytics/format";
import type { AnalyticsData, Distribution, Engagement, Funnel } from "@/lib/analytics/queries";
import { ColumnChart } from "./charts";
import { BarList, Empty, Load, Panel, Section, TableView, shareText } from "./primitives";

/**
 * The questions behind the headline: do people who sign up get as far as
 * using it, do they come back, and where does the volume come from.
 */

const CHANNEL_LABEL: Record<string, string> = {
  meta: "WhatsApp",
  telegram: "Telegram",
};

const CHAIN_LABEL: Record<string, string> = {
  ARC: "Arc",
  "ARC-TESTNET": "Arc",
  BASE: "Base",
  "BASE-SEPOLIA": "Base",
};

/* ---------- activation ---------- */

export function Activation({ data }: { data: AnalyticsData }) {
  const { period } = data;
  const caption =
    period.key === "all"
      ? "Everyone who has signed up"
      : `People who signed up in the ${period.label.toLowerCase()}`;

  return (
    <Section id="activation" title="Activation" caption={caption}>
      <div className="grid gap-6 lg:grid-cols-5">
        <Panel
          className="lg:col-span-3"
          title="From signup to repeat use"
          hint="Each step requires the ones above it, and is shown as a share of the step before."
        >
          <Load from={data.funnel}>{(funnel) => <FunnelBars funnel={funnel} />}</Load>
        </Panel>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Panel title="Time to first transfer">
            <Load from={data.funnel}>
              {(funnel) => {
                const time = timeToFirstTransfer(funnel);
                return time ? (
                  <>
                    <p className="text-[2.125rem] leading-none font-medium tracking-[-0.025em] text-ink-900">
                      {fmtDuration(time.seconds)}
                    </p>
                    <p className="mt-2.5 text-sm text-pretty text-ink-500">
                      Median from first message to first settled transfer, among the{" "}
                      {fmtInt(time.n)} who have made one.
                    </p>
                  </>
                ) : (
                  <Empty>
                    Shown once five people in this group have a settled transfer.
                  </Empty>
                );
              }}
            </Load>
          </Panel>

          <Panel title="Signup channel" hint="Where each person first messaged Tella.">
            <Load from={data.distribution}>
              {(d) =>
                d.channels.length === 0 ? (
                  <Empty>No signups to show yet.</Empty>
                ) : (
                  <BarList
                    rows={d.channels.map((c) => ({
                      label: CHANNEL_LABEL[c.channel] ?? c.channel,
                      value: c.users,
                      display: fmtInt(c.users),
                      note: `${fmtInt(c.activeWallets)} active`,
                    }))}
                  />
                )
              }
            </Load>
          </Panel>
        </div>
      </div>
    </Section>
  );
}

/**
 * One colour for every stage. The stages are one measure, and the bar's
 * length already carries the order; a ramp of six blues that stay distinct
 * and still clear the surface does not exist in the palette, so none is used.
 */
function FunnelBars({ funnel }: { funnel: Funnel }) {
  const stages = buildFunnel(funnel);

  if (funnel.signedUp === 0) {
    return <Empty>Nobody signed up in this window.</Empty>;
  }

  return (
    <>
      <ol className="flex flex-col gap-4">
        {stages.map((s) => (
          <li key={s.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-ink-900">{s.label}</span>
              <span className="text-ink-500 tabular-nums">
                <span className="font-medium text-ink-900">{fmtInt(s.count)}</span>
                {s.ofPrevious && <span className="ml-2.5">{shareText(s.ofPrevious)}</span>}
              </span>
            </div>
            <div className="mt-2 h-2.5 w-full rounded-full bg-surface-100">
              {s.count > 0 && (
                <div
                  className="h-full min-w-1 rounded-full bg-chart-1"
                  style={{ width: `${s.ofTop * 100}%` }}
                />
              )}
            </div>
          </li>
        ))}
      </ol>
      {funnel.sentWithoutReceiving > 0 && (
        <p className="mt-5 border-t border-ink-200/60 pt-4 text-sm text-pretty text-ink-500">
          {fmtInt(funnel.sentWithoutReceiving)}{" "}
          {funnel.sentWithoutReceiving === 1 ? "person has" : "people have"} sent money with no
          receipt on record, so they are counted up to &ldquo;Wallet ready&rdquo; and no further.
          {" "}
          {fmtInt(funnel.anySent)} people have sent in total.
        </p>
      )}
    </>
  );
}

/* ---------- retention and engagement ---------- */

export function Retention({ data }: { data: AnalyticsData }) {
  return (
    <Section
      id="retention"
      title="Retention"
      caption="Monthly cohorts and the last 30 full days. The period filter does not change these."
    >
      <div className="grid gap-6 lg:grid-cols-5">
        <Panel
          className="lg:col-span-3"
          title="Who comes back"
          hint="Of the wallets that made their first transfer in a month, how many made another in each month after."
        >
          <Load from={data.retention}>
            {(rows) => <CohortGrid cohorts={shapeRetention(rows)} />}
          </Load>
        </Panel>

        <Panel
          className="lg:col-span-2"
          title="Transacting wallets"
          hint="Wallets with a settled transfer. Tella keeps no log of chats opened, so this is use of money, not app opens."
        >
          <Load from={data.engagement}>
            {(e) => <EngagementList e={e} now={new Date(data.generatedAt)} />}
          </Load>
        </Panel>
      </div>
    </Section>
  );
}

/**
 * A heatmap, because the grid's job is "where is it strong and where does it
 * fade". One hue, stronger for more. The figure is printed in every cell, so
 * the colour is never the only way to read it.
 */
function CohortGrid({ cohorts }: { cohorts: Cohort[] }) {
  const maxOffset = Math.max(0, ...cohorts.flatMap((c) => c.cells.map((cell) => cell.offset)));

  if (cohorts.length === 0) {
    return <Empty>Appears once a wallet has a settled transfer.</Empty>;
  }
  if (maxOffset === 0) {
    return (
      <Empty>
        Every wallet so far made its first transfer this month. Retention appears next month,
        when there is a month to come back in.
      </Empty>
    );
  }

  const offsets = Array.from({ length: maxOffset }, (_, i) => i + 1);
  const anyPartial = cohorts.some((c) => c.cells.some((cell) => cell.offset > 0 && cell.isPartial));

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-separate border-spacing-1 text-sm">
          <caption className="sr-only">
            Monthly retention by month of first transfer
          </caption>
          <thead>
            <tr className="text-ink-500">
              <th scope="col" className="pr-3 pb-1 text-left font-normal">
                First transfer
              </th>
              <th scope="col" className="px-2 pb-1 text-right font-normal">
                Wallets
              </th>
              {offsets.map((o) => (
                <th key={o} scope="col" className="min-w-14 pb-1 text-center font-normal">
                  +{o} mo
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...cohorts].reverse().map((c) => (
              <tr key={c.month}>
                <th scope="row" className="pr-3 text-left font-normal whitespace-nowrap text-ink-900">
                  {fmtMonth(c.month)}
                </th>
                <td className="px-2 text-right text-ink-700 tabular-nums">{fmtInt(c.size)}</td>
                {offsets.map((o) => {
                  const cell = c.cells.find((x) => x.offset === o);
                  if (!cell) return <td key={o} />;
                  const pct = c.size > 0 ? cell.active / c.size : 0;
                  return (
                    <td
                      key={o}
                      // The month in progress keeps its full-contrast figure
                      // and is marked with an outline, not by fading it.
                      className={`rounded-md px-2 py-2 text-center text-ink-900 tabular-nums ${cell.isPartial ? "outline-1 -outline-offset-1 outline-ink-400 outline-dashed" : ""}`}
                      style={{
                        background: `color-mix(in oklab, var(--color-heat) ${Math.round(pct * 100)}%, var(--color-surface-100))`,
                      }}
                    >
                      {cell.share.kind === "of"
                        ? `${fmtInt(cell.share.k)}/${fmtInt(cell.share.n)}`
                        : shareText(cell.share)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-pretty text-ink-500">
        A cohort under five wallets is shown as a count, not a percentage.
        {anyPartial && " Outlined cells are the current month, still in progress."}
      </p>
    </>
  );
}

function EngagementList({ e, now }: { e: Engagement; now: Date }) {
  const sticky = stickiness(e, now);
  const rows = [
    {
      label: "Daily",
      note: "Average over the last 30 full days",
      value: e.avgDau30d.toFixed(1),
    },
    { label: "Weekly", note: "Last 7 full days", value: fmtInt(e.wau) },
    { label: "Monthly", note: "Last 30 full days", value: fmtInt(e.mau) },
  ];

  return (
    <>
      <dl className="divide-y divide-ink-200/60">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4 py-3.5 first:pt-0">
            <div>
              <dt className="text-sm text-ink-900">{r.label}</dt>
              <dd className="mt-0.5 text-xs text-ink-500">{r.note}</dd>
            </div>
            <dd className="text-2xl font-medium tracking-[-0.02em] text-ink-900">{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-1 border-t border-ink-200/60 pt-4">
        {sticky !== null ? (
          <p className="text-sm text-pretty text-ink-500">
            <strong className="font-medium text-ink-900">{fmtPct(sticky)} stickiness</strong>:
            on an average day, that share of the month&apos;s wallets transacted. Money apps
            used for a monthly transfer run low on this by nature.
          </p>
        ) : (
          <p className="text-sm text-pretty text-ink-500">
            A daily-to-monthly ratio is shown from ten monthly wallets and a month of history.
          </p>
        )}
        <p className="mt-2 text-xs text-ink-500">
          Transfers settled on {fmtInt(e.daysWithActivity)} of the last 30 days.
        </p>
      </div>
    </>
  );
}

/* ---------- money flow ---------- */

/** Short, for the axis under a column. The full range is in the tooltip. */
function sizeTick(i: number, edges: number[]): string {
  if (edges.length === 0) return "";
  if (i <= 0) return `<${edges[0]}`;
  if (i >= edges.length) return `${edges[edges.length - 1]}+`;
  return `${edges[i - 1]}–${edges[i]}`;
}

export function MoneyFlow({ data }: { data: AnalyticsData }) {
  return (
    <Section id="money" title="Money flow" caption={data.period.label}>
      <Load from={data.distribution}>
        {(d) => (
          <div className="grid gap-6 lg:grid-cols-5">
            <Panel
              className="lg:col-span-3"
              title="Transfer size"
              hint="Settled transfers by amount, in US dollars."
            >
              <ColumnChart
                series={[{ label: "Transfers", swatch: "bg-chart-1" }]}
                data={d.histogram.map((h) => ({
                  id: String(h.i),
                  tick: sizeTick(h.i, d.edges),
                  name: sizeBucketLabel(h.i, d.edges),
                  values: [h.count],
                }))}
                format={fmtInt}
                integer
                allTicks
                height="h-52"
                label="Number of settled transfers in each size band"
                emptyText="No settled transfers in this window."
              />
              <TableView
                caption="Transfers by size"
                head={["Size", "Transfers", "Volume"]}
                rows={d.histogram.map((h) => [
                  sizeBucketLabel(h.i, d.edges),
                  fmtInt(h.count),
                  fmtUsd(h.volume),
                ])}
              />
            </Panel>

            <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
              <Panel
                title="Deposits by network"
                hint="Only a deposit can arrive on another network. Sends always leave from Arc."
              >
                {d.networks.length === 0 ? (
                  <Empty>No deposits in this window.</Empty>
                ) : (
                  <BarList
                    rows={d.networks.map((n) => ({
                      label: CHAIN_LABEL[n.chain] ?? n.chain,
                      value: n.volume,
                      display: fmtUsd(n.volume),
                      note: `${fmtInt(n.transfers)} ${n.transfers === 1 ? "deposit" : "deposits"}`,
                    }))}
                  />
                )}
              </Panel>

              <Panel title="Concentration">
                <ConcentrationNote c={d.concentration} />
              </Panel>
            </div>
          </div>
        )}
      </Load>
    </Section>
  );
}

function ConcentrationNote({ c }: { c: Distribution["concentration"] }) {
  const result = concentration(c);

  if (result.kind === "none") {
    return <Empty>Shown once three wallets have moved money in this window.</Empty>;
  }

  return (
    <>
      <p className="text-[2.125rem] leading-none font-medium tracking-[-0.025em] text-ink-900">
        {fmtPct(result.pct)}
      </p>
      <p className="mt-2.5 text-sm text-pretty text-ink-500">
        {result.kind === "largest"
          ? `of volume came from the single largest wallet, out of ${fmtInt(result.wallets)} that moved money. A top-tenth figure is shown from ten wallets.`
          : `of volume came from the top ${fmtInt(result.top)} ${result.top === 1 ? "wallet" : "wallets"}, the largest tenth of the ${fmtInt(result.wallets)} that moved money.`}
      </p>
    </>
  );
}
