/**
 * Loader tests. Runner-free — run with `pnpm test`. Exits non-zero on any
 * failure.
 *
 * The loader is run against a fake `rpc`, so these cover what the page does
 * when the database misbehaves: a function missing because the migration has
 * not been applied, one slow section, a shape nobody expected. None of those
 * should blank the page or invent a number.
 */

import {
  classifyRpcError,
  loadAnalytics,
  parseDistribution,
  parseOps,
  parseSeries,
  parseSummary,
  type RpcFn,
} from "./queries";

const NOW = new Date("2026-10-09T12:00:00.000Z");

const SUMMARY = {
  version: 1,
  users: { total: 6, new: 2, onboarded: 5, with_wallet: 5 },
  actives: { total: 3, senders: 1, receive_only: 2, new: 1, returning: 2 },
  // numeric comes over the wire as a string
  volume: {
    deposits: "52.50",
    p2p: "6",
    withdrawals: 0,
    total: "58.50",
    net_flow: "52.50",
    raw_sent: "6",
    raw_received: "58.50",
  },
  transfers: { total: 3, deposits: 2, p2p: 1, withdrawals: 0, avg: "19.5", median: null },
  meta: { users_first_at: "2026-07-01T00:00:00+00:00", ledger_first_at: null, excluded_users: 1 },
};

const OK: Record<string, unknown> = {
  tella_analytics_summary: SUMMARY,
  tella_analytics_series: [
    { grain: "week", bucket: "2026-09-28", new_users: 1, cumulative_users: 4, active_wallets: 2,
      new_actives: 1, returning_actives: 1, transfers: 2, deposits: "10", p2p: "5.5", withdrawals: "0",
      is_partial: false },
    { grain: "week", bucket: "2026-10-05", new_users: 2, cumulative_users: 6, active_wallets: 3,
      new_actives: 1, returning_actives: 2, transfers: 3, deposits: "52.5", p2p: "6", withdrawals: "0",
      is_partial: true },
  ],
  tella_analytics_funnel: { signed_up: 6, onboarded: 5, wallet_active: 5, received: 4, sent: 3,
    sent_repeat: 1, any_sent: 4, sent_without_receiving: 1, median_seconds_to_first_tx: 3600,
    first_tx_n: 5 },
  tella_analytics_retention: [
    { cohort_month: "2026-09-01", cohort_size: 3, month_offset: 0, active: 3, is_partial: false },
  ],
  tella_analytics_engagement: { as_of_day: "2026-10-08", dau_yesterday: 1, dau_today: 0, wau: 3,
    mau: 4, avg_dau_30d: "0.2667", days_with_activity: 7, ledger_first_at: null },
  tella_analytics_distribution: { concentration: { n: 5, k: 1, total: "248.5", top_k: "170", top1: "170" },
    edges: [1, 5], histogram: [{ i: 0, count: 0, volume: 0 }], channels: [], networks: [] },
  tella_analytics_ops: { stuck_submitted: { count: 2, amount: "18", oldest_at: null },
    held: { count: 1, amount: "42.00", next_release_at: null, overdue: 0 }, held_unresolved: 0,
    frozen: 0, excluded_users: 1,
    quality: { rejected: { unsettled: { count: 2, amount: "18" } },
      orphan_internal_receipts: { count: 1, amount: "8" }, no_hash: { count: 0, amount: 0 } } },
  tella_admin_security_posture: [
    { with_pin: 4, with_passkey: 2, with_google: 1, with_panic_code: 0, no_factor: 1, frozen: 0 },
  ],
};

/** A fake database. `fail` maps a function name to the error it returns. */
function fakeRpc(
  fail: Record<string, { code?: string; message: string }> = {},
  calls: { name: string; args?: Record<string, unknown> }[] = [],
): RpcFn {
  return async (name, args) => {
    calls.push({ name, args });
    if (fail[name]) return { data: null, error: fail[name] };
    return { data: OK[name] ?? null, error: null };
  };
}

