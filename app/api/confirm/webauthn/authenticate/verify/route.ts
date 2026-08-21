import { NextResponse } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { loadConfirmContext } from "@/lib/confirm/context";
import { readJson } from "@/lib/http/json";
import { completeConfirmedSend } from "@/lib/confirm/complete";
import { verifyAuthentication } from "@/lib/webauthn/server";
import {
  consumeChallenge,
  listCredentials,
  updateCredentialCounter,
} from "@/lib/webauthn/repository";
import {
  recordAuthAttempt,
  resetAuthAttempts,
  formatRetryAfter,
} from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/confirm/webauthn/authenticate/verify
 *
 * Verifies a returning user's passkey assertion and, on success, executes
 * the pending send and DMs the receipt — same downstream effect as the PIN
 * verify route.
 */
export async function POST(request: Request) {
  const parsed = await readJson<{
    token?: string;
    response?: AuthenticationResponseJSON;
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

  // Forged assertions are far more expensive to grind than a 4-digit PIN,
  // but the same counter keeps the confirm link from being a free harness
  // for hammering credential IDs.
  const attempt = await recordAuthAttempt(ctx.user.id, "webauthn_authenticate");
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

  await resetAuthAttempts(ctx.user.id, "webauthn_authenticate");

  await updateCredentialCounter(
    credential.credential_id,
    verification.authenticationInfo.newCounter,
  );

  return completeConfirmedSend(ctx);
}
