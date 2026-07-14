import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PendingAction, SendPayload, tellaUser } from "@/lib/supabase/types";

export interface ConfirmContext {
  user: tellaUser;
  /** Narrowed to a send pending — the confirm page only ever handles sends. */
  pending: Omit<PendingAction, "kind" | "payload"> & {
    kind: "send";
    payload: SendPayload;
  };
}

/**
 * Load the user + pending action from a confirm token.
 *
 * The token IS the pending_action.id (UUIDv4, ~122 bits of entropy).
 * Returns null if the pending row is gone (cancelled, already consumed,
 * or expired). The caller should treat null as "this confirm link is no
 * longer valid" and surface that to the user.
 *
 * Note: this does NOT consume or lock the pending row. The actual atomic
 * delete happens inside `executePendingSend` so a race between two tabs
 * resolves to one winner.
 */
export async function loadConfirmContext(
  token: string,
): Promise<ConfirmContext | null> {
  const supabase = getSupabaseAdmin();

  const { data: pending, error: pendingErr } = await supabase
    .from("tella_pending_action")
    .select("*")
    // Same table now also holds beneficiary-save conversation state; the
    // confirm page must only ever resolve a send.
    .eq("kind", "send")
    .eq("id", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (pendingErr) throw new Error(`loadConfirmContext: ${pendingErr.message}`);
  if (!pending) return null;

  const { data: user, error: userErr } = await supabase
    .from("tella_users")
    .select("*")
    .eq("id", (pending as PendingAction).user_id)
    .single();

  if (userErr) throw new Error(`loadConfirmContext: ${userErr.message}`);
  return {
    user: user as tellaUser,
    pending: pending as ConfirmContext["pending"],
  };
}
