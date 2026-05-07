import type { UpayUser, PendingAction } from "@/lib/supabase/types";
import { deletePending } from "@/lib/pending_actions/repository";
import { sendUsdc } from "@/lib/wallet/circle";

export type ExecuteSendResult =
  | { ok: true; transactionId: string; amount: string; token: "USDC"; recipientLabel: string }
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
  user: UpayUser;
  pending: PendingAction;
}): Promise<ExecuteSendResult> {
  if (user.wallet_status !== "active" || !user.circle_wallet_id) {
    await deletePending(pending.id);
    return { ok: false, reason: "wallet_inactive" };
  }

  await deletePending(pending.id);

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
      token: p.token,
      recipientLabel:
        p.recipientName ??
        `${p.recipientAddress.slice(0, 6)}…${p.recipientAddress.slice(-4)}`,
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
  return [
    `✓ Sent ${result.amount} ${result.token} to ${result.recipientLabel}.`,
    "",
    `Reference: \`${result.transactionId.slice(0, 8)}\``,
  ].join("\n");
}
