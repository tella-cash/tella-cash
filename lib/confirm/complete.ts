import { NextResponse } from "next/server";
import type { ConfirmContext } from "./context";
import { executePendingSend } from "@/lib/sends/execute";
import { sendReceiptAndFollowUp } from "@/lib/sends/follow-up";

/**
 * Run a send that's just been authorized (biometric assertion or fresh
 * passkey enrollment, both of which required a user-verification gesture),
 * DM the user the receipt, and shape the HTTP response for the confirm
 * page. Mirrors the tail of the PIN verify route so every confirm method
 * resolves identically downstream.
 */
export async function completeConfirmedSend(
  ctx: ConfirmContext,
): Promise<NextResponse> {
  const result = await executePendingSend({
    user: ctx.user,
    pending: ctx.pending,
  });

  await sendReceiptAndFollowUp({ user: ctx.user, result });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    transactionId: result.transactionId,
    amount: result.amount,
  });
}
