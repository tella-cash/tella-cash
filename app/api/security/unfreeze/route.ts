import { NextResponse } from "next/server";
import { readJson } from "@/lib/http/json";
import { loadResetContext, consumeResetToken } from "@/lib/security/reset-tokens";
import { verifyPin } from "@/lib/auth/pin";
import { recordAuthAttempt, resetAuthAttempts, formatRetryAfter } from "@/lib/auth/rate-limit";
import { unfreezeAccount } from "@/lib/users/freeze";
import { isFrozen } from "@/lib/users/wallet-gate";
import { verifyAuthentication } from "@/lib/webauthn/server";
import { consumeChallenge, listCredentials, updateCredentialCounter } from "@/lib/webauthn/repository";
import { getGoogleLink } from "@/lib/google/oauth";
import { notifyUser } from "@/lib/messaging/notify";
import { sendSecurityEmail } from "@/lib/email/client";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/security/unfreeze
 *
 * The second factor in the unfreeze flow. Google already established identity
 * to mint this token; this route establishes that the person also holds
 * something set up BEFORE the freeze — which is the property an attacker who
 * arrived afterwards cannot satisfy.
 *
 * The token is consumed only on success. A wrong PIN should cost an attempt,
 * not the user's one chance at getting back in.
 */
export async function POST(request: Request) {
  const parsed = await readJson<{
    token?: string;
    pin?: string;
    assertion?: AuthenticationResponseJSON;
  }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  if (!body.token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const ctx = await loadResetContext(body.token, "unfreeze");
  if (!ctx) {
    return NextResponse.json(
      { error: "This link is invalid, already used, or expired." },
      { status: 404 },
    );
  }

  if (!isFrozen(ctx.user)) {
    return NextResponse.json({ ok: true, alreadyActive: true });
  }

  const attempt = await recordAuthAttempt(ctx.user.id, "pin_verify");
  if (!attempt.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${formatRetryAfter(attempt.retryAfterSeconds)}.` },
      { status: 429 },
    );
  }

  let proved = false;

  if (body.assertion) {
    const challenge = await consumeChallenge(ctx.user.id, "authentication");
    const credentials = challenge ? await listCredentials(ctx.user.id) : [];
    const credential = credentials.find((c) => c.credential_id === body.assertion!.id);

    if (challenge && credential) {
      try {
        const verification = await verifyAuthentication(
          body.assertion,
          challenge,
          credential,
        );
        if (verification.verified) {
          await updateCredentialCounter(
            credential.credential_id,
            verification.authenticationInfo.newCounter,
          );
          proved = true;
        }
      } catch (err) {
        console.error("[security] unfreeze passkey verify threw", { err });
      }
    }
  } else if (body.pin) {
    proved = ctx.user.pin_hash ? await verifyPin(body.pin, ctx.user.pin_hash) : false;
  }

  if (!proved) {
    return NextResponse.json(
      { error: "That didn't match. Try again." },
      { status: 401 },
    );
  }

  await consumeResetToken(ctx.token.id);
  await resetAuthAttempts(ctx.user.id, "pin_verify");
  await unfreezeAccount({ userId: ctx.user.id, source: "web" });

  const link = await getGoogleLink(ctx.user.id);

  await Promise.allSettled([
    notifyUser({
      user: ctx.user,
      body: [
        "✅ Your account has been unfrozen. You can send money again.",
        "",
        "If this wasn't you, reply *freeze* immediately.",
      ].join("\n"),
    }),
    link
      ? sendSecurityEmail({
          to: link.google_email,
          kind: "account_unfrozen",
          subject: "Your tella account was unfrozen",
          lines: [
            "The freeze on your tella wallet has been lifted, and it can send money again.",
            "",
            "If this wasn't you, message tella on WhatsApp immediately and say freeze.",
          ],
        })
      : Promise.resolve(false),
  ]);

  console.log("[security] account unfrozen via web", { userId: ctx.user.id });
  return NextResponse.json({ ok: true });
}
