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