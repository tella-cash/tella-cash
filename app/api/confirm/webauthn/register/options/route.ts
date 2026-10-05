import { NextResponse } from "next/server";
import { loadConfirmContext } from "@/lib/confirm/context";
import { authorizeEnrollment } from "@/lib/confirm/enroll-gate";
import { readJson } from "@/lib/http/json";
import { buildRegistrationOptions } from "@/lib/webauthn/server";
import { saveChallenge } from "@/lib/webauthn/repository";

export const dynamic = "force-dynamic";

/**
 * POST /api/confirm/webauthn/register/options
 *
 * Begins passkey enrollment: returns the registration options the browser
 * passes to `startRegistration`, and stashes the challenge for the verify
 * step. Tied to an active confirm token so enrollment can only happen in
 * the context of a real pending send.
 *
 * An account with a PIN may add Face ID / fingerprint only by sending that PIN
 * here (and again to /register/verify); see lib/confirm/enroll-gate.ts.
 */
export async function POST(request: Request) {
  const parsed = await readJson<{ token?: string; pin?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (!body.token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const ctx = await loadConfirmContext(body.token);
  if (!ctx) {
    return NextResponse.json(
      { error: "Confirmation link is invalid or expired" },
      { status: 404 },
    );
  }

  // Same guard as register/verify, applied here so the ceremony never even
  // starts for an account that has not earned it.
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

  const options = await buildRegistrationOptions(ctx.user);
  await saveChallenge(ctx.user.id, "registration", options.challenge);
  return NextResponse.json(options);
}
