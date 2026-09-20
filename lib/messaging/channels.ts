import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { MessageProvider } from "./processed-messages";

/**
 * The channels a user can be reached on.
 *
 * Until now a user WAS a phone number: one `whatsapp_number`, one
 * `whatsapp_channel`, and `findOrCreateUser` overwrote the latter whenever a
 * message arrived on a different provider — recording the channel last used
 * rather than the channels available.
 *
 * This table is the replacement, and both live side by side on purpose. The
 * old columns are read by the notifier, both token pages, the beneficiary
 * lookup and the follow-up path; retiring them in the same change that
 * introduces this would be the kind of migration that breaks a live wallet.
 * So: dual-write, read here first, and contract later.
 */

export interface UserChannel {
  id: string;
  user_id: string;
  provider: MessageProvider;
  external_id: string;
  display_name: string | null;
  /**
   * The provider's handle for this person (@name on Telegram), lowercased.
   * Unlike display_name this decides where money goes, so it is unique per
   * provider and refreshed on every inbound message — see
   * migrations/0027_channel_usernames.sql.
   */
  username: string | null;
  is_primary: boolean;
  verified_at: string | null;
  last_inbound_at: string | null;
  created_at: string;
}

/** Resolve an inbound identifier to its owner. Null when unlinked. */
export async function findChannel(
  provider: MessageProvider,
  externalId: string,
): Promise<UserChannel | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("tella_user_channel")
    .select("*")
    .eq("provider", provider)
    .eq("external_id", externalId)
    .maybeSingle();

  if (error) throw new Error(`findChannel failed: ${error.message}`);
  return (data as UserChannel | null) ?? null;
}

/** Every channel for a user, primary first. */
export async function listChannels(userId: string): Promise<UserChannel[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("tella_user_channel")
    .select("*")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`listChannels failed: ${error.message}`);
  return (data as UserChannel[]) ?? [];
}

/**
 * Thrown when a channel identifier is already bound to a different account.
 *
 * Its own class so the linking flow can say something useful instead of
 * surfacing a database error, and so nothing can catch it by accident with a
 * generic handler and carry on.
 */
export class ChannelOwnedByAnotherUserError extends Error {
  // No external id in the message: it is a phone number or chat id, and this
  // error ends up in logs.
  constructor(provider: MessageProvider) {
    super(`${provider} channel belongs to another tella account`);
    this.name = "ChannelOwnedByAnotherUserError";
  }
}

/**
 * Record a channel, or refresh the one that already exists.
 *
 * `isPrimary` is only ever set to true here, never false: demoting a channel
 * is a deliberate act, not something an inbound message should do as a side
 * effect. That is the whole bug this table exists to fix, and it would be
 * easy to reintroduce one layer down.
 */
export async function upsertChannel({
  userId,
  provider,
  externalId,
  displayName,
  username,
  isPrimary,
  verified,
}: {
  userId: string;
  provider: MessageProvider;
  externalId: string;
  displayName?: string | null;
  username?: string | null;
  isPrimary?: boolean;
  verified?: boolean;
}): Promise<UserChannel> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  // The upsert conflicts on (provider, external_id), so without this check it
  // would happily rewrite `user_id` and move a live channel from one account
  // to another. Nothing told the previous owner: their Telegram simply stopped
  // being one of the places a security notice arrives, which is precisely the
  // guarantee the fan-out in lib/messaging/notify.ts exists to make.
  //
  // Refused rather than transferred. Someone genuinely moving a chat between
  // accounts unlinks it from the first one — a deliberate act by whoever holds
  // that account — instead of the second account taking it by asserting.
  //
  // Not a lock: two links racing for the same chat both read no conflict and
  // one wins the upsert. The unique index still resolves that to a single row,
  // and the loser's user simply finds the chat bound elsewhere. This closes
  // the ordinary case, which is the one that happens.
  const existing = await findChannel(provider, externalId);
  if (existing && existing.user_id !== userId) {
    throw new ChannelOwnedByAnotherUserError(provider);
  }

  const handle = username?.trim().replace(/^@/, "").toLowerCase() || null;
  if (handle) await releaseUsername(provider, handle, externalId);

  const { data, error } = await supabase
    .from("tella_user_channel")
    .upsert(
      {
        user_id: userId,
        provider,
        external_id: externalId,
        ...(displayName !== undefined ? { display_name: displayName } : {}),
        ...(username !== undefined ? { username: handle } : {}),
        ...(isPrimary ? { is_primary: true } : {}),
        ...(verified ? { verified_at: now } : {}),
        last_inbound_at: now,
      },
      { onConflict: "provider,external_id" },
    )
    .select()
    .single();

  if (error) throw new Error(`upsertChannel failed: ${error.message}`);
  return data as UserChannel;
}

/**
 * Mark a channel unreachable without deleting it.
 *
 * A Telegram user who blocks the bot fails silently forever otherwise, and
 * every security broadcast would keep paying for that failure. Clearing
 * verified_at takes it out of the fan-out while leaving the row, so the user
 * can see it in a settings screen and re-link rather than wondering where it
 * went.
 */
export async function markChannelUnverified(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("tella_user_channel")
    .update({ verified_at: null })
    .eq("id", id);

  if (error) {
    console.error("[channels] marking unverified failed", { id, error: error.message });
  }
}

/** Remove a link. The user must always keep at least one way back in. */
export async function unlinkChannel({
  userId,
  id,
}: {
  userId: string;
  id: string;
}): Promise<boolean> {
  const channels = await listChannels(userId);
  if (channels.length <= 1) return false;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("tella_user_channel")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw new Error(`unlinkChannel failed: ${error.message}`);
  return true;
}

/**
 * Take a username off whoever held it last.
 *
 * Telegram guarantees one holder at a time and nothing else: @ada can be
 * dropped by one person and claimed by another the same afternoon. Whoever is
 * presenting the handle to us right now is its current holder — Telegram
 * said so in the message we are processing — so the older row must give it
 * up, or the unique index would reject the newcomer and we would keep routing
 * payments to the previous owner. The previous owner keeps their account,
 * their wallet and their chat; they simply stop being reachable by a name
 * that is no longer theirs.
 */
async function releaseUsername(
  provider: MessageProvider,
  handle: string,
  keepExternalId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_user_channel")
    .update({ username: null })
    .eq("provider", provider)
    .ilike("username", handle)
    .neq("external_id", keepExternalId)
    .select("user_id");

  if (error) {
    console.error("[channels] releasing a username failed", { provider, error: error.message });
    return;
  }

  for (const row of (data ?? []) as Array<{ user_id: string }>) {
    console.warn("[channels] username moved to a new holder", {
      provider,
      previousUserId: row.user_id,
    });
  }
}

/**
 * Who holds this handle right now, if anyone.
 *
 * Case-insensitive, and deliberately does NOT fall back to display_name: that
 * column is decorative and duplicated, and a near-match is not a person.
 */
export async function findChannelByUsername(
  provider: MessageProvider,
  username: string,
): Promise<UserChannel | null> {
  const handle = username.trim().replace(/^@/, "").toLowerCase();
  if (!handle) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_user_channel")
    .select("*")
    .eq("provider", provider)
    .ilike("username", handle)
    .maybeSingle();

  if (error) throw new Error(`findChannelByUsername failed: ${error.message}`);
  return (data as UserChannel | null) ?? null;
}
