import type { tellaUser } from "@/lib/supabase/types";
import type { ExecuteSendResult } from "@/lib/sends/execute";
import { formatSendResultForChat } from "@/lib/sends/execute";
import { notifyUser } from "@/lib/whatsapp/notify";
import { findBeneficiaryByAddress } from "@/lib/beneficiaries/repository";
import { createPendingBeneficiaryPrompt } from "@/lib/pending_actions/repository";
import { recordTransaction } from "@/lib/transactions/repository";

/**
 * Runs after a send has been authorized and executed (from either the
 * biometric/passkey confirm route or the PIN-verify route — both had this
 * logic duplicated inline before). Sends the receipt, records it for
 * "history", and — if the recipient isn't already a saved beneficiary —
 * asks the user whether to save them for next time.
 */
export async function sendReceiptAndFollowUp({
  user,
  result,
}: {
  user: tellaUser;
  result: ExecuteSendResult;
}): Promise<void> {
  try {
    await notifyUser({ user, body: formatSendResultForChat(result) });
  } catch (err) {
    console.error("[send] receipt message failed", { userId: user.id, err });
  }

  if (!result.ok) return;

  try {
    await recordTransaction({
      userId: user.id,
      direction: "sent",
      amountUsdc: result.amount,
      amountNgn: result.amountNgn,
      counterpartyLabel: result.recipientLabel,
      counterpartyAddress: result.recipientAddress,
      circleTransactionId: result.transactionId,
      status: "submitted",
    });
  } catch (err) {
    console.error("[send] transaction record failed", { userId: user.id, err });
  }

  try {
    const existing = await findBeneficiaryByAddress(user.id, result.recipientAddress);
    if (existing) return;

    await createPendingBeneficiaryPrompt({
      userId: user.id,
      payload: {
        recipientAddress: result.recipientAddress,
        recipientUserId: result.recipientUserId,
        recipientWhatsappNumber: result.recipientWhatsappNumber,
        suggestedLabel: result.recipientLabel,
      },
    });

    await notifyUser({
      user,
      body: `Want to save ${result.recipientLabel} as a beneficiary? Reply *yes* or *no*.`,
    });
  } catch (err) {
    console.error("[send] beneficiary prompt failed", { userId: user.id, err });
  }
}
