import { NextResponse } from "next/server";
import {
  decodeState,
  exchangeCode,
  findUserByGoogleSub,
  getGoogleLink,
  linkGoogleIdentity,
} from "@/lib/google/oauth";
import {
  loadAuthorizedLink,
  consumeResetToken,
  createResetToken,
} from "@/lib/security/reset-tokens";
import { freezeAccount } from "@/lib/users/freeze";
import { isFrozen } from "@/lib/users/wallet-gate";
import { factorsPredating } from "@/lib/auth/factors";
import { notifyUser } from "@/lib/messaging/notify";
import { sendSecurityEmail } from "@/lib/email/client";
import { adminCookieOptions, isAdminSub, issueAdminCookie } from "@/lib/admin/session";
import { findUserById, markFactorsChanged } from "@/lib/users/repository";
import { inFactorChangeWindow } from "@/lib/sends/tiers";
import type { ResultErrorCode } from "@/lib/security/result-errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google/callback
 *
 * Where the asymmetry that defines this whole feature is enforced.
 *
 *   FREEZE   → Google alone is enough. The person who most needs this button
 *              has no phone to prove anything else with, and the worst an
 *              attacker achieves by pressing it is inconveniencing someone.
 *
 *   UNFREEZE → Google is necessary and NOT sufficient. It mints a short-lived
 *              token and hands off to a page that also demands a factor which
 *              existed before the freeze. Once Google is accepted as a
 *              recovery factor, a compromised Google account would otherwise
 *              be a compromised wallet — and Google's own recovery is often
 *              phone-based, so it is not as independent of the SIM as it
 *              looks.
 *
 *   LINK     → authorized by a token minted on an already-authenticated
 *              channel, so identity is already established; Google is being
 *              attached, not trusted.
 *
 * If this is ever refactored, that asymmetry is the thing to preserve.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const error = searchParams.get("error");
  if (error) return fail(origin, "cancelled");

  const code = searchParams.get("code");
  const rawState = searchParams.get("state");
  if (!code || !rawState) return fail(origin, "incomplete");

  const state = decodeState(rawState);
  if (!state) return fail(origin, "state_expired");

  let identity;
  try {
    identity = await exchangeCode({ code, verifier: state.verifier });
  } catch (err) {
    console.error("[google] code exchange failed", err);
    return fail(origin, "google_unverified");
  }

  if (state.purpose === "link") {
    return handleLink(origin, state.token!, identity);
  }

  if (state.purpose === "admin") {
    // Checked against the allowlist, not against a tella account. An admin
    // need not be a wallet user, and a wallet user is emphatically not an
    // admin — these are separate questions and conflating them is how a
    // dashboard ends up reachable by anyone who linked Google.
    if (!isAdminSub(identity.sub)) {
      // The full sub, deliberately. It is not a secret — it is the value
      // that has to go into ADMIN_GOOGLE_SUBS, and making an operator hunt
      // for it is how people end up pasting an email address instead.
      console.warn("[admin] rejected sign-in — add this sub to ADMIN_GOOGLE_SUBS if intended", {
        sub: identity.sub,
        email: identity.email,
      });
      return fail(origin, "no_admin_access");
    }

    const response = NextResponse.redirect(`${origin}/admin`);
    response.cookies.set({
      ...adminCookieOptions(),
      value: issueAdminCookie({ sub: identity.sub, email: identity.email }),
    });
    console.log("[admin] signed in", { email: identity.email });
    return response;
  }

  // freeze and unfreeze both start from "who is this", answered only by the
  // Google subject. No account linked to it means no account to act on, and
  // the message must not reveal which of those two it was.
  const link = await findUserByGoogleSub(identity.sub);
  if (!link) {
    return fail(origin, "google_not_linked");
  }

  const user = await findUserById(link.user_id);
  if (!user) return fail(origin, "account_missing");

  if (state.purpose === "freeze") {
    if (isFrozen(user)) {
      return done(origin, "frozen", "0");
    }

    const { cancelledSends, cancelledHolds } = await freezeAccount({
      userId: user.id,
      source: "web",
      reason: "google sign-in on the freeze page",
    });

    await Promise.allSettled([
      notifyUser({
        user,
        body: [
          "🔒 Your account was frozen from the web using your Google account.",
          "",
          "Nothing can leave your wallet. You can still receive money.",
          "",
          "If this wasn't you, reply here straight away.",
        ].join("\n"),
      }),
      sendSecurityEmail({
        to: link.google_email,
        kind: "account_frozen",
        subject: "Your tella account was frozen",
        lines: [
          "Your tella wallet was just frozen. Nothing can leave it.",
          "",
          "You can still receive money, and your balance is untouched.",
          "",
          "If this wasn't you, message tella on WhatsApp immediately.",
        ],
      }),
    ]);

    return done(origin, "frozen", String(cancelledSends + cancelledHolds));
  }

  // UNFREEZE. Google has established who this is; it has NOT established that
  // they should get the account back.
  if (!isFrozen(user)) {
    return done(origin, "not-frozen", "0");
  }

  if (!(await factorsPredating(user, user.frozen_at!)).any) {
    // Nothing predates the freeze, so there is nothing to prove. Refusing
    // here is the honest answer: this needs a person, not a second click.
    return fail(origin, "no_factor");
  }

  const token = await createResetToken(user.id, "unfreeze");
  return NextResponse.redirect(`${origin}/security/unfreeze/${token.id}`);
}

