import type { tellaUser, PendingSend } from "@/lib/supabase/types";
import {
  claimPendingSend,
  deletePendingSend,
  markPendingSendOutcome,
} from "@/lib/pending_sends/repository";
import { sendUsdc } from "@/lib/wallet/circle";
import { checkSendLimits, formatLimitFailure, type LimitFailure } from "./limits";

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
  // Distinct from transfer_failed: the request may have reached Circle. We
  // must not tell the user their balance is unchanged.
  | { ok: false; reason: "transfer_unknown" }
  | { ok: false; reason: "limit"; failure: LimitFailure };

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
  if (user.wallet_status !== "active" || !user.circle_wallet_id) {
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

  try {
    const result = await sendUsdc({
      fromWalletId: user.circle_wallet_id,
      toAddress: p.recipientAddress,
      amount: p.amount,
      tokenId: limits.usdc.tokenId,
      // Keyed on the pending send, not random. A retry of THIS send is
      // deduped by Circle instead of becoming a second transfer.
      idempotencyKey: claimed.id,
    });

    await markPendingSendOutcome(claimed.id, "sent");
    await deletePendingSend(claimed.id);

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
    const ambiguous = isAmbiguousFailure(err);
    console.error("[send] transfer failed", {
      userId: user.id,
      pendingId: claimed.id,
      ambiguous,
      err,
    });

    if (ambiguous) {
      // Row is deliberately NOT deleted — it's the record of a transfer
      // whose fate we don't know, and the index in migration 0008 exists
      // to find exactly these.
      await markPendingSendOutcome(claimed.id, "unknown");
      return { ok: false, reason: "transfer_unknown" };
    }

    await markPendingSendOutcome(claimed.id, "failed");
    await deletePendingSend(claimed.id);
    return { ok: false, reason: "transfer_failed" };
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
