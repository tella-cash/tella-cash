import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SweepStatus, tellaSweep } from "@/lib/supabase/types";
import { newAuthNonce } from "./cctp";

/**
 * tella_sweeps, and the one rule about writing to it: a status only ever
 * changes through `transition`, which is a compare-and-set.
 *
 * Two runs of the advance job can look at the same sweep at the same moment
 * (a cron that ran long, a manual trigger). Each does its Circle call under a
 * step-specific idempotency key, so the call itself is safe to repeat; what
 * would not be safe is both then believing they moved the sweep on. The
 * conditional update makes exactly one of them the mover and turns the other's
 * write into a no-op it can recognise.
 */

/** How long the user's signed authorisation stays valid, from creation. */
export const AUTH_VALIDITY_SECONDS = 60 * 60;

export type CreateSweepResult =
  | { ok: true; sweep: tellaSweep }
  // The user already has a sweep on this chain that is not finished (or is
  // stuck). See the partial unique index in migrations/0029_sweeps.sql.
  | { ok: false; reason: "in_flight" };

export async function createSweep(args: {
  userId: string;
  chainId: string;
  address: string;
  amountMicro: bigint;
  maxFeeMicro: bigint;
  finality: 1000 | 2000;
  /** The parked send this leg funds, if any. */
  sweepSendId?: string;
  now?: number;
}): Promise<CreateSweepResult> {
  const validBefore = new Date((args.now ?? Date.now()) + AUTH_VALIDITY_SECONDS * 1000).toISOString();

  const { data, error } = await getSupabaseAdmin()
    .from("tella_sweeps")
    .insert({
      user_id: args.userId,
      chain_id: args.chainId,
      address: args.address,
      amount_micro: args.amountMicro.toString(),
      max_fee_micro: args.maxFeeMicro.toString(),
      finality_threshold: args.finality,
      auth_nonce: newAuthNonce(),
      auth_valid_before: validBefore,
      ...(args.sweepSendId ? { sweep_send_id: args.sweepSendId } : {}),
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, reason: "in_flight" };
    throw new Error(`createSweep failed: ${error.message}`);
  }
  return { ok: true, sweep: data as tellaSweep };
}

export async function getSweep(id: string): Promise<tellaSweep | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("tella_sweeps")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getSweep failed: ${error.message}`);
  return (data as tellaSweep | null) ?? null;
}

/** The user's unfinished sweep on a chain, if there is one. */
export async function findOpenSweep(userId: string, chainId: string): Promise<tellaSweep | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("tella_sweeps")
    .select("*")
    .eq("user_id", userId)
    .eq("chain_id", chainId)
    .not("status", "in", "(delivered,failed)")
    .maybeSingle();
  if (error) throw new Error(`findOpenSweep failed: ${error.message}`);
  return (data as tellaSweep | null) ?? null;
}

/**
 * Sweeps the advance job should look at: everything unfinished EXCEPT stuck.
 * A stuck sweep needs a person, and polling it every few minutes forever would
 * only bury the alert that says so.
 */
export async function listAdvanceableSweeps(limit: number): Promise<tellaSweep[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("tella_sweeps")
    .select("*")
    .not("status", "in", "(delivered,failed,stuck)")
    .order("progressed_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`listAdvanceableSweeps failed: ${error.message}`);
  return (data as tellaSweep[]) ?? [];
}

export type SweepPatch = Partial<
  Pick<
    tellaSweep,
    | "pull_circle_tx_id"
    | "approve_circle_tx_id"
    | "burn_circle_tx_id"
    | "burn_tx_hash"
    | "forward_tx_hash"
    | "detail"
  >
>;

/**
 * Move a sweep from one status to another, only if it is still in `from`.
 * Returns the updated row, or null if someone else moved it first.
 */
export async function transition(
  id: string,
  from: SweepStatus,
  to: SweepStatus,
  patch: SweepPatch = {},
): Promise<tellaSweep | null> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("tella_sweeps")
    .update({ ...patch, status: to, updated_at: now, progressed_at: now })
    .eq("id", id)
    .eq("status", from)
    .select()
    .maybeSingle();
  if (error) throw new Error(`transition ${from} -> ${to} failed: ${error.message}`);
  return (data as tellaSweep | null) ?? null;
}
