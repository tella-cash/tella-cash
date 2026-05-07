import { NextResponse } from "next/server";
import {
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { loadConfirmContext } from "@/lib/confirm/context";
import { getWebAuthnConfig } from "@/lib/webauthn/config";
import {
  consumeChallenge,
  saveCredential,
} from "@/lib/webauthn/repository";

export const dynamic = "force-dynamic";

/**
 * POST /api/webauthn/register/verify
 *
 * Second leg of registration. The browser POSTs the attestation that
 * `navigator.credentials.create(...)` produced; we verify it against
 * the stored challenge and persist the resulting credential.
 *
 * On success the page can immediately move to the authentication step
 * (the same Face ID prompt, but for the assertion that actually
 * authorizes the send). We do NOT execute the send here — registration
 * proves "this device has a biometric authenticator", not "the user
 * just authenticated to spend money."
 */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    token?: string;
    response?: RegistrationResponseJSON;
    deviceLabel?: string;
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

  const expectedChallenge = await consumeChallenge({
    userId: ctx.user.id,
    kind: "registration",
  });
  if (!expectedChallenge) {
    return NextResponse.json(
      { error: "No active registration challenge" },
      { status: 400 },
    );
  }

  const config = getWebAuthnConfig();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      requireUserVerification: true,
    });
  } catch (err) {
    console.error("[webauthn] register verify failed", { err });
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 400 },
    );
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 400 },
    );
  }

  const { credential } = verification.registrationInfo;

  await saveCredential({
    userId: ctx.user.id,
    credentialId: credential.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: (body.response.response.transports as string[] | undefined) ?? null,
    deviceLabel: body.deviceLabel ?? null,
  });

  return NextResponse.json({ ok: true });
}
