import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { loadConfirmContext } from "@/lib/confirm/context";
import { getWebAuthnConfig } from "@/lib/webauthn/config";
import {
  listCredentialsForUser,
  putChallenge,
} from "@/lib/webauthn/repository";

export const dynamic = "force-dynamic";

/**
 * POST /api/webauthn/authenticate/options
 *
 * First leg of authentication. We list this user's registered
 * credentials and ask the platform to assert with one of them. If the
 * user has no credentials yet the page should send them through
 * `/register/options` first.
 *
 * `userVerification: "required"` enforces a biometric (or device PIN as
 * fallback) — without it some authenticators would silently sign with
 * just possession, defeating the point of the gate.
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

  const credentials = await listCredentialsForUser(ctx.user.id);
  if (credentials.length === 0) {
    return NextResponse.json(
      { error: "No credentials registered" },
      { status: 409 },
    );
  }

  const config = getWebAuthnConfig();
  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    userVerification: "required",
    allowCredentials: credentials.map((c) => ({
      id: c.credential_id,
      transports: (c.transports ?? undefined) as
        | AuthenticatorTransportFuture[]
        | undefined,
    })),
  });

  await putChallenge({
    userId: ctx.user.id,
    kind: "authentication",
    challenge: options.challenge,
  });

  return NextResponse.json(options);
}

type AuthenticatorTransportFuture =
  | "ble"
  | "cable"
  | "hybrid"
  | "internal"
  | "nfc"
  | "smart-card"
  | "usb";
