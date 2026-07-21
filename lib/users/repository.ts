import { getSupabaseAdmin } from "@/lib/supabase/admin";
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
export async function findOrCreateUser({
  whatsappNumber,
  channel = "twilio",
}: {
  whatsappNumber: string;
  channel?: WhatsAppChannel;
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

  return { user: created as tellaUser, isNew: true };
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