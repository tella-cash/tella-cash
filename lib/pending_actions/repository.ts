import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  FlowPendingPayload,
  PendingAction,
  PendingActionKind,
} from "@/lib/supabase/types";

// Mirrors sendam-ai's own FLOW_TOKEN_TTL_MS default (15 min). This row's TTL
// doesn't need to match the token's real expiry exactly — the token itself
// is authoritative and sendam-ai rejects it once truly expired (surfaced as
// a decodeFollowUp() throw, handled in handler.ts); this is just a
// reasonable local bound for "was a flow started recently."
const FLOW_TTL_MINUTES = 15;

/**
 * Multi-turn flow conversation state only (see PendingAction's doc comment
 * in supabase/types.ts). One active conversation per user — upsert on
 * user_id is correct here, unlike pending sends.
 */
export async function createPending({
  userId,
  kind,
  payload,
  ttlMinutes = FLOW_TTL_MINUTES,
}: {
  userId: string;
  kind: PendingActionKind;
  payload: FlowPendingPayload;
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

export function createPendingFlow({
  userId,
  flow,
  token,
  failures,
}: {
  userId: string;
  flow: string;
  token: string;
  failures?: number;
}): Promise<PendingAction> {
  return createPending({
    userId,
    kind: "flow",
    payload: { flow, token, ...(failures ? { failures } : {}) },
  });
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
