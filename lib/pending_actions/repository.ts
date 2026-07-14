import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  BeneficiaryPromptPayload,
  PendingAction,
  PendingActionKind,
} from "@/lib/supabase/types";

const BENEFICIARY_TTL_MINUTES = 10;

/**
 * Beneficiary-save conversation state only (see PendingAction's doc
 * comment in supabase/types.ts). One active conversation per user —
 * upsert on user_id is correct here, unlike pending sends.
 */
export async function createPending({
  userId,
  kind,
  payload,
  ttlMinutes = BENEFICIARY_TTL_MINUTES,
}: {
  userId: string;
  kind: PendingActionKind;
  payload: BeneficiaryPromptPayload;
  ttlMinutes?: number;
}): Promise<PendingAction> {
  const supabase = getSupabaseAdmin();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("tella_pending_action")
    .upsert(
      { user_id: userId, kind, payload, expires_at: expiresAt },
      { onConflict: "user_id" },
    )
    .select()
    .single();

  if (error) throw new Error(`createPending failed: ${error.message}`);
  return data as PendingAction;
}

export function createPendingBeneficiaryPrompt({
  userId,
  payload,
}: {
  userId: string;
  payload: BeneficiaryPromptPayload;
}): Promise<PendingAction> {
  return createPending({ userId, kind: "beneficiary_confirm", payload });
}

export async function getActivePending(userId: string): Promise<PendingAction | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_pending_action")
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
    .from("tella_pending_action")
    .delete()
    .eq("id", actionId);
  if (error) throw new Error(`deletePending failed: ${error.message}`);
}
