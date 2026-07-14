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

/** True if this address is already saved as a beneficiary for the user. */
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
    .maybeSingle();

  if (error) throw new Error(`findBeneficiaryByAddress failed: ${error.message}`);
  return (data as Beneficiary | null) ?? null;
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
