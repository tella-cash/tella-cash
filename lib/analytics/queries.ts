import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { invariantFailures } from "./derive";
import { ANALYTICS_TZ, type Grain, type Period, type ResolvedPeriod, resolvePeriod } from "./period";

/**
 * Read-only aggregates for the admin dashboard.
 *
 * EVERY CALL HERE IS A SELECT, AND THAT IS A DESIGN CONSTRAINT RATHER THAN A
 * COINCIDENCE. The service-role key can write anything, so nothing at the
 * database layer stops a dashboard route from mutating; the guarantee has to
 * live in the shape of the code. Same argument as the Telegram handler's
 * command allowlist — adding a write here means writing one, deliberately,
 * where a reviewer will see it.
 *
 * Aggregates only, no rows. An investor view wants counts and volumes, and a
 * browsable list of phone numbers is both unnecessary and a much worse thing
 * to leak if the admin cookie ever escapes.
 *
 * WHAT A FIGURE MEANS IS DECIDED IN ONE PLACE, AND IT IS NOT HERE. The
 * definitions (settled transfers only, a transfer between two tella users
 * counted once, duplicates removed, test accounts left out) live in
 * migrations/0033_admin_analytics_v2.sql, where every function reads the same
 * cleaned ledger. This module asks for the numbers and reshapes them; it does
 * no arithmetic of its own beyond adding three flows into a total for a
 * chart. Ratios and "is this sample big enough for a percentage" are in
 * derive.ts.
 *
 * Everything is USDC on whichever network ARC_NETWORK names. The ledger has
 * no network column, so a database that has seen both testnet and mainnet
 * would mix them here.
 */

export type UnavailableReason = "migration" | "permission" | "timeout" | "error";

/**
 * Each part of the page loads on its own and fails on its own. One broken
 * function shows a note in its own card instead of taking the page down.
 */
export type Section<T> =
  | { status: "ok"; data: T }
  | { status: "unavailable"; reason: UnavailableReason };

export interface Summary {
  users: { total: number; new: number; onboarded: number; withWallet: number };
  actives: {
    total: number;
    senders: number;
    receiveOnly: number;
    new: number;
    returning: number;
  };
  volume: {
    deposits: number;
    p2p: number;
    withdrawals: number;
    total: number;
    netFlow: number;
    rawSent: number;
    rawReceived: number;
  };
  transfers: {
    total: number;
    deposits: number;
    p2p: number;
    withdrawals: number;
    avg: number | null;
    median: number | null;
  };
  meta: {
    usersFirstAt: string | null;
    ledgerFirstAt: string | null;
    excludedUsers: number;
  };
}

export interface SeriesPoint {
  /** Local date the bucket starts on, YYYY-MM-DD. */
  bucket: string;
  newUsers: number;
  cumulativeUsers: number;
  activeWallets: number;
  newActives: number;
  returningActives: number;
  transfers: number;
  deposits: number;
  p2p: number;
  withdrawals: number;
  volume: number;
  /** The bucket still in progress. Drawn differently, never compared. */
  isPartial: boolean;
}

export interface Series {
  grain: Grain;
  points: SeriesPoint[];
}

export interface Funnel {
  signedUp: number;
  onboarded: number;
  walletActive: number;
  received: number;
  sent: number;
  sentRepeat: number;
  anySent: number;
  sentWithoutReceiving: number;
  medianSecondsToFirstTx: number | null;
  firstTxN: number;
}

export interface RetentionRow {
  cohortMonth: string;
  cohortSize: number;
  monthOffset: number;
  active: number;
  isPartial: boolean;
}

export interface Engagement {
  asOfDay: string | null;
  dauYesterday: number;
  dauToday: number;
  wau: number;
  mau: number;
  avgDau30d: number;
  daysWithActivity: number;
  ledgerFirstAt: string | null;
}

export interface Distribution {
  concentration: { n: number; k: number; total: number; topK: number; top1: number };
  /** Lower edges of the size buckets after the first; bucket 0 is below edges[0]. */
  edges: number[];
  histogram: { i: number; count: number; volume: number }[];
  channels: { channel: string; users: number; newUsers: number; activeWallets: number }[];
  networks: { chain: string; transfers: number; volume: number }[];
}

