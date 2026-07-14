import type { tellaUser, PendingSend } from "@/lib/supabase/types";
import { deletePendingSend } from "@/lib/pending_sends/repository";
import { sendUsdc } from "@/lib/wallet/circle";
import { formatNaira } from "@/lib/fx/naira";

export type ExecuteSendResult =
  | {
      ok: true;
      transactionId: string;
      amount: string;
      amountNgn: string;
      token: "USDC";
      recipientLabel: string;
      recipientAddress: string;
      recipientUserId: string | null;
      recipientWhatsappNumber: string | null;
    }
  | { ok: false; reason: "wallet_inactive" | "transfer_failed" };

/**
 * Run a confirmed send. The caller is responsible for whatever auth gate
 * authorized the send (chat reply, biometric assertion, PIN). This module
 * only owns the side effects: delete the pending row, hit Circle, format
 * the result for whichever surface initiated it.
 *
 * Pending is deleted BEFORE the transfer so a duplicate confirm — chat
 * reply + browser tap, or two browser tabs — can't double-send. Only one
 * delete wins; the loser sees no pending and bails.
 */
export async function executePendingSend({
  user,
  pending,
}: {
  user: tellaUser;
  pending: PendingSend;
}): Promise<ExecuteSendResult> {
  if (user.wallet_status !== "active" || !user.circle_wallet_id) {
    await deletePendingSend(pending.id);
    return { ok: false, reason: "wallet_inactive" };
  }

  await deletePendingSend(pending.id);

  const p = pending.payload;
  try {
    const result = await sendUsdc({
      fromWalletId: user.circle_wallet_id,
      toAddress: p.recipientAddress,
      amount: p.amount,
    });

    return {
      ok: true,
      transactionId: result.transactionId,
      amount: p.amount,
      amountNgn: p.amountNgn,
      token: p.token,
      recipientLabel:
        p.recipientName ??
        `${p.recipientAddress.slice(0, 6)}…${p.recipientAddress.slice(-4)}`,
      recipientAddress: p.recipientAddress,
      recipientUserId: p.recipientUserId,
      recipientWhatsappNumber: p.recipientWhatsappNumber,
    };
  } catch (err) {
    console.error("[send] transfer failed", { userId: user.id, err });
    return { ok: false, reason: "transfer_failed" };
  }
}

export function formatSendResultForChat(result: ExecuteSendResult): string {
  if (!result.ok) {
    if (result.reason === "wallet_inactive") {
      return "Your wallet isn't ready to send right now. Try again in a moment.";
    }
    return "I couldn't complete that transfer. Your balance is unchanged. Want to try again?";
  }
  return `✓ Sent ${formatNaira(parseFloat(result.amountNgn))} to ${result.recipientLabel}.`;
}
