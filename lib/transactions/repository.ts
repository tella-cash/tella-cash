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
 * Mark an outbound send complete and attach its on-chain hash.
 *
 * `circleTransactionId` is the notification's own `id`, which IS the
 * transaction id returned by createTransaction — we store that on the row at
 * submit time, so the two can be matched directly.
 *
 * This used to guess: it took the most recent still-`submitted` send for the
 * user. With one send in flight that's right; with two, the hash from the
 * second confirmation lands on whichever row was newer, so both rows end up
 * describing the wrong transaction. Two sends in five minutes is not an
 * exotic scenario — the app explicitly supports multiple concurrent pending
 * sends (migrations/0005), and the follow-up handler reminds users about
 * them.
 *
 * The "most recent submitted" behaviour is kept only as a fallback for rows
 * written before circle_transaction_id was populated, and logs when it fires
 * so it can be removed once no such rows remain.
 */
export async function markOutboundComplete(
  userId: string,
  txHash: string,
  circleTransactionId?: string | null,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  if (circleTransactionId) {
    const { data, error } = await supabase
      .from("tella_transactions")
      .update({ status: "complete", tx_hash: txHash })
      .eq("user_id", userId)
      .eq("circle_transaction_id", circleTransactionId)
      .select("id");

    if (error) {
      throw new Error(`markOutboundComplete update failed: ${error.message}`);
    }
    if ((data ?? []).length > 0) return;

    console.warn("[transactions] no row matched circle transaction id", {
      userId,
      circleTransactionId,
    });
  }

  // Legacy path. Correct only when a single send is in flight.
  const { data: latest, error: findError } = await supabase
    .from("tella_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("direction", "sent")
    .eq("status", "submitted")
    .is("circle_transaction_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) throw new Error(`markOutboundComplete lookup failed: ${findError.message}`);
  if (!latest) return;

  console.warn("[transactions] falling back to most-recent-submitted match", {
    userId,
  });

  const { error: updateError } = await supabase
    .from("tella_transactions")
    .update({ status: "complete", tx_hash: txHash })
    .eq("id", (latest as { id: string }).id);

  if (updateError) throw new Error(`markOutboundComplete update failed: ${updateError.message}`);
}
