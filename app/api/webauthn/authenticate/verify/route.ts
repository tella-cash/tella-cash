import { NextResponse } from "next/server";
import {
  verifyAuthenticationResponse,
  type VerifyAuthenticationResponseOpts,
} from "@simplewebauthn/server";

type AuthenticationResponseJSON = VerifyAuthenticationResponseOpts["response"];
import { loadConfirmContext } from "@/lib/confirm/context";
import { getWebAuthnConfig } from "@/lib/webauthn/config";
import {
  bumpCredentialCounter,
  consumeChallenge,
  findCredentialById,
} from "@/lib/webauthn/repository";
import {
  executePendingSend,
  formatSendResultForChat,
} from "@/lib/sends/execute";
import { sendWhatsAppMessage } from "@/lib/twilio/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/webauthn/authenticate/verify
 *
 * Verifies the assertion produced by `navigator.credentials.get(...)`.
 * On success this is the gate the whole feature exists for: we run the
 * pending send and DM the user the result back through WhatsApp so the
 * confirmation lives in their chat history, not just the browser tab
 * they're about to close.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    token?: string;
    response?: AuthenticationResponseJSON;
  };
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

  const credential = await findCredentialById(body.response.id);
  if (!credential || credential.user_id !== ctx.user.id) {
    return NextResponse.json(
      { error: "Unknown credential" },
      { status: 400 },
    );
  }

  const expectedChallenge = await consumeChallenge({
    userId: ctx.user.id,
    kind: "authentication",
  });
  if (!expectedChallenge) {
    return NextResponse.json(
      { error: "No active authentication challenge" },
      { status: 400 },
    );
  }

  const config = getWebAuthnConfig();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      requireUserVerification: true,
      credential: {
        id: credential.credential_id,
        publicKey: credential.public_key,
        counter: credential.counter,
        transports: (credential.transports ?? undefined) as
          | AuthenticatorTransportFuture[]
          | undefined,
      },
    });
  } catch (err) {
    console.error("[webauthn] auth verify failed", { err });
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 400 },
    );
  }

  if (!verification.verified) {
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 400 },
    );
  }

  await bumpCredentialCounter({
    credentialId: credential.credential_id,
    counter: verification.authenticationInfo.newCounter,
  });

  const result = await executePendingSend({
    user: ctx.user,
    pending: ctx.pending,
  });

  // Always notify in chat — the user will close the browser tab and
  // expect the receipt where their other UPay messages live.
  try {
    await sendWhatsAppMessage({
      to: ctx.user.whatsapp_number,
      body: formatSendResultForChat(result),
    });
  } catch (err) {
    console.error("[webauthn] follow-up message failed", { err });
  }

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    transactionId: result.transactionId,
    amount: result.amount,
    token: result.token,
    recipientLabel: result.recipientLabel,
  });
}

type AuthenticatorTransportFuture =
  | "ble"
  | "cable"
  | "hybrid"
  | "internal"
  | "nfc"
  | "smart-card"
  | "usb";
