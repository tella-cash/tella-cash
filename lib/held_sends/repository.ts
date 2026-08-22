import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { HeldSend, HeldSendState, SendPayload } from "@/lib/supabase/types";
import { HOLD_HOURS } from "@/lib/sends/tiers";

/**
 * Held sends: authorized, embargoed, executed later.
 *
 * Separate from tella_pending_send on purpose — see
 * migrations/0015_held_sends.sql for why extending that table's 5-minute TTL
 * would have been a mistake.
 */

export async function createHeldSend({
  userId,
  payload,
}: {
  userId: string;
  payload: SendPayload;
}): Promise<HeldSend> {
  const supabase = getSupabaseAdmin();
  const releaseAt = new Date(Date.now() + HOLD_HOURS * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("tella_held_send")
    .insert({ user_id: userId, payload, release_at: releaseAt })
    .select()
    .single();

  if (error) throw new Error(`createHeldSend failed: ${error.message}`);
  return data as HeldSend;
}

/**
 * Take ownership of one due hold, atomically.
 *
 * Same conditional-update shape as claimPendingSend, and load-bearing for the
 * same reason: two overlapping cron invocations must not both execute the
 * same transfer. Postgres serialises the competing updates, so exactly one
 * sees state = 'holding' and wins.
 */
export async function claimHeldSend(id: string): Promise<HeldSend | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("tella_held_send")
    .update({ state: "executing" })
    .eq("id", id)
    .eq("state", "holding")
    .select()
    .maybeSingle();

  if (error) throw new Error(`claimHeldSend failed: ${error.message}`);
  return (data as HeldSend | null) ?? null;
}

/** Holds whose time has come. Ordered oldest first so a backlog drains fairly. */
export async function listDueHeldSends(limit: number): Promise<HeldSend[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("tella_held_send")
    .select("*")
    .eq("state", "holding")
    .lte("release_at", new Date().toISOString())
    .order("release_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`listDueHeldSends failed: ${error.message}`);
  return (data as HeldSend[]) ?? [];
}

/** Everything a user has queued, for "what's waiting" and for cancellation. */
export async function listHoldingForUser(userId: string): Promise<HeldSend[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("tella_held_send")
    .select("*")
    .eq("user_id", userId)
    .eq("state", "holding")
    .order("release_at", { ascending: true });

  if (error) throw new Error(`listHoldingForUser failed: ${error.message}`);
  return (data as HeldSend[]) ?? [];
}

export async function markHeldSendOutcome({
  id,
  state,
  circleTransactionId,
}: {
  id: string;
  state: HeldSendState;
  circleTransactionId?: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("tella_held_send")
    .update({
      state,
      ...(circleTransactionId ? { circle_transaction_id: circleTransactionId } : {}),
    })
    .eq("id", id);

  // Logged, not thrown: this runs after money has already moved, and failing
  // the caller here would turn a bookkeeping problem into a reported failure
  // for a transfer that succeeded. Same policy as markPendingSendOutcome.
  if (error) {
    console.error("[held-send] outcome update failed", { id, state, error: error.message });
  }
}

/**
 * Cancel one hold, atomically and only while it is still holding.
 *
 * Conditional on state so a cancellation racing the release job cannot undo a
 * transfer already in flight. If the job claimed it first, this returns false
 * and the caller tells the user it is already on its way, which is the truth.
 */
export async function cancelHeldSend({
  id,
  cancelledBy,
}: {
  id: string;
  cancelledBy: string;
}): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("tella_held_send")
    .update({
      state: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: cancelledBy,
    })
    .eq("id", id)
    .eq("state", "holding")
    .select("id");

  if (error) throw new Error(`cancelHeldSend failed: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * Cancel every hold a user has queued. Returns how many were stopped.
 *
 * Called by freezeAccount. A freeze that left queued transfers to fire the
 * next day would not be a freeze, and this is the least obvious place that
 * has to be remembered — the holds are invisible in the chat thread by then.
 */
export async function cancelAllHeldSends({
  userId,
  cancelledBy,
}: {
  userId: string;
  cancelledBy: string;
}): Promise<number> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("tella_held_send")
    .update({
      state: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: cancelledBy,
    })
    .eq("user_id", userId)
    .eq("state", "holding")
    .select("id");

  if (error) throw new Error(`cancelAllHeldSends failed: ${error.message}`);
  return (data ?? []).length;
}

/**
 * USDC this user has queued but not yet sent.
 *
 * The reserved-amount problem. sumSentUsdcSince counts tella_transactions
 * rows, and a held send has none until it executes, so without this a hold
 * consumes no daily allowance and no balance. Two large holds could each pass
 * their own check at authorization time and then both fail a day later with
 * "insufficient balance" — fail-closed, but a baffling outcome to receive
 * twenty-four hours after the fact.
 *
 * Counts 'executing' as well as 'holding': a row mid-flight has not produced
 * a transaction row yet either, and treating it as free money for the seconds
 * it is in flight is exactly the gap a burst would find.
 */
export async function sumHeldUsdc(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("tella_held_send")
    .select("payload")
    .eq("user_id", userId)
    .in("state", ["holding", "executing"]);

  if (error) throw new Error(`sumHeldUsdc failed: ${error.message}`);

  return ((data ?? []) as { payload: SendPayload }[]).reduce((sum, row) => {
    const n = Number.parseFloat(row.payload?.amount ?? "0");
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}
