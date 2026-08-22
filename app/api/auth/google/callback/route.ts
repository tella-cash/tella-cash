import { NextResponse } from "next/server";
import {
  decodeState,
  exchangeCode,
  findUserByGoogleSub,
  getGoogleLink,
  linkGoogleIdentity,
} from "@/lib/google/oauth";
import { loadResetContext, consumeResetToken, createResetToken } from "@/lib/security/reset-tokens";
import { findUserById } from "@/lib/users/repository";
import { freezeAccount } from "@/lib/users/freeze";
import { isFrozen } from "@/lib/users/wallet-gate";
import { factorsPredating } from "@/lib/auth/factors";
import { notifyUser } from "@/lib/messaging/notify";
import { sendSecurityEmail } from "@/lib/email/client";
import { adminCookieOptions, isAdminSub, issueAdminCookie } from "@/lib/admin/session";

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
  if (error) return fail(origin, "Sign-in was cancelled.");

  const code = searchParams.get("code");
  const rawState = searchParams.get("state");
  if (!code || !rawState) return fail(origin, "Sign-in didn't complete. Try again.");

  const state = decodeState(rawState);
  if (!state) return fail(origin, "That sign-in link expired. Start again.");

  let identity;
  try {
    identity = await exchangeCode({ code, verifier: state.verifier });
  } catch (err) {
    console.error("[google] code exchange failed", err);
    return fail(origin, "Couldn't verify that Google account. Try again.");
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
      return fail(origin, "That account doesn't have dashboard access.");
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
    return fail(
      origin,
      "That Google account isn't connected to a tella wallet. Ask tella on WhatsApp to link it first.",
    );
  }

  const user = await findUserById(link.user_id);
  if (!user) return fail(origin, "Couldn't find that account.");

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
    return fail(
      origin,
      "This account has no PIN or passkey set, so I can't safely unfreeze it from here. Message tella on WhatsApp and we'll sort it out.",
    );
  }

  const token = await createResetToken(user.id, "unfreeze");
  return NextResponse.redirect(`${origin}/security/unfreeze/${token.id}`);
}

async function handleLink(
  origin: string,
  token: string,
  identity: Awaited<ReturnType<typeof exchangeCode>>,
) {
  const ctx = await loadResetContext(token, "link_google");
  if (!ctx) return fail(origin, "That link expired. Ask tella on WhatsApp for a new one.");

  const existing = await findUserByGoogleSub(identity.sub);
  if (existing && existing.user_id !== ctx.user.id) {
    // One Google account, one wallet. Otherwise a single Google compromise
    // reaches several accounts and the freeze door becomes a skeleton key.
    return fail(origin, "That Google account is already connected to another tella wallet.");
  }

  const consumed = await consumeResetToken(ctx.token.id);
  if (!consumed) return fail(origin, "That link has already been used.");

  await linkGoogleIdentity({ userId: ctx.user.id, identity });

  const alreadyLinked = await getGoogleLink(ctx.user.id);

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
  ]);

  console.log("[google] identity linked", { userId: ctx.user.id, relinked: Boolean(alreadyLinked) });
  return done(origin, "linked", "0");
}

function done(origin: string, result: string, count: string) {
  return NextResponse.redirect(`${origin}/security/result?r=${result}&n=${count}`);
}

function fail(origin: string, message: string) {
  return NextResponse.redirect(
    `${origin}/security/result?r=error&m=${encodeURIComponent(message)}`,
  );
}
