import type { tellaUser, PendingSend, SendPayload } from "@/lib/supabase/types";
import {
  claimPendingSend,
  deletePendingSend,
  markPendingSendOutcome,
} from "@/lib/pending_sends/repository";
import { sendUsdc } from "@/lib/wallet/circle";
import { gateSpend } from "@/lib/users/wallet-gate";
import { checkSendLimits, formatLimitFailure, type LimitFailure } from "./limits";
import { tierFor } from "./tiers";
import { createHeldSend } from "@/lib/held_sends/repository";
import { raiseAlert } from "@/lib/observability/alerts";
import {
  reserveSend,
  releaseReservedSend,
  attachCircleTransactionId,
} from "@/lib/transactions/repository";
import { DAILY_WINDOW_HOURS } from "./limits";

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
  | { ok: false; reason: "wallet_inactive" | "already_used" | "transfer_failed" }
  // The account is frozen. Distinct from wallet_inactive: nothing is wrong
  // with the wallet, the owner turned outbound off on purpose.
  | { ok: false; reason: "frozen" }
  // Distinct from transfer_failed: the request may have reached Circle. We
  // must not tell the user their balance is unchanged.
  | { ok: false; reason: "transfer_unknown" }
  | { ok: false; reason: "limit"; failure: LimitFailure }
  /**
   * Authorized, but above the hold threshold, so it executes later.
   *
   * Not a failure. The user proved their factor and the transfer is queued;
   * what has changed is when it happens, and that they now have a day in
   * which to stop it.
   */
  | {
      ok: false;
      reason: "held";
      heldSendId: string;
      releaseAt: string;
      amount: string;
      recipientLabel: string;
    };

/**
 * Run a confirmed send. The caller owns whatever auth gate authorized it
 * (chat reply, biometric assertion, PIN). This module owns the side effects:
 * claim the pending row, check the money is there and within limits, hit
 * Circle, record how it went.
 *
 * The row is CLAIMED rather than deleted before the transfer. Claiming keeps
 * the same single-use guarantee — the conditional update is atomic, so a
 * duplicate confirm loses the race and bails — but leaves the row in place
 * across the Circle call. That matters because the previous delete-first
 * version threw away the only record of the attempt right before the part
 * that can time out, and then told the user "your balance is unchanged",
 * which it had no way to know. See migrations/0008_pending_send_claim.sql.
 */
