import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PendingAction, SendPayload } from "@/lib/supabase/types";

const PENDING_TTL_MINUTES = 5;

interface CreatePendingSendArgs {
  userId: string;
  payload: SendPayload;
}
    
export async function createPendingSend({
  userId,
  payload,
}: CreatePendingSendArgs): Promise<PendingAction> {
  const supabase = getSupabaseAdmin();
  const expiresAt = new Date(
    Date.now() + PENDING_TTL_MINUTES * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("upay_pending_action")
    .upsert(
      {
        user_id: userId,
        kind: "send",
        payload,
        expires_at: expiresAt,
      },
      { onConflict: "user_id" },
    )
    .select()
    .single();

  if (error) throw new Error(`createPendingSend failed: ${error.message}`);
  return data as PendingAction;
}

export async function getActivePending(
  userId: string,
): Promise<PendingAction | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("upay_pending_action")
    .select("*")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw new Error(`getActivePending failed: ${error.message}`);
  return (data as PendingAction | null) ?? null;
}

export async function deletePending(actionId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("upay_pending_action")
    .delete()
    .eq("id", actionId);
  if (error) throw new Error(`deletePending failed: ${error.message}`);
}