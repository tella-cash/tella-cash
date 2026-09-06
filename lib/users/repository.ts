import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { upsertChannel } from "@/lib/messaging/channels";
import type { tellaUser, WhatsAppChannel } from "@/lib/supabase/types";

/**
 * Looks up (or creates) the user for an inbound WhatsApp message.
 *
 * `channel` records which provider (Twilio vs Meta Cloud API) this message
 * arrived through. It's kept current on every inbound message — not just
 * set at creation — so a user who moves between channels (e.g. during the
 * Twilio→Meta migration) always gets outbound notifications (payment
 * received, send receipts) routed through whichever API they're actually
 * reachable on. Same underlying `whatsapp_number` matches either way, since
 * both webhooks normalize to Twilio-style `whatsapp:+E164`.
 */
/**
 * Resolve an inbound WhatsApp identifier to a user, creating one if needed.
 *
 * The channel column is no longer clobbered. It used to be updated in place
 * whenever a message arrived on a different provider, which recorded "the
 * channel last used" rather than "the channels available" and silently
 * repointed every outbound notification at whichever provider happened to
 * deliver last. tella_user_channel is the record now; this column survives
 * only because half a dozen call sites still read it, and is kept in step as
 * the user's PRIMARY channel rather than as a running log of the last one.
 */
export async function findOrCreateUser({
  whatsappNumber,
  channel = "twilio",
  profileName,
}: {
  whatsappNumber: string;
  channel?: WhatsAppChannel;
  /** The provider's display name for this sender. Stored on the channel row. */
  profileName?: string | null;
}): Promise<{ user: tellaUser; isNew: boolean }> {
  const supabase = getSupabaseAdmin();

  const { data: existing, error: findError } = await supabase
    .from("tella_users")
    .select("*")
    .eq("whatsapp_number", whatsappNumber)
    .maybeSingle();

  if (findError) {
    throw new Error(`findOrCreateUser lookup failed: ${findError.message}`, {
      cause: findError,
    });
  }

  if (existing) {
    const existingUser = existing as tellaUser;

    // Dual-write while the legacy columns are still read elsewhere. The
    // channel row is the authority; this keeps the column usable until the
    // contract migration retires it.
    await recordChannel(existingUser.id, channel, whatsappNumber, existingUser.whatsapp_channel === channel, profileName);

    if (existingUser.whatsapp_channel !== channel) {
      const { data: updated, error: updateError } = await supabase
        .from("tella_users")
        .update({ whatsapp_channel: channel })
        .eq("id", existingUser.id)
        .select()
        .single();

      if (updateError) {
        throw new Error(
          `findOrCreateUser channel update failed: ${updateError.message}`,
          { cause: updateError },
        );
      }
      return { user: updated as tellaUser, isNew: false };
    }
    return { user: existingUser, isNew: false };
  }

  const { data: created, error: createError } = await supabase
    .from("tella_users")
    .insert({
      whatsapp_number: whatsappNumber,
      whatsapp_channel: channel,
      onboarding_step: "awaiting_name",
    })
    .select()
    .single();

  if (createError) {
    throw new Error(`findOrCreateUser insert failed: ${createError.message}`, {
      cause: createError,
    });
  }

  const createdUser = created as tellaUser;
  await recordChannel(createdUser.id, channel, whatsappNumber, true, profileName);

  return { user: createdUser, isNew: true };
}

/**
 * Mirror an inbound WhatsApp identifier into tella_user_channel.
 *
 * Best-effort and deliberately non-fatal: the legacy columns are still
 * written and still read, so a failure here degrades the fan-out for one
 * message rather than dropping the message. It becomes fatal on the day the
 * contract migration removes that fallback, and not before.
 *
 * An inbound message is proof the channel belongs to whoever answered on it,
 * so it is verified on sight — unlike Telegram, which has to be linked from
 * an already-authenticated channel first.
 */
