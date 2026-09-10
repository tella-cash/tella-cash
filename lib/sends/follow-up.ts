import type { tellaUser } from "@/lib/supabase/types";
import type { ExecuteSendResult } from "@/lib/sends/execute";
import { formatSendResultForChat } from "@/lib/sends/execute";
import { notifyUser } from "@/lib/messaging/notify";
import { offerBeneficiarySave } from "@/lib/beneficiaries/offer";
import { listActivePendingSends } from "@/lib/pending_sends/repository";
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

  // The tella_transactions row is NOT written here any more. It is created by
  // executePendingSend before the transfer, because the row is what reserves
  // the amount against the daily cap — writing it afterwards is precisely what
  // let two simultaneous confirms both pass the same check. See
  // migrations/0022_spend_reservation.sql.
  //
  // Recording it here as well would double every send in history and in the
  // rolling total.

  try {
    await remindOtherPendingSends(user);
  } catch (err) {
    console.error("[send] pending-send reminder failed", { userId: user.id, err });
  }

  // Nothing here can throw — offerBeneficiarySave reports instead, and each of
  // its steps fails independently. That is the whole change: this used to be
  // one try/catch around a sendam-ai POST, a row write and the message, so a
  // decoder blip meant the user was simply never asked. See
  // lib/beneficiaries/offer.ts and migrations/0023.
  const outcome = await offerBeneficiarySave({
    user,
    recipient: {
      address: result.recipientAddress,
      userId: result.recipientUserId,
      whatsappNumber: result.recipientWhatsappNumber,
      label: result.recipientLabel,
    },
  });

  if (outcome === "not_recorded" || outcome === "not_delivered") {
    console.error("[send] beneficiary offer not made", { userId: user.id, outcome });
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
