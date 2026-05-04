import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { UpayUser } from "@/lib/supabase/types";

export async function findOrCreateUser({
  whatsappNumber,
}: {
  whatsappNumber: string;
}): Promise<{ user: UpayUser; isNew: boolean }> {
  const supabase = getSupabaseAdmin();

  const { data: existing, error: findError } = await supabase
    .from("upay_users")
    .select("*")
    .eq("whatsapp_number", whatsappNumber)
    .maybeSingle();

  if (findError) {
    throw new Error(`findOrCreateUser lookup failed: ${findError.message}`);
  }

  if (existing) {
    return { user: existing as UpayUser, isNew: false };
  }

  const { data: created, error: createError } = await supabase
    .from("upay_users")
    .insert({
      whatsapp_number: whatsappNumber,
      onboarding_step: "awaiting_name",
    })
    .select()
    .single();

  if (createError) {
    throw new Error(`findOrCreateUser insert failed: ${createError.message}`);
  }

  return { user: created as UpayUser, isNew: true };
}


export async function completeOnboarding({
  userId,
  name,
}: {
  userId: string;
  name: string;
}): Promise<UpayUser> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("upay_users")
    .update({
      profile_name: name,
      onboarding_step: "completed",
    })
    .eq("id", userId)
    .select()
    .single();

  if (error) throw new Error(`completeOnboarding failed: ${error.message}`);
  return data as UpayUser;
}


export async function markWalletPending(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("upay_users")
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
    .from("upay_users")
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
    .from("upay_users")
    .update({ wallet_status: "failed" })
    .eq("id", userId);
  if (error) throw new Error(`markWalletFailed failed: ${error.message}`);
}

export async function findUserByWhatsApp(
  whatsappNumber: string,
): Promise<UpayUser | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("upay_users")
    .select("*")
    .eq("whatsapp_number", whatsappNumber)
    .maybeSingle();

  if (error) throw new Error(`findUserByWhatsApp failed: ${error.message}`);
  return (data as UpayUser | null) ?? null;
}

export async function findUserByCircleWalletId(
  circleWalletId: string,
): Promise<UpayUser | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("upay_users")
    .select("*")
    .eq("circle_wallet_id", circleWalletId)
    .maybeSingle();

  if (error) {
    throw new Error(`findUserByCircleWalletId failed: ${error.message}`);
  }
  return (data as UpayUser | null) ?? null;
}