export interface Ops {
  stuck: { count: number; amount: number; oldestAt: string | null };
  held: { count: number; amount: number; nextReleaseAt: string | null; overdue: number };
  heldUnresolved: number;
  frozen: number;
  excludedUsers: number;
  quality: {
    rejected: Record<string, { count: number; amount: number }>;
    orphanReceipts: { count: number; amount: number };
    noHash: { count: number; amount: number };
  };
}

export interface SecurityPosture {
  withPin: number;
  withPasskey: number;
  withGoogle: number;
  withPanicCode: number;
  noFactor: number;
  frozen: number;
}

export interface AnalyticsData {
  period: ResolvedPeriod;
  summary: Section<{ current: Summary; previous: Summary | null }>;
  series: Section<Series>;
  funnel: Section<Funnel>;
  retention: Section<RetentionRow[]>;
  engagement: Section<Engagement>;
  distribution: Section<Distribution>;
  ops: Section<Ops>;
  security: Section<SecurityPosture>;
  /**
   * True when the 0033 functions are not there at all. The page says so once,
   * at the top, instead of repeating it in every card.
   */
  migrationMissing: boolean;
  generatedAt: string;
}

export interface RpcError {
  code?: string;
  message: string;
}

export type RpcFn = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError | null }>;

/** How long one function may take before its card gives up. */
const RPC_TIMEOUT_MS = 8000;

const supabaseRpc: RpcFn = async (name, args) => {
  try {
    const res = await getSupabaseAdmin()
      .rpc(name, args ?? {})
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
    return { data: res.data, error: res.error };
  } catch (err) {
    return { data: null, error: { message: (err as Error).message ?? "request failed" } };
  }
};

/**
 * Why a function call failed, in terms someone can act on.
 *
 * "migration" covers every way the function can be missing or the wrong
 * shape: PostgREST cannot find it (PGRST202), finds two (PGRST203), or
 * Postgres cannot resolve it or something it reads (42883, 42P01, 42703).
 * All of them are fixed by applying the migration.
 */
export function classifyRpcError(error: RpcError): UnavailableReason {
  const code = error.code ?? "";
  if (["PGRST202", "PGRST203", "42883", "42P01", "42703"].includes(code)) return "migration";
  if (code === "42501") return "permission";
  if (code === "57014" || /abort|timeout|timed out/i.test(error.message)) return "timeout";
  return "error";
}

/* ---------- parsing: nothing here throws ---------- */

type Json = Record<string, unknown>;

/** `numeric` and `bigint` arrive as strings over the wire. */
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function obj(v: unknown): Json {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
}

function rows(v: unknown): Json[] {
  return Array.isArray(v) ? v.map(obj) : [];
}

/** A jsonb-returning function comes back as the object, or wrapped in a row. */
function unwrap(v: unknown): Json {
  return Array.isArray(v) ? obj(v[0]) : obj(v);
}

export function parseSummary(raw: unknown): Summary {
  const j = unwrap(raw);
  const users = obj(j.users);
  const actives = obj(j.actives);
  const volume = obj(j.volume);
  const transfers = obj(j.transfers);
  const meta = obj(j.meta);
  return {
    users: {
      total: num(users.total),
      new: num(users.new),
      onboarded: num(users.onboarded),
      withWallet: num(users.with_wallet),
    },
    actives: {
      total: num(actives.total),
      senders: num(actives.senders),
      receiveOnly: num(actives.receive_only),
      new: num(actives.new),
      returning: num(actives.returning),
    },
    volume: {
      deposits: num(volume.deposits),
      p2p: num(volume.p2p),
      withdrawals: num(volume.withdrawals),
      total: num(volume.total),
      netFlow: num(volume.net_flow),
      rawSent: num(volume.raw_sent),
      rawReceived: num(volume.raw_received),
    },
    transfers: {
      total: num(transfers.total),
      deposits: num(transfers.deposits),
      p2p: num(transfers.p2p),
      withdrawals: num(transfers.withdrawals),
      avg: numOrNull(transfers.avg),
      median: numOrNull(transfers.median),
    },
    meta: {
      usersFirstAt: strOrNull(meta.users_first_at),
      ledgerFirstAt: strOrNull(meta.ledger_first_at),
      excludedUsers: num(meta.excluded_users),
    },
  };
}

