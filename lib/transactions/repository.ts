import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { tellaTransaction, TransactionDirection } from "@/lib/supabase/types";

export async function recordTransaction({
  userId,
  direction,
  amountUsdc,
  amountNgn,
  token = "USDC",
  counterpartyLabel,
  counterpartyAddress,
  txHash = null,
  circleTransactionId = null,
  status,
}: {
  userId: string;
  direction: TransactionDirection;
  amountUsdc: string;
  amountNgn: string;
  token?: string;
  counterpartyLabel: string | null;
  counterpartyAddress: string | null;
  txHash?: string | null;
  circleTransactionId?: string | null;
  status: "submitted" | "complete";
}): Promise<tellaTransaction> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_transactions")
    .insert({
      user_id: userId,
      direction,
      amount_usdc: amountUsdc,
      amount_ngn: amountNgn,
      token,
      counterparty_label: counterpartyLabel,
      counterparty_address: counterpartyAddress,
      tx_hash: txHash,
      circle_transaction_id: circleTransactionId,
      status,
    })
    .select()
    .single();

  if (error) throw new Error(`recordTransaction failed: ${error.message}`);
  return data as tellaTransaction;
}

export async function listRecentTransactions(
  userId: string,
  limit = 10,
): Promise<tellaTransaction[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`listRecentTransactions failed: ${error.message}`);
  return (data as tellaTransaction[]) ?? [];
}

/**
 * The Circle outbound webhook event carries walletId/txHash/state but not
 * the original transaction ID, so we can't correlate directly — instead we
 * mark the most recent still-`submitted` send for this user as complete.
 */
export async function markOutboundComplete(
  userId: string,
  txHash: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: latest, error: findError } = await supabase
    .from("tella_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("direction", "sent")
    .eq("status", "submitted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) throw new Error(`markOutboundComplete lookup failed: ${findError.message}`);
  if (!latest) return;

  const { error: updateError } = await supabase
    .from("tella_transactions")
    .update({ status: "complete", tx_hash: txHash })
    .eq("id", (latest as { id: string }).id);

  if (updateError) throw new Error(`markOutboundComplete update failed: ${updateError.message}`);
}
