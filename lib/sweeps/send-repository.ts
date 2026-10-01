import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SendPayload, SweepSendState, tellaSweep, tellaSweepSend } from "@/lib/supabase/types";
import type { QuoteSnapshot } from "./snapshot";

/**
 * tella_sweep_send: confirmed sends waiting for the sweep that funds them.
 * See migrations/0031_sweep_sends.sql. Every state change is a
 * compare-and-set, for the reason repository.ts gives for sweeps.
 */

export async function createSweepSend(args: {
  userId: string;
  payload: SendPayload;
  quote: QuoteSnapshot;
}): Promise<tellaSweepSend> {
  const { data, error } = await getSupabaseAdmin()
    .from("tella_sweep_send")
    .insert({ user_id: args.userId, payload: args.payload, quote: args.quote })
    .select()
    .single();
  if (error) throw new Error(`createSweepSend failed: ${error.message}`);
  return data as tellaSweepSend;
}

export async function getSweepSend(id: string): Promise<tellaSweepSend | null> {
  const { data, error } = await getSupabaseAdmin().from("tella_sweep_send").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getSweepSend failed: ${error.message}`);
  return (data as tellaSweepSend | null) ?? null;
}

/** Oldest first, so a backlog drains fairly. */
export async function listSweepingSends(limit: number): Promise<tellaSweepSend[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("tella_sweep_send")
    .select("*")
    .eq("state", "sweeping")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`listSweepingSends failed: ${error.message}`);
  return (data as tellaSweepSend[]) ?? [];
}

export async function listSweepingForUser(userId: string): Promise<tellaSweepSend[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("tella_sweep_send")
    .select("*")
    .eq("user_id", userId)
    .eq("state", "sweeping");
  if (error) throw new Error(`listSweepingForUser failed: ${error.message}`);
  return (data as tellaSweepSend[]) ?? [];
}

export async function listSweepsForSend(sweepSendId: string): Promise<tellaSweep[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("tella_sweeps")
    .select("*")
    .eq("sweep_send_id", sweepSendId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listSweepsForSend failed: ${error.message}`);
  return (data as tellaSweep[]) ?? [];
}

/**
 * Move a parked send between states, only if it is still in `from`. Returns
 * the row, or null if someone else moved it first. Claiming it for execution
 * is `transitionSweepSend(id, "sweeping", "executing")`: exactly one caller
 * gets the row back, which is what stops two settle runs both sending.
 */
export async function transitionSweepSend(
  id: string,
  from: SweepSendState,
  to: SweepSendState,
  patch: { detail?: string; circleTransactionId?: string } = {},
): Promise<tellaSweepSend | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("tella_sweep_send")
    .update({
      state: to,
      updated_at: new Date().toISOString(),
      ...(patch.detail !== undefined ? { detail: patch.detail } : {}),
      ...(patch.circleTransactionId ? { circle_transaction_id: patch.circleTransactionId } : {}),
    })
    .eq("id", id)
    .eq("state", from)
    .select()
    .maybeSingle();
  if (error) throw new Error(`transitionSweepSend ${from} -> ${to} failed: ${error.message}`);
  return (data as tellaSweepSend | null) ?? null;
}

/**
 * Sum of what the user's parked sends will take from Arc, in micro-USDC:
 * send + tella's fees, from each snapshot. Counted against the user's balance
 * so a second send cannot be quoted against money the first is waiting for.
 */
export async function sumSweepingCommittedMicro(userId: string): Promise<bigint> {
  const rows = await listSweepingForUser(userId);
  let total = BigInt(0);
  for (const r of rows) {
    const q = r.quote as Partial<QuoteSnapshot> | null;
    for (const v of [q?.sendMicro, q?.sendFeeMicro, q?.sweepFeeMicro]) {
      if (typeof v === "string" && /^\d+$/.test(v)) total += BigInt(v);
    }
  }
  return total;
}

/**
 * Cancel every send a user has parked behind a sweep. Returns how many.
 *
 * Only the SEND stops. The sweeps themselves carry on: the USDC is the user's,
 * and a burn already made cannot be recalled, so it still lands on Arc. It
 * just lands without a send waiting for it.
 */
export async function cancelSweepingSendsForUser(userId: string, cancelledBy: string): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from("tella_sweep_send")
    .update({ state: "cancelled", detail: `cancelled by ${cancelledBy}`, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("state", "sweeping")
    .select("id");
  // Table not there yet (code ahead of migration 0031): nothing is parked.
  if (error?.code === "42P01") return 0;
  if (error) throw new Error(`cancelSweepingSendsForUser failed: ${error.message}`);
  return (data ?? []).length;
}
