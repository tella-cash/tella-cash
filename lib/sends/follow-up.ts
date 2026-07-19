import type { tellaUser } from "@/lib/supabase/types";
import type { ExecuteSendResult } from "@/lib/sends/execute";
import { formatSendResultForChat } from "@/lib/sends/execute";
import { notifyUser } from "@/lib/whatsapp/notify";
import { findBeneficiaryByAddress } from "@/lib/beneficiaries/repository";
import { createPendingFlow } from "@/lib/pending_actions/repository";
import { flowStart } from "@/lib/sendam-ai/client";
import { SAVE_BENEFICIARY_FLOW, SAVE_BENEFICIARY_AWAITING } from "@/lib/sendam-ai/flows";
import { listActivePendingSends } from "@/lib/pending_sends/repository";
import { recordTransaction } from "@/lib/transactions/repository";
import { buildConfirmUrl } from "@/lib/confirm/url";

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
    await remindOtherPendingSends(user);
  } catch (err) {
    console.error("[send] pending-send reminder failed", { userId: user.id, err });
  }

  try {
    const existing = await findBeneficiaryByAddress(user.id, result.recipientAddress);
    if (existing) return;

    // Backend-initiated flow start: we already know exactly what we want to
    // ask, there's no ambiguous text to classify, so this mints a token
    // directly rather than going through /decode. We still author the
    // question text ourselves — sendam-ai's decoder never does that, only
    // interprets replies (see docs/INTEGRATION.md in that repo).
    const { token } = await flowStart(
      SAVE_BENEFICIARY_FLOW,
      {
        recipientAddress: result.recipientAddress,
        recipientUserId: result.recipientUserId,
        recipientWhatsappNumber: result.recipientWhatsappNumber,
        suggestedLabel: result.recipientLabel,
      },
      SAVE_BENEFICIARY_AWAITING,
    );
    await createPendingFlow({ userId: user.id, flow: SAVE_BENEFICIARY_FLOW, token });

    await notifyUser({
      user,
      body: `Want to save ${result.recipientLabel} as a beneficiary? Reply *yes* or *no*.`,
    });
  } catch (err) {
    console.error("[send] beneficiary prompt failed", { userId: user.id, err });
  }
}

/**
 * The send that just completed is already deleted at this point, so any
 * rows left are genuinely other pending sends the user started earlier
 * and never confirmed or cancelled — surface them now rather than let
 * them silently expire after 5 minutes with no explanation.
 */
async function remindOtherPendingSends(user: tellaUser): Promise<void> {
  const others = await listActivePendingSends(user.id);
  if (others.length === 0) return;

  const lines = others.map((pending) => {
    const p = pending.payload;
    const recipientLabel = p.recipientName ?? p.recipientAddress;
    return `• ${p.amount} USDC to ${recipientLabel} — ${buildConfirmUrl(pending.id)}`;
  });

  const intro =
    others.length === 1
      ? "You also have a pending send waiting:"
      : `You also have ${others.length} pending sends waiting:`;

  await notifyUser({
    user,
    body: [
      intro,
      "",
      ...lines,
      "",
      'Tap a link to complete it, or reply "cancel" to drop the most recent one.',
    ].join("\n"),
  });
}