async function handleLink(
  origin: string,
  token: string,
  identity: Awaited<ReturnType<typeof exchangeCode>>,
) {
  // `token` is the "<id>_<secret>" handoff minted when the account's PIN or
  // passkey was proven on /security/link/<id>. The bare id went to the chat,
  // so without the secret, holding or reading the chat would be enough to
  // attach a Google account that can freeze the wallet and receives every
  // security email.
  const ctx = await loadAuthorizedLink(token, "link_google");
  if (!ctx) return fail(origin, "link_unconfirmed");
  if (inFactorChangeWindow(ctx.user.factors_changed_at)) return fail(origin, "link_paused");

  const existing = await findUserByGoogleSub(identity.sub);
  if (existing && existing.user_id !== ctx.user.id) {
    // One Google account, one wallet. Otherwise a single Google compromise
    // reaches several accounts and the freeze door becomes a skeleton key.
    return fail(origin, "google_taken");
  }

  const consumed = await consumeResetToken(ctx.token.id);
  if (!consumed) return fail(origin, "link_used");

  // Read BEFORE the upsert, which replaces it. The address being replaced is
  // the one that most needs telling: if this relink wasn't the owner, it is
  // their only remaining way to hear about it.
  const previous = await getGoogleLink(ctx.user.id);

  await linkGoogleIdentity({ userId: ctx.user.id, identity });

  try {
    await markFactorsChanged(ctx.user.id);
  } catch (err) {
    console.error("[google] marking factors changed failed", { userId: ctx.user.id, err });
  }

  const replaced = previous && previous.google_sub !== identity.sub ? previous : null;

  await Promise.allSettled([
    notifyUser({
      user: ctx.user,
      body: [
        `🔗 ${identity.email} was just connected to your tella wallet.`,
        "",
        "You can now freeze your account from the web even without your phone.",
        "",
        "If this wasn't you, reply *freeze* immediately.",
      ].join("\n"),
    }),
    sendSecurityEmail({
      to: identity.email,
      kind: "google_linked",
      subject: "This email is now connected to a tella wallet",
      lines: [
        "This Google account was just connected to a tella wallet.",
        "",
        "You'll get security notices here, and you can freeze the wallet from the web if the phone is ever lost.",
        "",
        "If you don't recognise this, reply to this email.",
      ],
    }),
    replaced
      ? sendSecurityEmail({
          to: replaced.google_email,
          kind: "google_linked",
          subject: "This email was disconnected from your tella wallet",
          lines: [
            `A different Google account (${identity.email}) was just connected to your tella wallet in place of this one.`,
            "",
            "This address will no longer get security notices or be able to freeze the wallet.",
            "",
            "If this wasn't you, message tella immediately and say freeze.",
          ],
        })
      : Promise.resolve(false),
  ]);

  console.log("[google] identity linked", { userId: ctx.user.id, relinked: Boolean(previous) });
  return done(origin, "linked", "0");
}

function done(origin: string, result: string, count: string) {
  return NextResponse.redirect(`${origin}/security/result?r=${result}&n=${count}`);
}

function fail(origin: string, code: ResultErrorCode) {
  return NextResponse.redirect(`${origin}/security/result?r=error&e=${code}`);
}
