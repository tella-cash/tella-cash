import type { DashboardData, DayPoint, FunnelStage } from "@/lib/analytics/queries";

/**
 * The dashboard, rendered server-side as plain HTML and SVG.
 *
 * No charting library. Two chart forms, both simple enough that a dependency
 * would cost more than it saves — and a bundle that never ships is a bundle
 * that cannot leak the numbers it draws.
 *
 * Colour does one job here and it is identity: received versus sent. Those
 * two hues are validated for colour-vision deficiency separation and for
 * contrast against both surfaces, and they are also direct-labelled in the
 * legend and the tooltips, so identity is never carried by colour alone.
 * Text stays on ink tokens throughout — a value never wears its series
 * colour.
 */

/* Validated categorical slots 1 and 2, light and dark. */
const SERIES = {
  received: { light: "#2a78d6", dark: "#3987e5", label: "Received" },
  sent: { light: "#eb6834", dark: "#d95926", label: "Sent" },
};

export function Dashboard({
  data,
  email,
}: {
  data: DashboardData;
  email: string;
}) {
  const { headline, funnel, daily, channels, security } = data;

  return (
    <div className="min-h-screen bg-surface-50 px-5 py-10 sm:px-8">
      <style>{`
        .viz { --s-received: ${SERIES.received.light}; --s-sent: ${SERIES.sent.light}; }
        @media (prefers-color-scheme: dark) {
          :root:not([data-theme="light"]) .viz {
            --s-received: ${SERIES.received.dark}; --s-sent: ${SERIES.sent.dark};
          }
        }
        :root[data-theme="dark"] .viz {
          --s-received: ${SERIES.received.dark}; --s-sent: ${SERIES.sent.dark};
        }
      `}</style>

      <div className="viz mx-auto flex max-w-5xl flex-col gap-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink-400">
              Internal dashboard
            </div>
            <h1 className="mt-2 font-display text-3xl text-ink-900">tella</h1>
          </div>
          <div className="text-right text-xs text-ink-400">
            <div>{email}</div>
            <div className="mt-0.5">
              {new Date(data.generatedAt).toLocaleString("en-NG", {
                timeZone: "Africa/Lagos",
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </div>
          </div>
        </header>

        {/* Stated once, at the top, rather than annotated on every figure.
            The behaviour below is real; the money is not, and a reader should
            not have to infer that from context. */}
        <p className="rounded-2xl border border-ink-200/70 bg-surface-0 px-4 py-3 text-sm text-ink-500">
          All amounts are <strong className="text-ink-900">ARC testnet USDC</strong>.
          Transaction counts and user behaviour are real; the balances are not.
        </p>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Users" value={headline.users} sub={`+${headline.newThisWeek} this week`} />
          <Stat label="Wallets active" value={headline.withWallet} sub={pct(headline.withWallet, headline.users)} />
          <Stat label="Have sent" value={headline.sendersAllTime} sub={`${headline.repeatSenders} more than once`} />
          <Stat label="Sends" value={headline.txCount} sub={`${fmt(headline.volumeUsdc)} USDC`} />
        </section>

        <Card title="Activity" subtitle="Last 30 days, by day">
          <DailyChart daily={daily} />
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Activation" subtitle="Each step as a share of the one above">
            <Funnel stages={funnel} />
          </Card>

          <div className="flex flex-col gap-6">
            <Card title="Channels" subtitle="Verified, by provider">
              <Bars
                rows={channels.map((c) => ({ label: c.provider, value: c.users }))}
                total={Math.max(1, ...channels.map((c) => c.users))}
              />
            </Card>

            <Card title="Security" subtitle="Recovery depends on these">
              <Bars
                rows={[
                  { label: "PIN", value: security.withPin },
                  { label: "Passkey", value: security.withPasskey },
                  { label: "Google", value: security.withGoogle },
                  { label: "Panic code", value: security.withPanicCode },
                ]}
                total={Math.max(1, headline.users)}
              />
              {security.noFactor > 0 && (
                <p className="mt-4 border-t border-ink-200/70 pt-3 text-sm text-ink-500">
                  <strong className="text-ink-900">{security.noFactor}</strong> accounts
                  have no PIN or passkey. Every recovery rule asks for a factor
                  enrolled before the trouble started, so those accounts cannot
                  be recovered if they are ever frozen or compromised.
                </p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-ink-200/70 bg-surface-0 px-4 py-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-400">
        {label}
      </div>
      <div className="mt-2 font-display text-3xl tabular-nums text-ink-900">
        {fmt(value)}
      </div>
      {sub && <div className="mt-1 text-xs text-ink-500">{sub}</div>}
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-ink-200/70 bg-surface-0 px-5 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg text-ink-900">{title}</h2>
        {subtitle && <span className="text-xs text-ink-400">{subtitle}</span>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Grouped bars, two series, one y-axis.
 *
 * Grouped rather than stacked because the question is "how do sends compare
 * to receives", which a stack makes harder — only the bottom segment starts
 * from a common baseline. Empty days are drawn as gaps rather than skipped,
 * so a quiet week reads as a quiet week instead of compressing the axis.
 */
function DailyChart({ daily }: { daily: DayPoint[] }) {
  const max = Math.max(1, ...daily.map((d) => Math.max(d.received, d.sent)));
  const W = 720;
  const H = 200;
  const PAD_B = 22;
  const slot = W / Math.max(1, daily.length);
  const barW = Math.max(2, Math.min(9, slot / 2 - 1.5));

  const y = (v: number) => (H - PAD_B) * (1 - v / max);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-ink-500">
        <Key color="var(--s-received)" label={`${SERIES.received.label} (${sum(daily, "received")})`} />
        <Key color="var(--s-sent)" label={`${SERIES.sent.label} (${sum(daily, "sent")})`} />
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[200px] w-full min-w-[560px]"
          role="img"
          aria-label={`Daily transactions over the last ${daily.length} days`}
        >
          {/* Recessive gridlines: present enough to read a value against,
              quiet enough not to compete with the bars. */}
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line
              key={f}
              x1="0"
              x2={W}
              y1={y(max * f)}
              y2={y(max * f)}
              className="stroke-ink-200"
              strokeWidth="1"
            />
          ))}
          <line x1="0" x2={W} y1={H - PAD_B} y2={H - PAD_B} className="stroke-ink-300" strokeWidth="1" />

          {daily.map((d, i) => {
            const x = i * slot + slot / 2;
            return (
              <g key={d.day}>
                <title>
                  {d.day}: {d.received} received ({fmt(d.receivedUsdc)} USDC), {d.sent} sent (
                  {fmt(d.sentUsdc)} USDC)
                </title>
                {/* Full-height hit area so a 2px bar is still hoverable. */}
                <rect x={i * slot} y={0} width={slot} height={H - PAD_B} fill="transparent" />
                {d.received > 0 && (
                  <rect
                    x={x - barW - 1}
                    y={y(d.received)}
                    width={barW}
                    height={H - PAD_B - y(d.received)}
                    rx="2"
                    fill="var(--s-received)"
                  />
                )}
                {d.sent > 0 && (
                  <rect
                    x={x + 1}
                    y={y(d.sent)}
                    width={barW}
                    height={H - PAD_B - y(d.sent)}
                    rx="2"
                    fill="var(--s-sent)"
                  />
                )}
              </g>
            );
          })}

          {/* First and last only. A label on every day is unreadable at this
              width and adds nothing — the tooltip carries the detail. */}
          {daily.length > 0 && (
            <>
              <text x="0" y={H - 6} className="fill-ink-400" fontSize="11">
                {shortDay(daily[0].day)}
              </text>
              <text x={W} y={H - 6} textAnchor="end" className="fill-ink-400" fontSize="11">
                {shortDay(daily[daily.length - 1].day)}
              </text>
            </>
          )}
        </svg>
      </div>
    </div>
  );
}

/**
 * Ordinal bars, darkest at the top.
 *
 * The percentage shown is of the PREVIOUS stage, not of the top: drop-off
 * between consecutive steps is the number that tells you where to work, and
 * share-of-total flatters the early steps while hiding the cliff.
 */
function Funnel({ stages }: { stages: FunnelStage[] }) {
  const top = Math.max(1, stages[0]?.count ?? 1);
  // Ordinal ramp, no lighter than step 250 so the last stage still clears
  // contrast against the surface.
  const shades = ["#184f95", "#256abf", "#2a78d6", "#5598e7", "#86b6ef"];

  return (
    <ol className="flex flex-col gap-2.5">
      {stages.map((s, i) => (
        <li key={s.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-ink-900">{s.label}</span>
            <span className="tabular-nums text-ink-500">
              {fmt(s.count)}
              {i > 0 && (
                <span className="ml-2 text-ink-400">{Math.round(s.ofPrevious * 100)}%</span>
              )}
            </span>
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-surface-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(1.5, (s.count / top) * 100)}%`,
                background: shades[Math.min(i, shades.length - 1)],
              }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Bars({
  rows,
  total,
}: {
  rows: { label: string; value: number }[];
  total: number;
}) {
  return (
    <ol className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="capitalize text-ink-900">{r.label}</span>
            <span className="tabular-nums text-ink-500">{fmt(r.value)}</span>
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-surface-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(1.5, (r.value / Math.max(1, total)) * 100)}%`,
                background: "var(--s-received)",
              }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

function sum(daily: DayPoint[], key: "received" | "sent"): number {
  return daily.reduce((n, d) => n + d[key], 0);
}

function pct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 100)}% of users`;
}

function fmt(n: number): string {
  return n % 1 === 0
    ? n.toLocaleString("en-NG")
    : n.toLocaleString("en-NG", { maximumFractionDigits: 2 });
}

function shortDay(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-NG", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}
