import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { FreezeSource, PendingSend } from "@/lib/supabase/types";
import { revokeResetTokens } from "@/lib/security/reset-tokens";
import { cancelAllHeldSends } from "@/lib/held_sends/repository";
import { deletePending, getActivePending } from "@/lib/pending_actions/repository";
import { raiseAlert } from "@/lib/observability/alerts";

/**
 * Freezing and unfreezing an account.
 *
 * Setting the column is the easy part and, on its own, not enough. By the
 * time someone types "freeze", an attacker may already be holding one or
 * more live confirm links — each one a bearer URL that authorizes a
 * transfer and needs nothing from the chat channel to work. Flipping a flag
 * while leaving those links alive would produce a freeze that stops the
 * next send and not the one already in flight.
 *
 * So the cascade below is the feature, not housekeeping.
 */

export interface FreezeResult {
  /** Confirm links invalidated by this freeze. Surfaced to the user. */
  cancelledSends: number;
  /** Queued 24h transfers stopped by this freeze. Also surfaced. */
  cancelledHolds: number;
  /** False when the account was already frozen — the call is idempotent. */
  changed: boolean;
}

export async function freezeAccount({
  userId,
  source,
  reason,
}: {
  userId: string;
  source: FreezeSource;
  reason?: string;
}): Promise<FreezeResult> {
  const supabase = getSupabaseAdmin();

  // Conditional on frozen_at being null so two freezes racing (a chat
  // command and a panic code seconds apart, say) resolve to one winner and
  // one set of side effects, the same way claimPendingSend does it.
  const { data, error } = await supabase
    .from("tella_users")
    .update({
      frozen_at: new Date().toISOString(),
      frozen_source: source,
      frozen_reason: reason ?? null,
    })
    .eq("id", userId)
    .is("frozen_at", null)
    .select("id");

  if (error) throw new Error(`freezeAccount failed: ${error.message}`);

  const changed = (data ?? []).length > 0;

  // The cascade runs even when this call lost the race. It is idempotent,
  // and a freeze that half-applied because the first caller crashed between
  // the flag and the cleanup is exactly the case where running it twice is
  // better than not running it at all.
  const cancelledSends = await cancelUnclaimedSends(userId);

  // Claimed rows are deliberately left alone. Those transfers are already
  // at Circle and cannot be recalled by anything we do here; deleting the
  // row would only destroy the record of a transfer whose outcome may still
  // be unknown (migrations/0008).

  // Queued transfers. This is the least obvious thing a freeze has to stop
  // and the easiest to forget: by the time someone freezes, a held send is
  // invisible in the chat thread, and a freeze that let it fire the next
  // morning would not be a freeze.
  let cancelledHolds = 0;
  try {
    cancelledHolds = await cancelAllHeldSends({ userId, cancelledBy: "freeze" });
  } catch (err) {
    // Loud, and it does NOT fail the freeze — the flag and the confirm-link
    // cascade are already in place, and the release job re-checks the freeze
    // independently before sending anything.
    console.error("[freeze] cancelling held sends failed", { userId, err });
    raiseAlert({
      kind: "account_frozen",
      message: "Account frozen but queued transfers could not be cancelled. Check tella_held_send.",
      context: { source },
      force: true,
    });
  }

  // An outstanding reset link is a way back into the account, so it goes
  // too. Note this does NOT stop the user requesting a fresh one: a frozen
  // user may legitimately need to set a new PIN before lifting the freeze,
  // and refusing that builds a deadlock. What stops the attacker is that
  // resetting a PIN does not clear frozen_at.
  // Both kinds, explicitly. A freeze should also kill an in-flight channel
  // link: an attacker halfway through attaching their own Telegram account to
  // this wallet is exactly the scenario, and unlike a PIN reset there is no
  // deadlock argument for letting it survive.
  await revokeResetTokens(userId, "pin_reset");
  await revokeResetTokens(userId, "link_telegram");

  // Mid-conversation flow state, so the account doesn't come back mid-way
  // through answering "save this recipient?". deletePending takes the row
  // id, not the user id, so this reads first. Best-effort: a stale flow row
  // is untidy, not dangerous, and it must not fail a freeze.
  try {
    const pendingFlow = await getActivePending(userId);
    if (pendingFlow) await deletePending(pendingFlow.id);
  } catch (err) {
    console.error("[freeze] clearing pending flow failed", { userId, err });
  }

  if (changed) {
    raiseAlert({
      kind: "account_frozen",
      message: `An account was frozen via ${source}. ${cancelledSends} pending send(s) and ${cancelledHolds} queued transfer(s) cancelled.`,
      context: { source, cancelledSends, cancelledHolds },
      force: true,
    });
  }

  console.log("[freeze] account frozen", {
    userId,
    source,
    changed,
    cancelledSends,
    cancelledHolds,
  });
  return { cancelledSends, cancelledHolds, changed };
}

/**
 * Delete every confirm link the user has outstanding.
 *
 * This is the step that actually stops the bleeding. Returns the count so
 * the confirmation message can say "I've cancelled 2 pending sends" rather
 * than losing them silently — a freeze is already alarming, and money
 * quietly vanishing from a flow the user started is not the moment to be
 * terse.
 */
async function cancelUnclaimedSends(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("tella_pending_send")
    .delete()
    .eq("user_id", userId)
    .is("claimed_at", null)
    .select("id");

  if (error) {
    // Do not swallow this one. If the links survive, the freeze did not
    // work, and the caller must not tell the user they are safe.
    throw new Error(`freezeAccount: cancelling pending sends failed: ${error.message}`);
  }

  return ((data ?? []) as Pick<PendingSend, "id">[]).length;
}

/**
 * Lift a freeze.
 *
 * Intentionally has no self-serve caller yet. Until a factor exists that
 * possession of the WhatsApp account does not grant, any unfreeze link
 * delivered over WhatsApp could be used by the very attacker the freeze
 * exists to stop, which would make the whole feature decorative. Until
 * then this is operator-assisted, and that is an honest state to ship.
 */
export async function unfreezeAccount({
  userId,
  source,
}: {
  userId: string;
  source: FreezeSource;
}): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("tella_users")
    .update({ frozen_at: null, frozen_reason: null, frozen_source: null })
    .eq("id", userId)
    .not("frozen_at", "is", null)
    .select("id");

  if (error) throw new Error(`unfreezeAccount failed: ${error.message}`);

  const changed = (data ?? []).length > 0;
  if (changed) {
    raiseAlert({
      kind: "account_unfrozen",
      message: `An account was unfrozen via ${source}.`,
      context: { source },
      force: true,
    });
  }

  console.log("[freeze] account unfrozen", { userId, source, changed });
  return changed;
}
