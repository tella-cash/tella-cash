import { NextResponse } from "next/server";
import { loadConfirmContext } from "@/lib/confirm/context";
import { readJson } from "@/lib/http/json";
import { isValidPin, setPinForUser } from "@/lib/auth/pin";
import { userHasCredential } from "@/lib/webauthn/repository";

export const dynamic = "force-dynamic";

/**
 * POST /api/confirm/pin/setup
 *
 * Lazily sets the user's PIN the first time they confirm a send on a
 * device without WebAuthn support. We don't expose this anywhere else —
 * it's tied to an active confirm token so a leaked endpoint can't be
 * used to overwrite a PIN out-of-band.
 *
 * Refused once the account has ANY factor, not just a PIN. Holding a
 * confirm link proves possession of the link, not of the account, so
 * enrolling a factor may only double as authorization while the account
 * has none — the same invariant the WebAuthn register routes state and
 * enforce. This route used to check `pin_hash` alone, which left a
 * passkey-only account open: anyone holding a live confirm link could
 * plant a PIN with no factor proven, use it to authorize the pending
 * send, and keep it as a permanent credential afterwards. A passkey
 * holder who wants a PIN as well goes through the recovery flow, which
 * is the only path allowed to write a PIN onto an account that already
 * has a factor.
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

  if (ctx.user.pin_hash || (await userHasCredential(ctx.user.id))) {
    return NextResponse.json(
      { error: "This account already has a confirmation method set up." },
      { status: 409 },
    );
  }

  await setPinForUser({ userId: ctx.user.id, pin: body.pin });
  return NextResponse.json({ ok: true });
}
