import { NextResponse } from "next/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { loadConfirmContext } from "@/lib/confirm/context";
import { authorizeEnrollment } from "@/lib/confirm/enroll-gate";
import { notifyUser } from "@/lib/messaging/notify";
import { readJson } from "@/lib/http/json";
import { completeConfirmedSend } from "@/lib/confirm/complete";
import {
  verifyRegistration,
  encodePublicKey,
  deviceLabelFromRequest,
} from "@/lib/webauthn/server";
import {
  consumeChallenge,
  saveCredential,
} from "@/lib/webauthn/repository";

export const dynamic = "force-dynamic";

/**
 * POST /api/confirm/webauthn/register/verify
 *
 * Completes passkey enrollment. Because the registration ceremony required
 * a user-verification gesture (Face ID / fingerprint / device PIN), it
 * doubles as authorization for the pending send — so on success we save the
 * credential and execute the send in the same step. One gesture, done.
 *
 * That shortcut is only sound for a FIRST enrollment. Once the account has
 * any credential of its own, a passkey gesture proves nothing about who is
 * holding the link — it just authenticates the attacker to their own phone.
 * So an account with a PIN may enroll only by proving that PIN in this same
 * request (lib/confirm/enroll-gate.ts), the PIN being the existing factor that
 * authorizes the new one; an account that already has a passkey is refused,
 * and adding a second device goes through recovery. Mirrors the guard in
 * /api/confirm/pin/setup.
 */
export async function POST(request: Request) {
  const parsed = await readJson<{
    token?: string;
    response?: RegistrationResponseJSON;
    pin?: string;
  }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (!body.token || !body.response) {
    return NextResponse.json(
      { error: "Missing token or response" },
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

  // Checked again here, with the PIN, rather than trusting that the options
  // step ran: a challenge saved earlier must not be spendable by a request that
  // never proved anything now.
  const auth = await authorizeEnrollment(ctx.user, body.pin);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error, ...(auth.retryAfter ? { retryAfter: auth.retryAfter } : {}) },
      {
        status: auth.status,
        ...(auth.retryAfter ? { headers: { "Retry-After": String(auth.retryAfter) } } : {}),
      },
    );
  }

  const expectedChallenge = await consumeChallenge(ctx.user.id, "registration");
  if (!expectedChallenge) {
    return NextResponse.json(
      { error: "That took too long — tap confirm again." },
      { status: 400 },
    );
  }

  let verification;
  try {
    verification = await verifyRegistration(body.response, expectedChallenge);
  } catch (err) {
    console.error("[webauthn] registration verify threw", { err });
    return NextResponse.json(
      { error: "Could not verify that passkey." },
      { status: 400 },
    );
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json(
      { error: "Passkey verification failed." },
      { status: 401 },
    );
  }

  const { credential } = verification.registrationInfo;
  await saveCredential({
    userId: ctx.user.id,
    credentialId: credential.id,
    publicKey: encodePublicKey(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? null,
    deviceLabel: deviceLabelFromRequest(request),
  });

  // Adding a passkey does NOT start the post-change send hold (a PIN reset or
  // passkey removal still does): it took the account's own PIN to get here. The
  // owner is told on every channel instead, because a PIN is the one thing a
  // person standing over their shoulder might have seen. Best-effort: a failed
  // notice must not undo or block a completed enrollment.
  if (auth.steppedUp) {
    try {
      await notifyUser({
        user: ctx.user,
        body: [
          "🔐 Face ID / fingerprint was just added to your tella wallet.",
          "",
          "If this wasn't you, reply *freeze* immediately.",
        ].join("\n"),
      });
    } catch (err) {
      console.error("[webauthn] enrollment notice failed", { userId: ctx.user.id, err });
    }
  }

  return completeConfirmedSend(ctx);
}
