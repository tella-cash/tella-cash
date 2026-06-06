import { NextResponse } from "next/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { loadConfirmContext } from "@/lib/confirm/context";
import { completeConfirmedSend } from "@/lib/confirm/complete";
import {
  verifyRegistration,
  encodePublicKey,
  deviceLabelFromRequest,
} from "@/lib/webauthn/server";
import { consumeChallenge, saveCredential } from "@/lib/webauthn/repository";

export const dynamic = "force-dynamic";

/**
 * POST /api/confirm/webauthn/register/verify
 *
 * Completes passkey enrollment. Because the registration ceremony required
 * a user-verification gesture (Face ID / fingerprint / device PIN), it
 * doubles as authorization for the pending send — so on success we save the
 * credential and execute the send in the same step. One gesture, done.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    token?: string;
    response?: RegistrationResponseJSON;
  };
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

  return completeConfirmedSend(ctx);
}