export async function executePendingSend({
  user,
  pending,
}: {
  user: tellaUser;
  pending: PendingSend;
}): Promise<ExecuteSendResult> {
  // The authoritative spend gate. Everything earlier is advisory: the agent
  // checks at compose time so the user gets a useful message, but the row
  // can sit for five minutes and an account can be frozen inside that window
  // — which is precisely the window a freeze exists to act on.
  const gate = gateSpend(user);
  if (!gate.ok) {
    if (gate.reason === "frozen") {
      // Deliberately NOT deleted here. freezeAccount already removes every
      // unclaimed row for the user, so reaching this branch means the row
      // was created after the freeze, and deleting it silently would hide
      // that from anyone reading the table afterwards.
      return { ok: false, reason: "frozen" };
    }
    await deletePendingSend(pending.id);
    return { ok: false, reason: "wallet_inactive" };
  }

  const claimed = await claimPendingSend(pending.id);
  if (!claimed) {
    // Someone else already confirmed this one.
    return { ok: false, reason: "already_used" };
  }

  const p = claimed.payload;

  // Re-checked here even though the agent already checked when the link was
  // minted: the pending row can sit for five minutes, during which the
  // balance can drop and other sends can eat the daily allowance.
  const limits = await checkSendLimits({ user, amount: p.amount });
  if (!limits.ok) {
    // Nothing was sent, so the link is safely retired rather than left
    // claimed-but-unresolved.
    await deletePendingSend(claimed.id);
    return { ok: false, reason: "limit", failure: limits.failure };
  }

  // Above the threshold, authorization and execution come apart. The factor
  // has been proven; only the transfer waits. See lib/sends/tiers.ts.
  if (tierFor(Number.parseFloat(p.amount), limits.limits) === "hold") {
    const held = await createHeldSend({ userId: user.id, payload: p });

    // The confirm link is retired now rather than left to expire: it has done
    // its job, and a live link for a send that is already queued would let a
    // second tap queue it twice.
    //
    // Deliberately NOT marked "sent" first, unlike the branch below. Nothing
    // has been sent — the transfer is embargoed for twenty-four hours and the
    // tella_held_send row is its record. Writing "sent" here was a lie that
    // only ever surfaced if the delete then failed, and it surfaced in the
    // worst place: migration 0008's unresolved index exists so a person can
    // find transfers whose fate is unknown, and a row labelled "sent" is one
    // they would skip. Leaving the outcome null instead means a failed delete
    // shows up as "worth looking at", and the held-send row explains it.
    // ("held" is not an option: the CHECK constraint in 0008 admits only
    // sent/failed/unknown, and a migration to add a value that persists solely
    // when a DELETE fails is not worth the deploy-ordering hazard.)
    await deletePendingSend(claimed.id);

    return {
      ok: false,
      reason: "held",
      heldSendId: held.id,
      releaseAt: held.release_at,
      amount: p.amount,
      recipientLabel: recipientLabelFor(p),
    };
  }

  // THE AUTHORITATIVE DAILY GATE, and the last thing before the money moves.
  //
  // checkSendLimits above already did this arithmetic and produced a good
  // message — but it READ a total, and two confirms tapped at the same moment
  // read the same one and both passed. The row that would have made the first
  // visible to the second is written by sendReceiptAndFollowUp, after this
  // function has already returned. So the cap bounded a sequence of sends and
  // did nothing about a burst.
  //
  // This reserves and checks in a single statement, so exactly one of a burst
  // wins. It also writes the tella_transactions row the send was always going
  // to produce, just earlier — the ledger IS the reservation, which is why
  // there is no second table to keep in step with it.
  const reservation = await reserveSend({
    userId: user.id,
    amountUsdc: p.amount,
    amountNgn: p.amountNgn,
    dailyCap: limits.limits.daily,
    windowHours: DAILY_WINDOW_HOURS,
    counterpartyLabel: recipientLabelFor(p),
    counterpartyAddress: p.recipientAddress,
  });

  if (!reservation.ok) {
    // Nothing was sent and nothing was reserved, so the link is retired rather
    // than left claimed-but-unresolved — the same handling as a failed
    // checkSendLimits above.
    await deletePendingSend(claimed.id);
    return {
      ok: false,
      reason: "limit",
      // Over the cap and "could not establish that you are under it" are
      // different things to be told. The second is check_failed, the same
      // wording checkSendLimits uses when it cannot reach the balance API.
      failure:
        reservation.reason === "over_cap"
          ? {
              kind: "over_daily",
              cap: limits.limits.daily,
              alreadySent: reservation.already,
              requested: Number.parseFloat(p.amount),
            }
          : { kind: "check_failed" },
    };
  }

  const transfer = await performTransfer({
    userId: user.id,
    sendId: claimed.id,
    fromWalletId: gate.walletId,
    payload: p,
    tokenId: limits.usdc.tokenId,
  });

  if (transfer.ok) {
    await attachCircleTransactionId(reservation.transactionId, transfer.transactionId);
    // Marked, then deleted. That reads like a wasted write and is not: the
    // delete can fail, and the ordering decides what a surviving row says.
    // Marked-then-orphaned reads "this went through"; deleted-without-marking
    // would leave a claimed row with a null outcome, which migration 0008's
    // index reports as a transfer needing reconciliation against Circle. One
    // extra round trip buys the difference between an accurate record and a
    // false alarm about someone's money.
    await markPendingSendOutcome(claimed.id, "sent");
    await deletePendingSend(claimed.id);

    return {
      ok: true,
      transactionId: transfer.transactionId,
      amount: p.amount,
      amountNgn: p.amountNgn,
      token: p.token,
      recipientLabel: recipientLabelFor(p),
      recipientAddress: p.recipientAddress,
      recipientUserId: p.recipientUserId,
      recipientWhatsappNumber: p.recipientWhatsappNumber,
    };
  }

  if (transfer.reason === "unknown") {
    // Row is deliberately NOT deleted — it's the record of a transfer
    // whose fate we don't know, and the index in migration 0008 exists
    // to find exactly these.
    //
    // The RESERVATION is kept too, and that is new. Previously an ambiguous
    // transfer produced no tella_transactions row at all, so money that may
    // well have left the wallet consumed no daily allowance and never appeared
    // in history. Keeping it is the conservative reading and the one that
    // matches what the user is told: that we cannot tell whether it went
    // through.
    await markPendingSendOutcome(claimed.id, "unknown");
    return { ok: false, reason: "transfer_unknown" };
  }

  // A definite rejection: isAmbiguousFailure established the request never
  // reached Circle, so nothing moved and the reservation must not stand.
  await releaseReservedSend(reservation.transactionId);
  await markPendingSendOutcome(claimed.id, "failed");
  await deletePendingSend(claimed.id);
  return { ok: false, reason: "transfer_failed" };
}

export function recipientLabelFor(p: SendPayload): string {
  return (
    p.recipientName ??
    `${p.recipientAddress.slice(0, 6)}…${p.recipientAddress.slice(-4)}`
  );
}

export type TransferOutcome =
  | { ok: true; transactionId: string }
  | { ok: false; reason: "failed" | "unknown" };

