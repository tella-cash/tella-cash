import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Read-only aggregates for the admin dashboard.
 *
 * EVERY FUNCTION HERE IS A SELECT, AND THAT IS A DESIGN CONSTRAINT RATHER
 * THAN A COINCIDENCE. The service-role key can write anything, so nothing at
 * the database layer stops a dashboard route from mutating; the guarantee has
 * to live in the shape of the code. Same argument as the Telegram handler's
 * command allowlist — adding a write here means writing one, deliberately,
 * where a reviewer will see it.
 *
 * Aggregates only, no rows. An investor view wants counts and volumes, and a
 * browsable list of phone numbers is both unnecessary and a much worse thing
 * to leak if the admin cookie ever escapes.
 *
 * Everything is denominated in testnet USDC, because the whole application
 * runs on ARC-TESTNET. The numbers are real user behaviour and unreal money,
 * and the UI says so rather than leaving a reader to assume.
 */

export interface Headline {
  users: number;
  onboarded: number;
  withWallet: number;
  newThisWeek: number;
  sendersAllTime: number;
  repeatSenders: number;
  txCount: number;
  volumeUsdc: number;
}

export interface FunnelStage {
  label: string;
  count: number;
  /** Share of the stage above, not of the top — drop-off is the useful read. */
  ofPrevious: number;
}

export interface DayPoint {
  day: string;
  received: number;
  sent: number;
  receivedUsdc: number;
  sentUsdc: number;
}

export interface ChannelSlice {
  provider: string;
  users: number;
}

export interface SecurityPosture {
  withPin: number;
  withPasskey: number;
  withGoogle: number;
  withPanicCode: number;
  noFactor: number;
  frozen: number;
}

export interface DashboardData {
  headline: Headline;
  funnel: FunnelStage[];
  daily: DayPoint[];
  channels: ChannelSlice[];
  security: SecurityPosture;
  generatedAt: string;
}

/** `numeric` and `bigint` arrive as strings over the wire. */
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

/**
 * One round trip per shape rather than one giant query.
 *
 * A dashboard is read rarely by very few people, so the clarity is worth more
 * than the round trips — and a failure names the section that broke instead
 * of collapsing the whole page.
 */
export async function loadDashboard(): Promise<DashboardData> {
  const supabase = getSupabaseAdmin();

  const [users, transactions, senders, channels, security, daily] =
    await Promise.all([
      supabase.rpc("tella_admin_user_counts"),
      supabase.rpc("tella_admin_transaction_totals"),
      supabase.rpc("tella_admin_sender_counts"),
      supabase.rpc("tella_admin_channel_mix"),
      supabase.rpc("tella_admin_security_posture"),
      supabase.rpc("tella_admin_daily_activity"),
    ]);

  for (const [name, res] of Object.entries({
    users,
    transactions,
    senders,
    channels,
    security,
    daily,
  })) {
    if (res.error) throw new Error(`analytics ${name} failed: ${res.error.message}`);
  }

  const u = (users.data as Record<string, unknown>[])[0] ?? {};
  const t = (transactions.data as Record<string, unknown>[])[0] ?? {};
  const s = (senders.data as Record<string, unknown>[])[0] ?? {};
  const sec = (security.data as Record<string, unknown>[])[0] ?? {};

  const totalUsers = num(u.total);
  const withWallet = num(u.with_wallet);
  const everReceived = num(u.ever_received);
  const everSent = num(s.senders);

  return {
    headline: {
      users: totalUsers,
      onboarded: num(u.onboarded),
      withWallet,
      newThisWeek: num(u.new_7d),
      sendersAllTime: everSent,
      repeatSenders: num(s.repeat_senders),
      txCount: num(t.tx_count),
      volumeUsdc: num(t.volume_usdc),
    },
    // Each stage is a strict subset of the one above, so the ratios are
    // meaningful rather than decorative.
    funnel: buildFunnel([
      ["Signed up", totalUsers],
      ["Wallet active", withWallet],
      ["Received money", everReceived],
      ["Sent money", everSent],
      ["Sent more than once", num(s.repeat_senders)],
    ]),
    daily: ((daily.data as Record<string, unknown>[]) ?? []).map((d) => ({
      day: String(d.day).slice(0, 10),
      received: num(d.received),
      sent: num(d.sent),
      receivedUsdc: num(d.received_usdc),
      sentUsdc: num(d.sent_usdc),
    })),
    channels: ((channels.data as Record<string, unknown>[]) ?? []).map((c) => ({
      provider: String(c.provider),
      users: num(c.users),
    })),
    security: {
      withPin: num(sec.with_pin),
      withPasskey: num(sec.with_passkey),
      withGoogle: num(sec.with_google),
      withPanicCode: num(sec.with_panic_code),
      noFactor: num(sec.no_factor),
      frozen: num(sec.frozen),
    },
    generatedAt: new Date().toISOString(),
  };
}

function buildFunnel(stages: [string, number][]): FunnelStage[] {
  return stages.map(([label, count], i) => ({
    label,
    count,
    ofPrevious: i === 0 || stages[i - 1][1] === 0 ? 1 : count / stages[i - 1][1],
  }));
}
