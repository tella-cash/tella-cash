import { createHash, randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Sign in with Google, for the two jobs it is trusted with.
 *
 * Authorization code flow with PKCE. PKCE is not strictly required for a
 * confidential client holding a secret, but it costs one hash and removes the
 * whole class of attack where an intercepted code is redeemed by someone
 * else — worth it on a flow that can freeze a wallet.
 *
 * There is deliberately NO session at the end of this. Each Google sign-in
 * authorizes exactly one action and then it is over. That is unusual, and it
 * is the point: a cookie on a custodial wallet is a strictly larger bearer
 * credential than anything else this app issues, and nothing here needs one.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/** What the sign-in is being used for. Decides what happens on return. */
export type GooglePurpose = "freeze" | "unfreeze" | "link" | "admin";

function config() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = process.env.APP_BASE_URL;
  if (!clientId || !clientSecret || !baseUrl) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET or APP_BASE_URL",
    );
  }
  return {
    clientId,
    clientSecret,
    redirectUri: `${baseUrl.replace(/\/$/, "")}/api/auth/google/callback`,
  };
}

function stateSecret(): string {
  const secret = process.env.GOOGLE_STATE_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing GOOGLE_STATE_SECRET");
  return secret;
}

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The `state` parameter, signed rather than stored.
 *
 * It has to survive a round trip through Google and come back trustworthy,
 * and it carries the PKCE verifier plus what the user was trying to do. An
 * HMAC over the payload gives that without a table or a cookie: nothing here
 * is secret from the user, only unforgeable by anyone else, and it expires.
 */
interface StatePayload {
  purpose: GooglePurpose;
  verifier: string;
  /** Present only for 'link', where we already know whose account it is. */
  token?: string;
  exp: number;
}

export function encodeState(payload: StatePayload): string {
  const body = base64url(Buffer.from(JSON.stringify(payload)));
  const sig = base64url(createHmac("sha256", stateSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function decodeState(state: string): StatePayload | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;

  const expected = base64url(createHmac("sha256", stateSecret()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
    ) as StatePayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Ten minutes: long enough to sign in, short enough not to sit around. */
const STATE_TTL_MS = 10 * 60 * 1000;

export function buildAuthUrl({
  purpose,
  token,
}: {
  purpose: GooglePurpose;
  token?: string;
}): string {
  const { clientId, redirectUri } = config();

  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = encodeState({ purpose, verifier, token, exp: Date.now() + STATE_TTL_MS });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    // openid + email only. This app has no business reading a contact list,
    // and every extra scope is something to justify on a consent screen that
    // a frightened person is reading in a hurry.
    scope: "openid email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });

  return `${AUTH_ENDPOINT}?${params}`;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
}

/**
 * Exchange the code and verify the ID token.
 *
 * The token comes back over a direct, authenticated, TLS-protected channel
 * from Google's own token endpoint, so the signature has already been
 * transported trustworthily. The checks below are the ones that still matter:
 * issuer, audience, and expiry. Anything claiming otherwise is not ours.
 */
export async function exchangeCode({
  code,
  verifier,
}: {
  code: string;
  verifier: string;
}): Promise<GoogleIdentity> {
  const { clientId, clientSecret, redirectUri } = config();

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("Google returned no id_token");

  return verifyIdToken(data.id_token);
}

function verifyIdToken(idToken: string): GoogleIdentity {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed id_token");

  const claims = JSON.parse(
    Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
  ) as {
    iss?: string;
    aud?: string;
    sub?: string;
    email?: string;
    email_verified?: boolean;
    exp?: number;
  };

  const { clientId } = config();

  if (!claims.iss || !ISSUERS.includes(claims.iss)) {
    throw new Error(`Unexpected id_token issuer: ${claims.iss}`);
  }
  if (claims.aud !== clientId) {
    throw new Error("id_token audience does not match this client");
  }
  if (!claims.exp || claims.exp * 1000 < Date.now()) {
    throw new Error("id_token has expired");
  }
  if (!claims.sub) throw new Error("id_token carries no subject");
  if (!claims.email) throw new Error("id_token carries no email");

  return {
    sub: claims.sub,
    email: claims.email,
    emailVerified: Boolean(claims.email_verified),
  };
}

/** JWKS endpoint, kept for reference by anyone hardening this further. */
export const GOOGLE_JWKS_URI = JWKS_URI;

export interface GoogleLink {
  user_id: string;
  google_sub: string;
  google_email: string;
  email_verified: boolean;
  linked_at: string;
  last_verified_at: string | null;
}

/** Resolve a Google subject to a tella account. Never matches on email. */
export async function findUserByGoogleSub(sub: string): Promise<GoogleLink | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_google_identity")
    .select("*")
    .eq("google_sub", sub)
    .maybeSingle();

  if (error) throw new Error(`findUserByGoogleSub failed: ${error.message}`);
  return (data as GoogleLink | null) ?? null;
}

export async function getGoogleLink(userId: string): Promise<GoogleLink | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_google_identity")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`getGoogleLink failed: ${error.message}`);
  return (data as GoogleLink | null) ?? null;
}

export async function linkGoogleIdentity({
  userId,
  identity,
}: {
  userId: string;
  identity: GoogleIdentity;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("tella_google_identity").upsert(
    {
      user_id: userId,
      google_sub: identity.sub,
      google_email: identity.email,
      email_verified: identity.emailVerified,
      last_verified_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) throw new Error(`linkGoogleIdentity failed: ${error.message}`);
}
