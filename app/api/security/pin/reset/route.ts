import { NextResponse } from "next/server";
import { readJson } from "@/lib/http/json";
import {
  loadResetContext,
  consumeResetToken,
  revokeResetTokens,
} from "@/lib/security/reset-tokens";
import { isValidPin, replacePinForUser } from "@/lib/auth/pin";
import { resetAuthAttempts } from "@/lib/auth/rate-limit";
import { deleteCredentialsForUser } from "@/lib/webauthn/repository";
import { notifyUser } from "@/lib/messaging/notify";
import { emailLinkedGoogle } from "@/lib/email/security-notice";
import { HOLD_HOURS, FACTOR_CHANGE_HOLD_HOURS } from "@/lib/sends/tiers";

export const dynamic = "force-dynamic";

/**
 * POST /api/security/pin/reset
 *
 * Sets a new PIN using a single-use recovery token delivered over WhatsApp.
 * This is the only path that can overwrite an existing pin_hash — the
 * confirm flow's pin/setup returns 409 rather than let a link-holder do it.
 *
 * The token is consumed BEFORE the PIN is written. If the write then fails
 * the user has to request a new link, which is the right way round: a token
 * that survives a partial failure is a token that can be replayed.
 */
export async function POST(request: Request) {
  const parsed = await readJson<{
    token?: string;
    pin?: string;
    removePasskeys?: boolean;
  }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  if (!body.token || !body.pin) {
    return NextResponse.json(
      { error: "Missing token or pin" },
      { status: 400 },
    );
  }

  if (!isValidPin(body.pin)) {
    return NextResponse.json(
      { error: "PIN must be 4–8 digits" },
      { status: 400 },
    );
  }

  const ctx = await loadResetContext(body.token);
  if (!ctx) {
    return NextResponse.json(
      { error: "This reset link is invalid, already used, or expired." },
      { status: 404 },
    );
  }

  const consumed = await consumeResetToken(ctx.token.id);
  if (!consumed) {
    // Two tabs raced; the other one won.
    return NextResponse.json(
      { error: "This reset link has already been used." },
      { status: 409 },
    );
  }

  try {
    await replacePinForUser({ userId: ctx.user.id, pin: body.pin });
  } catch (err) {
    console.error("[security] pin reset write failed", {
      userId: ctx.user.id,
      err,
    });
    return NextResponse.json(
      { error: "Couldn't save that PIN. Request a new link and try again." },
      { status: 500 },
    );
  }

  let removedPasskeys = 0;
  if (body.removePasskeys) {
    try {
      removedPasskeys = await deleteCredentialsForUser(ctx.user.id);
    } catch (err) {
      // The PIN is already set, so the user is no longer locked out — this
      // failing is a cleanup problem, not a recovery problem.
      console.error("[security] passkey removal failed", {
        userId: ctx.user.id,
        err,
      });
    }
  }

  // A lockout from before the reset would otherwise persist and leave the
  // user still unable to confirm with the PIN they just set.
  await resetAuthAttempts(ctx.user.id, "pin_verify");
  await resetAuthAttempts(ctx.user.id, "webauthn_authenticate");
  await revokeResetTokens(ctx.user.id);

  // DELIBERATELY does not clear frozen_at, and must never be changed to.
  //
  // A frozen user is allowed to reach this route at all — they may genuinely
  // need a new PIN before lifting the freeze, and refusing here would build a
  // deadlock out of the one feature that exists to help them. What makes that
  // safe is precisely that a reset does not thaw the account: an attacker
  // holding the phone can reset the PIN all they like and still cannot move
  // money. Adding a "helpful" unfreeze here would hand them the account and
  // reduce the kill switch to decoration.
  //
  // This is also why the freeze lives in its own column rather than in
  // wallet_status — see migrations/0012_account_freeze.sql.

  console.log("[security] pin reset completed", {
    userId: ctx.user.id,
    removedPasskeys,
  });

  // Out-of-band notice. If the reset wasn't the account owner, this is the
  // message that tells them — so it is sent even though they're looking at
  // the success screen already.
  //
  // Chat alone is not out of band: the reset link was delivered to a chat,
  // so whoever did this holds at least one of them. The linked Google
  // address is the notice that can reach the owner, and the hold window
  // started by this reset is what gives them time to act on it.
  const removedLine =
    removedPasskeys > 0
      ? [`Face ID / fingerprint was also removed from ${removedPasskeys} device${removedPasskeys === 1 ? "" : "s"}.`]
      : [];
  const holdLine = `For the next ${FACTOR_CHANGE_HOLD_HOURS} hours every send waits ${HOLD_HOURS} hours before it goes out.`;

  await Promise.allSettled([
    notifyUser({
      user: ctx.user,
      body: [
        "🔐 Your tella PIN was just changed.",
        ...removedLine,
        "",
        holdLine,
        "",
        "If this wasn't you, reply *freeze* immediately.",
      ].join("\n"),
    }).catch((err) => {
      console.error("[security] reset notification failed", {
        userId: ctx.user.id,
        err,
      });
    }),
    emailLinkedGoogle({
      userId: ctx.user.id,
      kind: "pin_reset",
      subject: "Your tella PIN was changed",
      lines: [
        "The PIN on your tella wallet was just reset.",
        ...removedLine,
        "",
        holdLine,
        "",
        "If this wasn't you, freeze your wallet now: message tella and say freeze, or use the freeze page with this Google account. Freezing cancels any queued transfer.",
      ],
    }),
  ]);

  return NextResponse.json({ ok: true, removedPasskeys });
}
