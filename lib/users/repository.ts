import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { upsertChannel, findChannel } from "@/lib/messaging/channels";
import type { MessageProvider } from "@/lib/messaging/processed-messages";
import type { tellaUser, WhatsAppChannel } from "@/lib/supabase/types";
import { arcNetwork, type ArcNetwork } from "@/lib/wallet/network";

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
  channel = "meta",
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
  provider: MessageProvider,
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


/**
 * The same question as findOrCreateUser, asked of a channel that has no phone
 * number to be keyed on.
 *
 * A Telegram chat id identifies a person perfectly well; what it cannot do is
 * name them to anyone else, which is why phone-rooted accounts still exist
 * alongside these. The channel row IS the identity here: it carries the
 * unique (provider, external_id), so a returning chat resolves through it and
 * a new one creates the account it belongs to.
 *
 * whatsapp_number is left null. That is the cost, and it is confined: these
 * users cannot be paid by phone number and cannot use the panic-code page,
 * which is keyed on one. Everything else — the wallet, sends, receiving by
 * address, the freeze, recovery — never looked at the column.
 *
 * The user row is written BEFORE the channel row, and the channel insert is
 * allowed to throw rather than being swallowed the way recordChannel's is: an
 * account whose only identity failed to persist is an account nobody can ever
 * reach again, and the next message would silently create a second one.
 */
export async function findOrCreateUserByChannel({
  provider,
  externalId,
  profileName,
  username,
}: {
  provider: MessageProvider;
  externalId: string;
  profileName?: string | null;
  username?: string | null;
}): Promise<{ user: tellaUser; isNew: boolean }> {
  const supabase = getSupabaseAdmin();

  const existingChannel = await findChannel(provider, externalId);
  if (existingChannel) {
    const user = await findUserById(existingChannel.user_id);
    if (user) {
      // Refreshed on the way past. A handle that changed hands since this
      // person last wrote is corrected here, before anything can pay the
      // previous holder by it. Best-effort: a failed refresh must not stop
      // someone using their wallet.
      if (username !== undefined && username !== existingChannel.username) {
        try {
          await upsertChannel({
            userId: user.id,
            provider,
            externalId,
            username,
            ...(profileName ? { displayName: profileName } : {}),
          });
        } catch (err) {
          console.error("[users] username refresh failed", { provider, err });
        }
      }
      return { user, isNew: false };
    }
    // The channel points at a user that no longer exists. The row cascades on
    // delete, so this should be unreachable; falling through to create a
    // fresh account is better than answering nobody.
    console.error("[users] channel row outlived its user", {
      provider,
      channelId: existingChannel.id,
    });
  }

  const { data: created, error: createError } = await supabase
    .from("tella_users")
    .insert({
      whatsapp_number: null,
      whatsapp_channel: provider,
      onboarding_step: "awaiting_name",
    })
    .select()
    .single();

  if (createError) {
    throw new Error(`findOrCreateUserByChannel insert failed: ${createError.message}`, {
      cause: createError,
    });
  }

  const createdUser = created as tellaUser;

  await upsertChannel({
    userId: createdUser.id,
    provider,
    externalId,
    isPrimary: true,
    verified: true,
    username,
    ...(profileName ? { displayName: profileName } : {}),
  });

  return { user: createdUser, isNew: true };
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
  network,
}: {
  userId: string;
  walletId: string;
  address: string;
  network: ArcNetwork;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("tella_users")
    .update({
      circle_wallet_id: walletId,
      wallet_address: address,
      wallet_status: "active",
      wallet_network: network,
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
    // The third clause: active wallets from another network. After an
    // ARC_NETWORK switch the gate treats those as not provisioned, and
    // nothing else would ever create the user a wallet on this one.
    // Re-provisioning replaces circle_wallet_id and wallet_address; the old
    // wallet belongs to a different Circle entity and this deployment
    // cannot use it either way.
    .or(
      `wallet_status.eq.failed,and(wallet_status.eq.pending,updated_at.lt.${staleBefore}),and(wallet_status.eq.active,or(wallet_network.is.null,wallet_network.neq.${arcNetwork()}))`,
    )
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
/**
 * Record a security change that starts the post-change hold window: a
 * channel linked, passkeys removed. PIN resets stamp it in their own write
 * (lib/auth/pin.ts). See lib/sends/tiers.ts for what the window does.
 */
export async function markFactorsChanged(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("tella_users")
    .update({ factors_changed_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw new Error(`markFactorsChanged failed: ${error.message}`);
}

/**
 * Move a user between onboarding steps, reporting rather than throwing.
 *
 * Returns false when the database refuses the new value. That is the case on a
 * deployment that has run ahead of migration 0032, where the question being
 * asked is simply skipped instead of breaking onboarding.
 */
export async function setOnboardingStep(
  userId: string,
  step: tellaUser["onboarding_step"],
): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("tella_users")
    .update({ onboarding_step: step })
    .eq("id", userId);
  if (error) {
    console.error("[onboarding] could not set step", { step, error: error.message });
    return false;
  }
  return true;
}
