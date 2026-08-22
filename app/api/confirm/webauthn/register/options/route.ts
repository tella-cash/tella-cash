import { NextResponse } from "next/server";
import { loadConfirmContext } from "@/lib/confirm/context";
import { canEnrollFromConfirmLink } from "@/lib/auth/factors";
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
 */
export async function POST(request: Request) {
  const parsed = await readJson<{ token?: string }>(request);
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
  // starts for an account that already has a factor.
  if (!(await canEnrollFromConfirmLink(ctx.user))) {
    return NextResponse.json(
      { error: "This account already has a confirmation method set up." },
      { status: 409 },
    );
  }

  const options = await buildRegistrationOptions(ctx.user);
  await saveChallenge(ctx.user.id, "registration", options.challenge);
  return NextResponse.json(options);
}
