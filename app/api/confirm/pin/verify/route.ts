import { NextResponse } from "next/server";
import { loadConfirmContext } from "@/lib/confirm/context";
import { readJson } from "@/lib/http/json";
import { verifyPin } from "@/lib/auth/pin";
import {
  recordAuthAttempt,
  resetAuthAttempts,
  formatRetryAfter,
} from "@/lib/auth/rate-limit";
import {
  executePendingSend,
  formatSendResultForChat,
  sendFailureStatus,
} from "@/lib/sends/execute";
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
 * Rate limited per user via lib/auth/rate-limit — 10^4 PINs is small enough
 * that a leaked confirm link is otherwise a few thousand requests away from
 * moving someone's money.
 */
export async function POST(request: Request) {
  const parsed = await readJson<{ token?: string; pin?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
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

  // Counted before the PIN is checked, so a timeout or crash mid-verify
  // can't hand back a free guess.
  const attempt = await recordAuthAttempt(ctx.user.id, "pin_verify");
  if (!attempt.allowed) {
    return NextResponse.json(
      {
        error: `Too many attempts. Try again in ${formatRetryAfter(attempt.retryAfterSeconds)}.`,
        retryAfter: attempt.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(attempt.retryAfterSeconds) },
      },
    );
  }

  const ok = await verifyPin(body.pin, ctx.user.pin_hash);
  if (!ok) {
    return NextResponse.json(
      { error: "Incorrect PIN" },
      { status: 401 },
    );
  }

  await resetAuthAttempts(ctx.user.id, "pin_verify");

  const result = await executePendingSend({
    user: ctx.user,
    pending: ctx.pending,
  });

  await sendReceiptAndFollowUp({ user: ctx.user, result });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason, error: formatSendResultForChat(result) },
      { status: sendFailureStatus(result.reason) },
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