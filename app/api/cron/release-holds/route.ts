import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import {
  claimHeldSend,
  listDueHeldSends,
  markHeldSendOutcome,
} from "@/lib/held_sends/repository";
import { performTransfer, recipientLabelFor } from "@/lib/sends/execute";
import { checkSendLimits, formatLimitFailure } from "@/lib/sends/limits";
import { gateSpend } from "@/lib/users/wallet-gate";
import { findUserById } from "@/lib/users/repository";
import { notifyUser } from "@/lib/whatsapp/notify";
import { recordTransaction } from "@/lib/transactions/repository";
import { raiseAlert } from "@/lib/observability/alerts";
import type { HeldSend } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Bounded so one invocation cannot run away, and a backlog drains steadily. */
const BATCH_LIMIT = 25;

/**
 * GET /api/cron/release-holds
 *
 * Executes held sends whose 24 hours have elapsed.
 *
 * THIS IS A NEW KIND OF ACTOR AND IT IS WORTH SAYING SO.
 *
 * Until now, every transfer in this system traced back to a person tapping
 * something: `executePendingSend` was reachable only from a confirm route. A
 * cron job that moves money on its own is a different risk shape, and the
 * defence is that it re-derives permission from scratch instead of trusting
 * a decision made a day earlier:
 *
 *   - the FREEZE is re-checked. freezeAccount already cancels every hold, so
 *     this is belt and braces, but it is the check that must never be removed:
 *     a freeze that let queued transfers fire the next morning would not be a
 *     freeze at all.
 *   - LIMITS are re-run in full. Balance moves, the rolling daily window
 *     moves, and caps may have been tightened mid-incident. A day-old check
 *     is not a check.
 *   - the claim is ATOMIC, so two overlapping invocations cannot both send.
 *   - the held row's own id is the Circle idempotency key, so even a retry
 *     that gets past all of the above is deduped by Circle rather than
 *     becoming a second transfer.
 *
 * Sequential rather than parallel, matching retry-wallets: these are money
 * operations against a rate-limited API, and a burst is not worth the
 * milliseconds.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let due: HeldSend[];
  try {
    due = await listDueHeldSends(BATCH_LIMIT);
  } catch (err) {
    console.error("[cron:release-holds] listing failed", err);
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }

  const results = { due: due.length, sent: 0, cancelled: 0, failed: 0, unknown: 0, skipped: 0 };

  for (const hold of due) {
    try {
      const outcome = await releaseOne(hold);
      results[outcome]++;
    } catch (err) {
      results.failed++;
      console.error("[cron:release-holds] release threw", { heldSendId: hold.id, err });
    }
  }

  console.log("[cron:release-holds] done", results);
  return NextResponse.json(results);
}

type ReleaseOutcome = "sent" | "cancelled" | "failed" | "unknown" | "skipped";

async function releaseOne(hold: HeldSend): Promise<ReleaseOutcome> {
  const user = await findUserById(hold.user_id);
  if (!user) {
    // The row cascades on user delete, so this should be unreachable.
    await markHeldSendOutcome({ id: hold.id, state: "cancelled" });
    return "cancelled";
  }

  // Re-derived, never inherited. See the note above.
  const gate = gateSpend(user);
  if (!gate.ok) {
    await markHeldSendOutcome({ id: hold.id, state: "cancelled" });
    await tell(user, [
      `I didn't send the ${hold.payload.amount} USDC that was queued for ${recipientLabelFor(hold.payload)}.`,
      "",
      gate.reason === "frozen"
        ? "Your account is frozen, so nothing left your wallet."
        : "Your wallet isn't ready to send right now, so nothing left it.",
    ]);
    return "cancelled";
  }

  const limits = await checkSendLimits({ user, amount: hold.payload.amount });
  if (!limits.ok) {
    await markHeldSendOutcome({ id: hold.id, state: "cancelled" });
    await tell(user, [
      `I couldn't send the ${hold.payload.amount} USDC queued for ${recipientLabelFor(hold.payload)}.`,
      "",
      formatLimitFailure(limits.failure),
      "",
      "Nothing left your wallet.",
    ]);
    return "cancelled";
  }

  // Atomic: the winner of this update owns the transfer. A second invocation
  // overlapping this one finds the row no longer 'holding' and moves on.
  const claimed = await claimHeldSend(hold.id);
  if (!claimed) return "skipped";

  const transfer = await performTransfer({
    userId: user.id,
    sendId: claimed.id,
    fromWalletId: gate.walletId,
    payload: claimed.payload,
    tokenId: limits.usdc.tokenId,
  });

  if (!transfer.ok) {
    // 'unknown' rows stay for a person to reconcile against Circle, exactly
    // like a pending send with outcome = 'unknown'. performTransfer has
    // already raised the alert.
    await markHeldSendOutcome({ id: claimed.id, state: transfer.reason });
    if (transfer.reason === "failed") {
      await tell(user, [
        `The ${claimed.payload.amount} USDC queued for ${recipientLabelFor(claimed.payload)} didn't go through.`,
        "",
        "Your balance is unchanged. Try sending it again when you're ready.",
      ]);
    } else {
      await tell(user, [
        `Something went wrong sending the ${claimed.payload.amount} USDC that was queued, and I can't tell whether it went through.`,
        "",
        'Check with "balance" before trying again — I don\'t want you sending twice.',
      ]);
    }
    return transfer.reason;
  }

  await markHeldSendOutcome({
    id: claimed.id,
    state: "sent",
    circleTransactionId: transfer.transactionId,
  });

  try {
    await recordTransaction({
      userId: user.id,
      direction: "sent",
      amountUsdc: claimed.payload.amount,
      amountNgn: claimed.payload.amountNgn,
      counterpartyLabel: recipientLabelFor(claimed.payload),
      counterpartyAddress: claimed.payload.recipientAddress,
      circleTransactionId: transfer.transactionId,
      status: "submitted",
    });
  } catch (err) {
    console.error("[cron:release-holds] transaction record failed", {
      userId: user.id,
      err,
    });
  }

  await tell(user, [
    `✓ Sent ${claimed.payload.amount} USDC to ${recipientLabelFor(claimed.payload)}.`,
    "",
    "This was the transfer you queued yesterday.",
  ]);

  return "sent";
}

/** Best-effort. A notification failing must not change what happened. */
async function tell(
  user: Parameters<typeof notifyUser>[0]["user"],
  lines: string[],
): Promise<void> {
  try {
    await notifyUser({ user, body: lines.join("\n") });
  } catch (err) {
    console.error("[cron:release-holds] notify failed", { userId: user.id, err });
    raiseAlert({
      kind: "hold_notification_failed",
      message: "A held send resolved but the user could not be told.",
      context: {},
    });
  }
}
