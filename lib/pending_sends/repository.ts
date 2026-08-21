import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PendingSend, SendPayload } from "@/lib/supabase/types";

const TTL_MINUTES = 5;

/**
 * Plain insert — deliberately NOT an upsert. A user can have multiple
 * pending sends at once; starting a new one must never silently overwrite
 * an older one still awaiting confirmation.
 */
export async function createPendingSend({
  userId,
  payload,
}: {
  userId: string;
  payload: SendPayload;
}): Promise<PendingSend> {
  const supabase = getSupabaseAdmin();
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("tella_pending_send")
    .insert({ user_id: userId, payload, expires_at: expiresAt })
    .select()
    .single();

  if (error) throw new Error(`createPendingSend failed: ${error.message}`);
  return data as PendingSend;
}

export async function listActivePendingSends(userId: string): Promise<PendingSend[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_pending_send")
    .select("*")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    // A claimed send is in flight, not pending — it must not show up as
    // cancellable, or "cancel" would report dropping a transfer already
    // on its way to Circle.
    .is("claimed_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listActivePendingSends failed: ${error.message}`);
  return (data as PendingSend[]) ?? [];
}

export async function getPendingSendById(id: string): Promise<PendingSend | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_pending_send")
    .select("*")
    .eq("id", id)
    .gt("expires_at", new Date().toISOString())
    .is("claimed_at", null)
    .maybeSingle();

  if (error) throw new Error(`getPendingSendById failed: ${error.message}`);
  return (data as PendingSend | null) ?? null;
}

/**
 * Atomically claim a pending send for execution.
 *
 * The `is("claimed_at", null)` filter is what makes this single-use: two
 * concurrent confirms (chat reply + browser tap, or two tabs) both issue the
 * UPDATE, Postgres serialises them, and only the first finds a null to
 * overwrite. The loser gets no row back and bails without sending.
 *
 * Returns the claimed row, or null if someone else already had it.
 */
export async function claimPendingSend(id: string): Promise<PendingSend | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_pending_send")
    .update({ claimed_at: new Date().toISOString() })
    .eq("id", id)
    .is("claimed_at", null)
    .select()
    .maybeSingle();

  if (error) throw new Error(`claimPendingSend failed: ${error.message}`);
  return (data as PendingSend | null) ?? null;
}

/**
 * Record how a claimed send turned out. 'unknown' is the important one —
 * it marks a transfer that may or may not have gone through, so the row
 * survives for reconciliation instead of being silently dropped.
 */
export async function markPendingSendOutcome(
  id: string,
  outcome: "sent" | "failed" | "unknown",
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("tella_pending_send")
    .update({ outcome })
    .eq("id", id);

  if (error) {
    // Never let bookkeeping break the send path — the transfer has already
    // happened by the time this runs.
    console.error("[pending-send] outcome mark failed", { id, outcome, error });
  }
}

export async function deletePendingSend(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("tella_pending_send").delete().eq("id", id);
  if (error) throw new Error(`deletePendingSend failed: ${error.message}`);
}