export function parseSeries(raw: unknown): Series {
  const list = rows(raw);
  const grain = list[0]?.grain;
  return {
    grain: grain === "day" || grain === "month" ? grain : "week",
    points: list.map((r) => {
      const deposits = num(r.deposits);
      const p2p = num(r.p2p);
      const withdrawals = num(r.withdrawals);
      return {
        bucket: String(r.bucket ?? "").slice(0, 10),
        newUsers: num(r.new_users),
        cumulativeUsers: num(r.cumulative_users),
        activeWallets: num(r.active_wallets),
        newActives: num(r.new_actives),
        returningActives: num(r.returning_actives),
        transfers: num(r.transfers),
        deposits,
        p2p,
        withdrawals,
        volume: deposits + p2p + withdrawals,
        isPartial: r.is_partial === true,
      };
    }),
  };
}

export function parseFunnel(raw: unknown): Funnel {
  const j = unwrap(raw);
  return {
    signedUp: num(j.signed_up),
    onboarded: num(j.onboarded),
    walletActive: num(j.wallet_active),
    received: num(j.received),
    sent: num(j.sent),
    sentRepeat: num(j.sent_repeat),
    anySent: num(j.any_sent),
    sentWithoutReceiving: num(j.sent_without_receiving),
    medianSecondsToFirstTx: numOrNull(j.median_seconds_to_first_tx),
    firstTxN: num(j.first_tx_n),
  };
}

export function parseRetention(raw: unknown): RetentionRow[] {
  return rows(raw).map((r) => ({
    cohortMonth: String(r.cohort_month ?? "").slice(0, 10),
    cohortSize: num(r.cohort_size),
    monthOffset: num(r.month_offset),
    active: num(r.active),
    isPartial: r.is_partial === true,
  }));
}

export function parseEngagement(raw: unknown): Engagement {
  const j = unwrap(raw);
  return {
    asOfDay: strOrNull(j.as_of_day),
    dauYesterday: num(j.dau_yesterday),
    dauToday: num(j.dau_today),
    wau: num(j.wau),
    mau: num(j.mau),
    avgDau30d: num(j.avg_dau_30d),
    daysWithActivity: num(j.days_with_activity),
    ledgerFirstAt: strOrNull(j.ledger_first_at),
  };
}

export function parseDistribution(raw: unknown): Distribution {
  const j = unwrap(raw);
  const c = obj(j.concentration);
  return {
    concentration: {
      n: num(c.n),
      k: num(c.k),
      total: num(c.total),
      topK: num(c.top_k),
      top1: num(c.top1),
    },
    edges: Array.isArray(j.edges) ? j.edges.map(num) : [],
    histogram: rows(j.histogram).map((h) => ({
      i: num(h.i),
      count: num(h.count),
      volume: num(h.volume),
    })),
    channels: rows(j.channels).map((ch) => ({
      channel: String(ch.channel ?? ""),
      users: num(ch.users),
      newUsers: num(ch.new_users),
      activeWallets: num(ch.active_wallets),
    })),
    networks: rows(j.networks).map((n) => ({
      chain: String(n.chain ?? ""),
      transfers: num(n.transfers),
      volume: num(n.volume),
    })),
  };
}

export function parseOps(raw: unknown): Ops {
  const j = unwrap(raw);
  const stuck = obj(j.stuck_submitted);
  const held = obj(j.held);
  const quality = obj(j.quality);
  const pair = (v: unknown) => ({ count: num(obj(v).count), amount: num(obj(v).amount) });
  return {
    stuck: {
      count: num(stuck.count),
      amount: num(stuck.amount),
      oldestAt: strOrNull(stuck.oldest_at),
    },
    held: {
      count: num(held.count),
      amount: num(held.amount),
      nextReleaseAt: strOrNull(held.next_release_at),
      overdue: num(held.overdue),
    },
    heldUnresolved: num(j.held_unresolved),
    frozen: num(j.frozen),
    excludedUsers: num(j.excluded_users),
    quality: {
      rejected: Object.fromEntries(
        Object.entries(obj(quality.rejected)).map(([reason, v]) => [reason, pair(v)]),
      ),
      orphanReceipts: pair(quality.orphan_internal_receipts),
      noHash: pair(quality.no_hash),
    },
  };
}

