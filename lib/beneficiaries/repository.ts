import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Beneficiary } from "@/lib/supabase/types";

export async function listBeneficiaries(userId: string): Promise<Beneficiary[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_beneficiaries")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`listBeneficiaries failed: ${error.message}`);
  return (data as Beneficiary[]) ?? [];
}

/** Case-insensitive lookup — labels are stored as typed but matched loosely. */
export async function findBeneficiaryByLabel(
  userId: string,
  label: string,
): Promise<Beneficiary | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_beneficiaries")
    .select("*")
    .eq("user_id", userId)
    .ilike("label", label.trim())
    .maybeSingle();

  if (error) throw new Error(`findBeneficiaryByLabel failed: ${error.message}`);
  return (data as Beneficiary | null) ?? null;
}

/**
 * True if this address is already saved as a beneficiary for the user.
 *
 * `limit(1)`, NOT `maybeSingle()`. Nothing stops the same address being saved
 * under two labels — the only uniqueness is on (user_id, lower(label)), see
 * createBeneficiary below — and maybeSingle throws PGRST116 on a second row
 * rather than returning either of them. The single caller that matters treats
 * a throw as "do not offer to save this recipient", so one duplicate pair
 * permanently suppressed the offer for that address. The question this answers
 * is "is it saved at all", which the first row settles.
 */
export async function findBeneficiaryByAddress(
  userId: string,
  recipientAddress: string,
): Promise<Beneficiary | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_beneficiaries")
    .select("*")
    .eq("user_id", userId)
    .ilike("recipient_address", recipientAddress)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw new Error(`findBeneficiaryByAddress failed: ${error.message}`);
  return ((data as Beneficiary[] | null) ?? [])[0] ?? null;
}

export type CreateBeneficiaryResult =
  | { ok: true; beneficiary: Beneficiary }
  | { ok: false; reason: "label_taken" };

export async function createBeneficiary({
  userId,
  label,
  recipientUserId,
  recipientAddress,
  recipientWhatsappNumber,
}: {
  userId: string;
  label: string;
  recipientUserId: string | null;
  recipientAddress: string;
  recipientWhatsappNumber: string | null;
}): Promise<CreateBeneficiaryResult> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_beneficiaries")
    .insert({
      user_id: userId,
      label: label.trim(),
      recipient_user_id: recipientUserId,
      recipient_address: recipientAddress,
      recipient_whatsapp_number: recipientWhatsappNumber,
    })
    .select()
    .single();

  if (error) {
    // Unique-violation on the case-insensitive (user_id, lower(label)) index —
    // belt-and-suspenders alongside the pre-insert findBeneficiaryByLabel check.
    if (error.code === "23505") return { ok: false, reason: "label_taken" };
    throw new Error(`createBeneficiary failed: ${error.message}`);
  }

  return { ok: true, beneficiary: data as Beneficiary };
}