/**
 * Hand one transfer to Circle and classify what came back.
 *
 * Extracted so the hold-release job can reuse it rather than grow a second
 * copy. That matters more than the usual do-not-repeat-yourself argument:
 * isAmbiguousFailure below is the most safety-critical function in this
 * repository, and a second, subtly divergent version of the handling around
 * it is how a transfer whose fate is unknown gets reported to a user as
 * definitely failed.
 *
 * Deliberately owns NO row lifecycle. Pending sends and held sends record
 * their outcomes in different tables with different rules, so each caller
 * keeps its own bookkeeping and shares only the part that must not diverge.
 */
export async function performTransfer({
  userId,
  sendId,
  fromWalletId,
  payload,
  tokenId,
}: {
  userId: string;
  /** Also the Circle idempotency key — must be stable across retries. */
  sendId: string;
  fromWalletId: string;
  payload: SendPayload;
  tokenId: string;
}): Promise<TransferOutcome> {
  try {
    const result = await sendUsdc({
      fromWalletId,
      toAddress: payload.recipientAddress,
      amount: payload.amount,
      tokenId,
      // Keyed on the send's own id, never random. A retry of THIS send is
      // deduped by Circle instead of becoming a second transfer.
      idempotencyKey: sendId,
    });
    return { ok: true, transactionId: result.transactionId };
  } catch (err) {
    const ambiguous = isAmbiguousFailure(err);
    console.error("[send] transfer failed", { userId, sendId, ambiguous, err });

    if (ambiguous) {
      // Needs a person: only Circle's dashboard can say whether this moved.
      raiseAlert({
        kind: "transfer_unknown",
        message: `A transfer's outcome is unknown and needs reconciling against Circle. Send ${sendId}.`,
        context: { sendId, amount: payload.amount },
      });
      return { ok: false, reason: "unknown" };
    }

    return { ok: false, reason: "failed" };
  }
}

/**
 * Did this failure happen before Circle accepted the request, or might the
 * transfer be in flight?
 *
 * A 4xx with a real body is a definite rejection — nothing was submitted.
 * A timeout, a socket error, or a 5xx tells us nothing about what happened
 * on Circle's side, and guessing "it failed" is how a user gets told their
 * balance is unchanged while their money moves. Unknown is the honest
 * answer, so anything not clearly a rejection is treated as unknown.
 */
export function isAmbiguousFailure(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (typeof status === "number") {
    // 429 is ambiguous: Circle may have accepted the first of a burst.
    return status >= 500 || status === 429;
  }
  return true;
}

/**
 * HTTP status for a failed send on the confirm page. Everything used to be
 * 502, which is wrong for the cases the user caused (over a cap, not enough
 * balance, link already used) and made the page show a bare "HTTP 502"
 * instead of the reason.
 */
export function sendFailureStatus(
  reason: Extract<ExecuteSendResult, { ok: false }>["reason"],
): number {
  switch (reason) {
    case "limit":
      return 422;
    case "already_used":
      return 409;
    case "wallet_inactive":
      return 409;
    case "frozen":
      // Not 403: the request is well-formed and the caller is authorized.
      // The account's own state forbids it, which is what 409 is for.
      return 409;
    case "held":
      // 202: accepted, and it will happen. The confirm page reads this as a
      // success with a different message, not as a rejection.
      return 202;
    case "transfer_unknown":
    case "transfer_failed":
      return 502;
  }
}

export function formatSendResultForChat(result: ExecuteSendResult): string {
  if (!result.ok) {
    switch (result.reason) {
      case "wallet_inactive":
        return "Your wallet isn't ready to send right now. Try again in a moment.";
      case "already_used":
        return "That send was already confirmed — I didn't send it twice.";
      case "held":
        return [
          `⏳ Queued ${result.amount} USDC to ${result.recipientLabel}.`,
          "",
          `Sends this size wait 24 hours before they go out, so you've got time to stop it if this wasn't you.`,
          "",
          'Reply *cancel send* any time before then and nothing moves.',
        ].join("\n");
      case "frozen":
        return [
          "Your account is frozen, so I didn't send that.",
          "",
          "Nothing has left your wallet. You can still check your balance and receive money.",
        ].join("\n");
      case "limit":
        return formatLimitFailure(result.failure);
      case "transfer_unknown":
        // Deliberately does not claim the balance is unchanged.
        return [
          "Something went wrong partway through that transfer and I can't tell whether it went through.",
          "",
          'Check with "balance" before trying again — I don\'t want you sending twice.',
        ].join("\n");
      case "transfer_failed":
        return "I couldn't complete that transfer. Your balance is unchanged. Want to try again?";
    }
  }
  return `✓ Sent ${result.amount} USDC to ${result.recipientLabel}.`;
}
