import { NextResponse } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { readJson } from "@/lib/http/json";
import { loadLinkContext, markTokenAuthorized } from "@/lib/security/reset-tokens";
import { recordAuthAttempt, resetAuthAttempts, formatRetryAfter } from "@/lib/auth/rate-limit";
import { proveFactor } from "@/lib/auth/prove-factor";
import { isFrozen } from "@/lib/users/wallet-gate";
import { inFactorChangeWindow, FACTOR_CHANGE_HOLD_HOURS } from "@/lib/sends/tiers";
import { telegramDeepLink } from "@/lib/telegram/deep-link";

export const dynamic = "force-dynamic";

/**
 * POST /api/security/link/authorize
 *
 * The step that makes a channel link require the account's PIN or passkey.
 *
 * "link telegram" and "link google" used to check only that a factor EXISTED,
 * so anyone holding the phone for a few minutes could attach their own
 * Telegram or Google account — a way in that outlived their access to the
 * phone. The link token now does nothing until its owner proves a factor here.
 *
 * Also refused inside the post-change window. A PIN reset needs only the
 * chat, so without this, holding the phone was enough to reset the PIN and
 * then prove the PIN just chosen.
 *
 * The token is NOT consumed here. It is consumed where the link completes —
 * the Telegram /start handler or the Google callback — which is what proves
 * control of the other end.
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

  const ctx = await loadLinkContext(body.token);
  if (!ctx) {
    return NextResponse.json(
      { error: "This link is invalid, already used, or expired." },
      { status: 404 },
    );
  }

  if (isFrozen(ctx.user)) {
    return NextResponse.json(
      { error: "Your account is frozen, so nothing new can be linked to it." },
      { status: 409 },
    );
  }

  if (inFactorChangeWindow(ctx.user.factors_changed_at)) {
    return NextResponse.json(
      {
        error: `Your PIN, passkeys or linked accounts changed in the last ${FACTOR_CHANGE_HOLD_HOURS} hours, so new links are paused for now. Try again later.`,
      },
      { status: 409 },
    );
  }

  const attempt = await recordAuthAttempt(ctx.user.id, "pin_verify");
  if (!attempt.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${formatRetryAfter(attempt.retryAfterSeconds)}.` },
      { status: 429 },
    );
  }

  const proved = await proveFactor({
    user: ctx.user,
    pin: body.pin,
    assertion: body.assertion,
  });

  if (!proved) {
    return NextResponse.json({ error: "That didn't match. Try again." }, { status: 401 });
  }

  await resetAuthAttempts(ctx.user.id, "pin_verify");

  // Not the token id: that is already in the chat. The handoff carries a
  // secret that only this response ever contains.
  const handoff = await markTokenAuthorized(ctx.token);
  if (!handoff) {
    return NextResponse.json({ error: "This link has already been used." }, { status: 409 });
  }

  let next: string;
  if (ctx.token.kind === "link_telegram") {
    const deepLink = telegramDeepLink(handoff);
    if (!deepLink) {
      return NextResponse.json(
        { error: "Telegram isn't set up yet on our side. Try again later." },
        { status: 503 },
      );
    }
    next = deepLink;
  } else {
    const base = process.env.APP_BASE_URL;
    if (!base) {
      return NextResponse.json({ error: "Not configured." }, { status: 503 });
    }
    next = `${base.replace(/\/$/, "")}/api/auth/google/start?purpose=link&token=${encodeURIComponent(handoff)}`;
  }

  console.log("[security] link authorized", { userId: ctx.user.id, kind: ctx.token.kind });
  return NextResponse.json({ ok: true, kind: ctx.token.kind, next });
}
