import { NextResponse } from "next/server";
import { loadConfirmContext } from "@/lib/confirm/context";
import { readJson } from "@/lib/http/json";
import { isValidPin, setPinForUser } from "@/lib/auth/pin";

export const dynamic = "force-dynamic";

/**
 * POST /api/confirm/pin/setup
 *
 * Lazily sets the user's PIN the first time they confirm a send on a
 * device without WebAuthn support. We don't expose this anywhere else —
 * it's tied to an active confirm token so a leaked endpoint can't be
 * used to overwrite a PIN out-of-band.
 *
 * If the user already has a PIN we reject — they must verify the
 * existing one rather than silently rotate it.
 */
export async function POST(request: Request) {
  const parsed = await readJson<{ token?: string; pin?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (!body.token || !body.pin) {
    return NextResponse.json(
      { error: "Missing token or pin" },
      { status: 400 },
    );
  }

  if (!isValidPin(body.pin)) {
    return NextResponse.json(
      { error: "PIN must be 4–8 digits" },
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

  if (ctx.user.pin_hash) {
    return NextResponse.json(
      { error: "PIN already set" },
      { status: 409 },
    );
  }

  await setPinForUser({ userId: ctx.user.id, pin: body.pin });
  return NextResponse.json({ ok: true });
}