export function parseSecurity(raw: unknown): SecurityPosture {
  const j = unwrap(raw);
  return {
    withPin: num(j.with_pin),
    withPasskey: num(j.with_passkey),
    withGoogle: num(j.with_google),
    withPanicCode: num(j.with_panic_code),
    noFactor: num(j.no_factor),
    frozen: num(j.frozen),
  };
}

/* ---------- loading ---------- */

async function section<T>(
  rpc: RpcFn,
  name: string,
  args: Record<string, unknown> | undefined,
  parse: (raw: unknown) => T,
): Promise<Section<T>> {
  const { data, error } = await rpc(name, args);
  if (error) {
    const reason = classifyRpcError(error);
    // A missing migration is reported once, by the page. Anything else is
    // worth a line in the logs with the function's name on it.
    if (reason !== "migration") console.error(`[admin] ${name} failed`, error);
    return { status: "unavailable", reason };
  }
  try {
    return { status: "ok", data: parse(data) };
  } catch (err) {
    console.error(`[admin] ${name} returned an unreadable shape`, err);
    return { status: "unavailable", reason: "error" };
  }
}

/**
 * One round trip per section, all at once.
 *
 * A dashboard is read rarely by very few people, so the clarity is worth
 * more than the round trips — and a failure names the section that broke
 * instead of collapsing the whole page.
 *
 * `rpc` and `now` are parameters so the tests can run this with neither a
 * database nor a clock.
 */
export async function loadAnalytics(opts: {
  period: Period;
  now?: Date;
  rpc?: RpcFn;
}): Promise<AnalyticsData> {
  const rpc = opts.rpc ?? supabaseRpc;
  const now = opts.now ?? new Date();
  const period = resolvePeriod(opts.period, now);
  const { current, previous } = period;
  const range = { p_from: current.from, p_to: current.to };

  const [cur, prev, series, funnel, retention, engagement, distribution, ops, security] =
    await Promise.all([
      section(rpc, "tella_analytics_summary", range, parseSummary),
      previous
        ? section(
            rpc,
            "tella_analytics_summary",
            { p_from: previous.from, p_to: previous.to },
            parseSummary,
          )
        : Promise.resolve(null),
      section(
        rpc,
        "tella_analytics_series",
        { p_grain: period.grain, p_buckets: period.buckets, p_tz: ANALYTICS_TZ },
        parseSeries,
      ),
      section(rpc, "tella_analytics_funnel", range, parseFunnel),
      section(
        rpc,
        "tella_analytics_retention",
        { p_months: 12, p_tz: ANALYTICS_TZ },
        parseRetention,
      ),
      section(rpc, "tella_analytics_engagement", { p_tz: ANALYTICS_TZ }, parseEngagement),
      section(rpc, "tella_analytics_distribution", range, parseDistribution),
      section(rpc, "tella_analytics_ops", undefined, parseOps),
      // From 0020, unchanged, and present on every database this has run on.
      section(rpc, "tella_admin_security_posture", undefined, parseSecurity),
    ]);

  const summary: AnalyticsData["summary"] =
    cur.status === "ok"
      ? {
          status: "ok",
          data: {
            current: cur.data,
            // The comparison failing is not a reason to hide the figures it
            // would have been compared with. They render without a delta.
            previous: prev && prev.status === "ok" ? prev.data : null,
          },
        }
      : cur;

  // If the parts stop adding up to the whole, a definition has drifted
  // between the migration and this page. Nothing a reader can act on, so it
  // goes to the logs.
  if (cur.status === "ok") {
    const drift = invariantFailures(cur.data);
    if (drift.length) console.error("[admin] summary does not add up", drift);
  }

  const analytics = [cur, series, funnel, retention, engagement, distribution, ops];

  return {
    period,
    summary,
    series,
    funnel,
    retention,
    engagement,
    distribution,
    ops,
    security,
    migrationMissing: analytics.every(
      (s) => s.status === "unavailable" && s.reason === "migration",
    ),
    generatedAt: now.toISOString(),
  };
}
