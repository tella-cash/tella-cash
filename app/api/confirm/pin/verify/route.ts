import { NextResponse } from "next/server";
import { loadConfirmContext } from "@/lib/confirm/context";
import { verifyPin } from "@/lib/auth/pin";
import { executePendingSend } from "@/lib/sends/execute";
import { sendReceiptAndFollowUp } from "@/lib/sends/follow-up";

export const dynamic = "force-dynamic";

/**
 * POST /api/confirm/pin/verify
 *
 * PIN-equivalent of the WebAuthn authenticate/verify route. Used when
 * the device can't run WebAuthn (older Android in-app browsers, desktop
 * WhatsApp Web, etc). Same downstream effects: execute the send, DM
 * the user the receipt.
 *
 * No rate limiting yet — TODO: add per-user attempt counter + lockout
 * before real users so a leaked confirm link can't be brute-forced
 * (10^4 PINs is small).
 */
export async function POST(request: Request) {
  const body = (await request.json()) as { token?: string; pin?: string };
  if (!body.token || !body.pin) {
    return NextResponse.json(
      { error: "Missing token or pin" },
      { status: 400 },
    );
  }

  const ctx = await loadConfirmContext(body.token);
  if (!ctx) {
    return NextResponse.json(
      { error: "Confirmation link is invalid or expired" },
      { status: 404 },
    );
  }

  if (!ctx.user.pin_hash) {
    return NextResponse.json(
      { error: "No PIN set" },
      { status: 409 },
    );
  }

  const ok = await verifyPin(body.pin, ctx.user.pin_hash);
  if (!ok) {
    return NextResponse.json(
      { error: "Incorrect PIN" },
      { status: 401 },
    );
  }

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
    token: result.token,
    recipientLabel: result.recipientLabel,
  });
}