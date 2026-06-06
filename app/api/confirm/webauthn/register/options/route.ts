import { NextResponse } from "next/server";
import { loadConfirmContext } from "@/lib/confirm/context";
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
  const body = (await request.json()) as { token?: string };
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

  const options = await buildRegistrationOptions(ctx.user);
  await saveChallenge(ctx.user.id, "registration", options.challenge);
  return NextResponse.json(options);
}
