import { offerBeneficiarySave } from "@/lib/beneficiaries/offer";
import { notifyUser } from "@/lib/messaging/notify";
import { performTransfer, recipientLabelFor } from "@/lib/sends/execute";
import { DAILY_WINDOW_HOURS, checkSendLimits } from "@/lib/sends/limits";
import { attachCircleTransactionId, releaseReservedSend, reserveSend } from "@/lib/transactions/repository";
import { findUserById } from "@/lib/users/repository";
import { gateSpend } from "@/lib/users/wallet-gate";
import { raiseAlert } from "@/lib/observability/alerts";
import { arcNetwork } from "@/lib/wallet/network";
import type { SettleDeps } from "./settle";
import { listSweepingSends, listSweepsForSend, transitionSweepSend } from "./send-repository";

/** The real dependencies of settleSweepSends. */
export function realSettleDeps(): SettleDeps {
  return {
    listSweeping: listSweepingSends,
    sweepsFor: listSweepsForSend,
    transition: transitionSweepSend,
    findUser: findUserById,
    network: () => arcNetwork(),
    gate: (user) => {
      const g = gateSpend(user);
      if (g.ok) return { ok: true, walletId: g.walletId };
      return { ok: false, reason: g.reason === "frozen" ? "frozen" : "wallet_inactive" };
    },
    checkLimits: (user, amount) => checkSendLimits({ user, amount }),
    reserve: async ({ user, send, dailyCap }) => {
      const r = await reserveSend({
        userId: user.id,
        amountUsdc: send.payload.amount,
        amountNgn: send.payload.amountNgn,
        dailyCap,
        windowHours: DAILY_WINDOW_HOURS,
        counterpartyLabel: recipientLabelFor(send.payload),
        counterpartyAddress: send.payload.recipientAddress,
      });
      return r.ok
        ? { ok: true, transactionId: r.transactionId }
        : { ok: false, reason: r.reason, already: r.reason === "over_cap" ? r.already : undefined };
    },
    releaseReservation: releaseReservedSend,
    attachCircleTransaction: attachCircleTransactionId,
    transfer: ({ user, send, walletId, tokenId }) =>
      performTransfer({
        userId: user.id,
        // The parked send's own id: stable across retries, so Circle dedupes.
        sendId: send.id,
        fromWalletId: walletId,
        payload: send.payload,
        tokenId,
      }),
    tell: async (user, lines) => {
      try {
        await notifyUser({ user, body: lines.join("\n") });
      } catch (err) {
        console.error("[sweeps] notify failed", { userId: user.id, err });
        raiseAlert({
          kind: "hold_notification_failed",
          message: "A sweep-funded send resolved but the user could not be told.",
          context: {},
        });
      }
    },
    afterSent: async (user, send) => {
      const offer = await offerBeneficiarySave({
        user,
        recipient: {
          address: send.payload.recipientAddress,
          userId: send.payload.recipientUserId,
          whatsappNumber: send.payload.recipientWhatsappNumber,
          label: recipientLabelFor(send.payload),
        },
      });
      if (offer === "not_recorded" || offer === "not_delivered") {
        console.error("[sweeps] beneficiary offer not made", { sweepSendId: send.id, outcome: offer });
      }
    },
  };
}
