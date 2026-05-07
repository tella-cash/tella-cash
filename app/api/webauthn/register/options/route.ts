import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { loadConfirmContext } from "@/lib/confirm/context";
import { getWebAuthnConfig } from "@/lib/webauthn/config";
import {
  listCredentialsForUser,
  putChallenge,
} from "@/lib/webauthn/repository";

export const dynamic = "force-dynamic";

/**
 * POST /api/webauthn/register/options
 *
 * First leg of the WebAuthn registration ceremony. The browser will use
 * the returned `PublicKeyCredentialCreationOptionsJSON` to invoke
 * `navigator.credentials.create(...)`, which prompts the user to enroll
 * a platform authenticator (Face ID, Touch ID, Android biometric).
 *
 * `excludeCredentials` blocks the same authenticator from registering
 * twice — if the user re-runs registration on the same device, the
 * browser surfaces a friendly "already registered" error instead of
 * silently creating a duplicate.
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

  const config = getWebAuthnConfig();
  const existing = await listCredentialsForUser(ctx.user.id);

  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userID: new TextEncoder().encode(ctx.user.id),
    userName: ctx.user.whatsapp_number,
    userDisplayName: ctx.user.profile_name ?? ctx.user.whatsapp_number,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
      authenticatorAttachment: "platform",
    },
    excludeCredentials: existing.map((c) => ({
      id: c.credential_id,
      transports: (c.transports ?? undefined) as
        | AuthenticatorTransportFuture[]
        | undefined,
    })),
  });

  await putChallenge({
    userId: ctx.user.id,
    kind: "registration",
    challenge: options.challenge,
  });

  return NextResponse.json(options);
}

// Type alias to keep this file isolated from the @simplewebauthn/types
// package — the transports list is a subset of the WebAuthn spec value.
type AuthenticatorTransportFuture =
  | "ble"
  | "cable"
  | "hybrid"
  | "internal"
  | "nfc"
  | "smart-card"
  | "usb";
