import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PendingSend, tellaUser } from "@/lib/supabase/types";

export interface ConfirmContext {
  user: tellaUser;
  pending: PendingSend;
}

/**
 * Load the user + pending send from a confirm token.
 *
 * The token IS the pending_send.id (UUIDv4, ~122 bits of entropy).
 * Returns null if the pending row is gone (cancelled, already consumed,
 * or expired). The caller should treat null as "this confirm link is no
 * longer valid" and surface that to the user.
 *
 * Already-claimed rows are excluded, so a link whose send is in flight (or
 * already finished) reads as invalid rather than offering a second confirm.
 *
 * Note: this does NOT consume or lock the pending row. The atomic claim
 * happens inside `executePendingSend` so a race between two tabs resolves
 * to one winner; this filter is the cheap early-out, not the guarantee.
 */
export async function loadConfirmContext(
  token: string,
): Promise<ConfirmContext | null> {
  const supabase = getSupabaseAdmin();

  const { data: pending, error: pendingErr } = await supabase
    .from("tella_pending_send")
    .select("*")
    .eq("id", token)
    .gt("expires_at", new Date().toISOString())
    .is("claimed_at", null)
    .maybeSingle();

  if (pendingErr) {
    // A malformed token (not a valid UUID — mistyped, truncated, or someone
    // poking at the URL) makes Postgres reject the `id` comparison itself
    // (22P02, invalid_text_representation) rather than just finding no row.
    // Treat that exactly like "no row found" instead of crashing the page —
    // the visitor can't tell the difference and shouldn't have to.
    if (pendingErr.code === "22P02") return null;
    throw new Error(`loadConfirmContext: ${pendingErr.message}`);
  }
  if (!pending) return null;

  const { data: user, error: userErr } = await supabase
    .from("tella_users")
    .select("*")
    .eq("id", (pending as PendingSend).user_id)
    .single();

  if (userErr) throw new Error(`loadConfirmContext: ${userErr.message}`);
  return {
    user: user as tellaUser,
    pending: pending as PendingSend,
  };
}
