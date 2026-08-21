import { NextResponse } from "next/server";
import { loadConfirmContext } from "@/lib/confirm/context";
import { readJson } from "@/lib/http/json";
import { buildAuthenticationOptions } from "@/lib/webauthn/server";
import { saveChallenge } from "@/lib/webauthn/repository";

export const dynamic = "force-dynamic";

/**
 * POST /api/confirm/webauthn/authenticate/options
 *
 * Begins a passkey assertion for a returning user: returns the options the
 * browser passes to `startAuthentication`, and stashes the challenge for
 * verification.
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

  const options = await buildAuthenticationOptions(ctx.user);
  await saveChallenge(ctx.user.id, "authentication", options.challenge);
  return NextResponse.json(options);
}