async function recordChannel(
  userId: string,
  provider: WhatsAppChannel,
  externalId: string,
  isPrimary: boolean,
  displayName?: string | null,
): Promise<void> {
  try {
    await upsertChannel({
      userId,
      provider,
      externalId,
      isPrimary,
      verified: true,
      // Passed only when the provider actually sent one. upsertChannel omits
      // the column for `undefined`, so a delivery without a profile name
      // leaves an existing one alone instead of blanking it.
      ...(displayName ? { displayName } : {}),
    });
  } catch (err) {
    console.error("[users] channel mirror failed", { userId, provider, err });
  }
}


export async function completeOnboarding({
  userId,
  name,
}: {
  userId: string;
  name: string;
}): Promise<tellaUser> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_users")
    .update({
      profile_name: name,
      onboarding_step: "completed",
    })
    .eq("id", userId)
    .select()
    .single();

  if (error) throw new Error(`completeOnboarding failed: ${error.message}`);
  return data as tellaUser;
}


export async function markWalletPending(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("tella_users")
    .update({ wallet_status: "pending" })
    .eq("id", userId);
  if (error) throw new Error(`markWalletPending failed: ${error.message}`);
}

export async function setWalletActive({
  userId,
  walletId,
  address,
}: {
  userId: string;
  walletId: string;
  address: string;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("tella_users")
    .update({
      circle_wallet_id: walletId,
      wallet_address: address,
      wallet_status: "active",
    })
    .eq("id", userId);
  if (error) throw new Error(`setWalletActive failed: ${error.message}`);
}

export async function markWalletFailed(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("tella_users")
    .update({ wallet_status: "failed" })
    .eq("id", userId);
  if (error) throw new Error(`markWalletFailed failed: ${error.message}`);
}

/**
 * Users whose wallet provisioning never completed.
 *
 * Both 'failed' and long-stuck 'pending' are returned. A 'pending' row older
 * than the grace period means the process died between markWalletPending and
 * setWalletActive — provision.ts's own comment says such users are
 * recoverable by re-running, and Circle's idempotencyKey (the user id) makes
 * the retry safe: it returns the existing wallet rather than creating a
 * second one.
 */
export async function listUsersNeedingWallet(
  stalePendingMinutes = 10,
  limit = 50,
): Promise<tellaUser[]> {
  const supabase = getSupabaseAdmin();
  const staleBefore = new Date(
    Date.now() - stalePendingMinutes * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("tella_users")
    .select("*")
    .or(`wallet_status.eq.failed,and(wallet_status.eq.pending,updated_at.lt.${staleBefore})`)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`listUsersNeedingWallet failed: ${error.message}`);
  return (data as tellaUser[]) ?? [];
}

/** By primary key. Used by jobs that hold a user_id rather than a channel id. */
export async function findUserById(userId: string): Promise<tellaUser | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(`findUserById failed: ${error.message}`);
  return (data as tellaUser | null) ?? null;
}

export async function findUserByWhatsApp(
  whatsappNumber: string,
): Promise<tellaUser | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_users")
    .select("*")
    .eq("whatsapp_number", whatsappNumber)
    .maybeSingle();

  if (error) throw new Error(`findUserByWhatsApp failed: ${error.message}`);
  return (data as tellaUser | null) ?? null;
}

export async function findUserByCircleWalletId(
  circleWalletId: string,
): Promise<tellaUser | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_users")
    .select("*")
    .eq("circle_wallet_id", circleWalletId)
    .maybeSingle();

  if (error) {
    throw new Error(`findUserByCircleWalletId failed: ${error.message}`);
  }
  return (data as tellaUser | null) ?? null;
}

/**
 * Resolves an on-chain wallet address back to the tella user who owns it,
 * so an inbound transfer from another tella user can be labeled with their
 * name instead of a shortened address. Case-insensitive because Circle's
 * `sourceAddress` and the checksum casing stored in `wallet_address` aren't
 * guaranteed to match byte-for-byte.
 */
export async function findUserByWalletAddress(
  address: string,
): Promise<tellaUser | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_users")
    .select("*")
    .ilike("wallet_address", address)
    .maybeSingle();

  if (error) {
    throw new Error(`findUserByWalletAddress failed: ${error.message}`);
  }
  return (data as tellaUser | null) ?? null;
}