const MISSING = { code: "PGRST202", message: "Could not find the function" };
const ALL_MISSING = Object.fromEntries(
  Object.keys(OK)
    .filter((k) => k.startsWith("tella_analytics_"))
    .map((k) => [k, MISSING]),
);

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (actual === expected) passed++;
  else failures.push(`  ✗ ${name}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

async function main() {
  // The loader logs each real failure, which is noise here.
  const realError = console.error;
  console.error = () => {};

  /* ---------- classifying failures ---------- */

  check("a function PostgREST cannot find is the migration", classifyRpcError(MISSING), "migration");
  check("two functions with one name is the migration", classifyRpcError({ code: "PGRST203", message: "" }), "migration");
  check("an undefined function is the migration", classifyRpcError({ code: "42883", message: "" }), "migration");
  check("a missing table is the migration", classifyRpcError({ code: "42P01", message: "" }), "migration");
  check("a refused function is a permission problem", classifyRpcError({ code: "42501", message: "" }), "permission");
  check("a cancelled statement is a timeout", classifyRpcError({ code: "57014", message: "" }), "timeout");
  check("an aborted request is a timeout", classifyRpcError({ message: "The operation was aborted due to timeout" }), "timeout");
  check("anything else is just an error", classifyRpcError({ code: "XX000", message: "boom" }), "error");

  /* ---------- parsing ---------- */

  const s = parseSummary(SUMMARY);
  check("numeric strings become numbers", s.volume.total, 58.5);
  check("a null median stays null, not zero", s.transfers.median, null);
  check("an average is read", s.transfers.avg, 19.5);
  check("snake case becomes camel case", s.actives.receiveOnly, 2);
  check("garbage parses to zeros, never throws", parseSummary("nope").users.total, 0);
  check("a null payload parses to zeros", parseSummary(null).volume.total, 0);
  check("a summary wrapped in a row is unwrapped", parseSummary([SUMMARY]).users.total, 6);

  const series = parseSeries(OK.tella_analytics_series);
  check("the series reports the grain it was given", series.grain, "week");
  check("volume is the three flows added", series.points[0].volume, 15.5);
  check("only the last bucket is partial", series.points.map((p) => p.isPartial).join(), "false,true");
  check("an empty series is week by default", parseSeries([]).grain, "week");
  check("a non-array series is empty", parseSeries({}).points.length, 0);

  check("ops rejects are keyed by reason", parseOps(OK.tella_analytics_ops).quality.rejected.unsettled.amount, 18);
  check("ops with nothing in it is zeros", parseOps({}).stuck.count, 0);
  check("a distribution keeps its edges", parseDistribution(OK.tella_analytics_distribution).edges.join(), "1,5");
  check("a distribution with nothing in it is empty", parseDistribution(null).histogram.length, 0);

  /* ---------- everything works ---------- */

  const calls: { name: string; args?: Record<string, unknown> }[] = [];
  const good = await loadAnalytics({ period: "week", now: NOW, rpc: fakeRpc({}, calls) });
  check("every section loads", [good.summary, good.series, good.funnel, good.retention, good.engagement,
    good.distribution, good.ops, good.security].every((x) => x.status === "ok"), true);
  check("the migration is not reported missing", good.migrationMissing, false);
  check("a windowed period asks for the summary twice", calls.filter((c) => c.name === "tella_analytics_summary").length, 2);
  check("the current window ends now", calls.find((c) => c.name === "tella_analytics_summary")?.args?.p_to, NOW.toISOString());
  check("the series is asked for in Lagos time", calls.find((c) => c.name === "tella_analytics_series")?.args?.p_tz, "Africa/Lagos");
  check("the series is asked for the period's grain", calls.find((c) => c.name === "tella_analytics_series")?.args?.p_grain, "week");
  check("the previous summary is attached", good.summary.status === "ok" && good.summary.data.previous !== null, true);
  check("the page is stamped with the time it was built for", good.generatedAt, NOW.toISOString());

  const allCalls: { name: string; args?: Record<string, unknown> }[] = [];
  const all = await loadAnalytics({ period: "all", now: NOW, rpc: fakeRpc({}, allCalls) });
  check("all time asks for the summary once", allCalls.filter((c) => c.name === "tella_analytics_summary").length, 1);
  check("all time starts at the beginning", allCalls[0].args?.p_from, null);
  check("all time has no previous summary", all.summary.status === "ok" && all.summary.data.previous, null);
  check("all time lets the database pick the grain", allCalls.find((c) => c.name === "tella_analytics_series")?.args?.p_grain, "auto");

  /* ---------- the migration has not been applied ---------- */

  const unapplied = await loadAnalytics({ period: "all", now: NOW, rpc: fakeRpc(ALL_MISSING) });
  check("a missing migration is reported once, for the page", unapplied.migrationMissing, true);
  check("its sections are unavailable, not zero", unapplied.summary.status, "unavailable");
  check("the reason is the migration", unapplied.summary.status === "unavailable" && unapplied.summary.reason, "migration");
  check("what 0020 already provides still loads", unapplied.security.status, "ok");

  /* ---------- one section fails ---------- */

  const slow = await loadAnalytics({
    period: "week",
    now: NOW,
    rpc: fakeRpc({ tella_analytics_retention: { code: "57014", message: "canceling statement" } }),
  });
  check("the failed section says why", slow.retention.status === "unavailable" && slow.retention.reason, "timeout");
  check("the others are untouched", slow.summary.status === "ok" && slow.funnel.status === "ok", true);
  check("one failure is not a missing migration", slow.migrationMissing, false);

  /* ---------- the comparison fails but the figures do not ---------- */

  let n = 0;
  const flaky: RpcFn = async (name, args) => {
    if (name === "tella_analytics_summary" && ++n === 2) {
      return { data: null, error: { code: "XX000", message: "boom" } };
    }
    return fakeRpc()(name, args);
  };
  const half = await loadAnalytics({ period: "week", now: NOW, rpc: flaky });
  check("the current figures still show", half.summary.status, "ok");
  check("they show without a comparison", half.summary.status === "ok" && half.summary.data.previous, null);

  /* ---------- the request itself throws ---------- */

  const thrown = await loadAnalytics({
    period: "all",
    now: NOW,
    rpc: async () => ({ data: null, error: { message: "fetch failed" } }),
  });
  check("a dead database is every section unavailable", thrown.summary.status, "unavailable");
  check("a dead database is not mistaken for a missing migration", thrown.migrationMissing, false);

  console.error = realError;

  const total = passed + failures.length;
  console.log(`analytics queries: ${passed}/${total} passed`);
  if (failures.length) {
    console.error("\nFailures:\n" + failures.join("\n"));
    process.exit(1);
  }
}

main();
