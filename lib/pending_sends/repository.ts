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
    .maybeSingle();

  if (error) throw new Error(`getPendingSendById failed: ${error.message}`);
  return (data as PendingSend | null) ?? null;
}

export async function deletePendingSend(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("tella_pending_send").delete().eq("id", id);
  if (error) throw new Error(`deletePendingSend failed: ${error.message}`);
}
