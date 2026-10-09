import type { AnalyticsData } from "@/lib/analytics/queries";
import type { ChainNetwork } from "@/lib/chains/validate";
import { isMainnet } from "@/lib/wallet/network";
import type { ChainRow } from "./chains-card";
import { Activation, MoneyFlow, Retention } from "./_components/insights";
import { Definitions, Operations } from "./_components/operations";
import { Growth, Overview } from "./_components/overview";
import { TopBar } from "./_components/top-bar";

/**
 * The dashboard, rendered server-side as plain HTML and a little SVG.
 *
 * It reads top to bottom as the questions someone outside the company asks,
 * in the order they ask them: how much money moves, how many people, are
 * they growing, do they get as far as using it, do they come back, and where
 * the volume comes from. Operations is last, for whoever runs the service.
 *
 * One filter, in the bar at the top, scopes every figure it can. The sections
 * it cannot (retention, the current state of operations) say so in their
 * caption, so nobody reads a 30-day figure as a 7-day one.
 */
export function Dashboard({
  data,
  email,
  chains,
  network,
}: {
  data: AnalyticsData;
  email: string;
  chains: ChainRow[] | null;
  network: ChainNetwork;
}) {
  const mainnet = isMainnet();
  const excludedUsers =
    data.summary.status === "ok" ? data.summary.data.current.meta.excludedUsers : null;

  return (
    <div className="min-h-dvh bg-surface-50 font-geist text-ink-900">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-40 focus:rounded-lg focus:bg-surface-0 focus:px-3 focus:py-2 focus:text-sm focus:shadow-card"
      >
        Skip to the figures
      </a>
      <TopBar period={data.period.key} email={email} mainnet={mainnet} />

      <main id="main" className="mx-auto max-w-[80rem] px-5 sm:px-8">
        {/* Stated once, at the top, rather than annotated on every figure. On
            testnet the behaviour is real and the money is not, and a reader
            should not have to infer that from context. */}
        {!mainnet && (
          <p className="mt-6 rounded-2xl bg-surface-100 px-4 py-3 text-sm text-pretty text-ink-500">
            All amounts are <strong className="font-medium text-ink-900">Arc testnet USDC</strong>.
            Transaction counts and user behaviour are real; the balances are not.
          </p>
        )}

        {data.migrationMissing ? (
          <div className="mt-8 rounded-3xl bg-surface-0 p-6 ring-1 ring-ink-200/60 sm:p-8">
            <h1 className="font-display text-3xl text-ink-900">One step before the figures</h1>
            <p className="mt-3 max-w-[62ch] text-pretty text-ink-500">
              The analytics functions aren&apos;t in this database yet. Paste{" "}
              <code className="font-mono text-[0.8125rem] text-ink-900">
                migrations/0033_admin_analytics_v2.sql
              </code>{" "}
              into the Supabase SQL editor and run it, then reload this page. It only adds
              things, so it is safe to run while the app is live.
            </p>
          </div>
        ) : (
          <>
            <h1 className="sr-only">Tella analytics, {data.period.label.toLowerCase()}</h1>
            <Overview data={data} />
            <Growth data={data} />
            <Activation data={data} />
            <Retention data={data} />
            <MoneyFlow data={data} />
          </>
        )}

        <Operations data={data} chains={chains} network={network} />
        <Definitions generatedAt={data.generatedAt} excludedUsers={excludedUsers} />
      </main>
    </div>
  );
}
