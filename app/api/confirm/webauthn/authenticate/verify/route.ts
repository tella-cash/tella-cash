import { NextResponse } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { loadConfirmContext } from "@/lib/confirm/context";
import { completeConfirmedSend } from "@/lib/confirm/complete";
import { verifyAuthentication } from "@/lib/webauthn/server";
import {
  consumeChallenge,
  listCredentials,
  updateCredentialCounter,
} from "@/lib/webauthn/repository";

export const dynamic = "force-dynamic";

/**
 * POST /api/confirm/webauthn/authenticate/verify
 *
 * Verifies a returning user's passkey assertion and, on success, executes
 * the pending send and DMs the receipt — same downstream effect as the PIN
 * verify route.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    token?: string;
    response?: AuthenticationResponseJSON;
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

  const expectedChallenge = await consumeChallenge(
    ctx.user.id,
    "authentication",
  );
  if (!expectedChallenge) {
    return NextResponse.json(
      { error: "That took too long — tap confirm again." },
      { status: 400 },
    );
  }

  const credentials = await listCredentials(ctx.user.id);
  const credential = credentials.find(
    (c) => c.credential_id === body.response!.id,
  );
  if (!credential) {
    return NextResponse.json(
      { error: "That passkey isn't recognized." },
      { status: 404 },
    );
  }

  let verification;
  try {
    verification = await verifyAuthentication(
      body.response,
      expectedChallenge,
      credential,
    );
  } catch (err) {
    console.error("[webauthn] authentication verify threw", { err });
    return NextResponse.json(
      { error: "Could not verify that passkey." },
      { status: 400 },
    );
  }

  if (!verification.verified) {
    return NextResponse.json(
      { error: "Passkey verification failed." },
      { status: 401 },
    );
  }

  await updateCredentialCounter(
    credential.credential_id,
    verification.authenticationInfo.newCounter,
  );

  return completeConfirmedSend(ctx);
}
