import { NextResponse } from "next/server";
import { readJson } from "@/lib/http/json";
import { loadResetContext } from "@/lib/security/reset-tokens";
import { buildAuthenticationOptions } from "@/lib/webauthn/server";
import { saveChallenge } from "@/lib/webauthn/repository";

export const dynamic = "force-dynamic";

/**
 * POST /api/security/unfreeze/options
 *
 * WebAuthn challenge for the unfreeze step. Gated on the same single-use
 * token, so a challenge can only be requested by someone Google has already
 * identified.
 */
export async function POST(request: Request) {
  const parsed = await readJson<{ token?: string }>(request);
  if (!parsed.ok) return parsed.response;

  if (!parsed.body.token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const ctx = await loadResetContext(parsed.body.token, "unfreeze");
  if (!ctx) {
    return NextResponse.json({ error: "This link is invalid or expired." }, { status: 404 });
  }

  const options = await buildAuthenticationOptions(ctx.user);
  await saveChallenge(ctx.user.id, "authentication", options.challenge);
  return NextResponse.json(options);
}
