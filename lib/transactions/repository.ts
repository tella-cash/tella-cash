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
 * Total USDC this user has sent in the trailing `hours` window.
 *
 * Counts both `submitted` and `complete` rows: a send that's been handed to
 * Circle but hasn't confirmed yet has still left the wallet as far as a
 * spending limit is concerned. Excluding it would let someone burst past
 * the daily cap in the confirmation gap.
 */
export async function sumSentUsdcSince(
  userId: string,
  hours: number,
): Promise<number> {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("tella_transactions")
    .select("amount_usdc")
    .eq("user_id", userId)
    .eq("direction", "sent")
    .gte("created_at", since);

  if (error) throw new Error(`sumSentUsdcSince failed: ${error.message}`);

  return ((data as { amount_usdc: string }[]) ?? []).reduce((sum, row) => {
    const n = parseFloat(row.amount_usdc);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
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
