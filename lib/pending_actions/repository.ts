import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  BeneficiaryPromptPayload,
  PendingAction,
  PendingActionKind,
  SendPayload,
} from "@/lib/supabase/types";

const SEND_TTL_MINUTES = 5;
const BENEFICIARY_TTL_MINUTES = 10;

interface CreatePendingArgs {
  userId: string;
  kind: PendingActionKind;
  payload: SendPayload | BeneficiaryPromptPayload;
  ttlMinutes: number;
}

/**
 * One active pending row per user (upsert on user_id) — the conversation is
 * linear, so a new pending state always replaces whatever was there before.
 */
export async function createPending({
  userId,
  kind,
  payload,
  ttlMinutes,
}: CreatePendingArgs): Promise<PendingAction> {
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

export function createPendingSend({
  userId,
  payload,
}: {
  userId: string;
  payload: SendPayload;
}): Promise<PendingAction> {
  return createPending({
    userId,
    kind: "send",
    payload,
    ttlMinutes: SEND_TTL_MINUTES,
  });
}

export function createPendingBeneficiaryPrompt({
  userId,
  payload,
}: {
  userId: string;
  payload: BeneficiaryPromptPayload;
}): Promise<PendingAction> {
  return createPending({
    userId,
    kind: "beneficiary_confirm",
    payload,
    ttlMinutes: BENEFICIARY_TTL_MINUTES,
  });
}

export async function getActivePending(
  userId: string,
): Promise<PendingAction | null> {
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
