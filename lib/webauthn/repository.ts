import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Persistence for WebAuthn passkeys and in-flight ceremony challenges.
 *
 * Credentials live in `tella_webauthn_credentials` (public_key as base64url
 * text). Challenges live in `tella_webauthn_challenges` — Vercel Functions
 * are stateless between the options and verify calls, so the challenge can't
 * be held in memory and is persisted for the brief window between them.
 */

export interface StoredCredential {
  credential_id: string;
  public_key: string; // base64url COSE key
  counter: number;
  transports: string[] | null;
}

export type ChallengeKind = "registration" | "authentication";

const CHALLENGE_TTL_SECONDS = 300;

export async function listCredentials(
  userId: string,
): Promise<StoredCredential[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_webauthn_credentials")
    .select("credential_id, public_key, counter, transports")
    .eq("user_id", userId);

  if (error) throw new Error(`listCredentials: ${error.message}`);
  return (data ?? []) as StoredCredential[];
}

/**
 * When this user's oldest passkey was registered, or null if they have none.
 *
 * Kept separate from listCredentials rather than widening its select: that
 * one feeds the authentication ceremony, and this is a question about the
 * account's history. Only the earliest matters — a passkey added after a
 * freeze proves nothing about who is asking.
 */
export async function earliestCredentialAt(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_webauthn_credentials")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`earliestCredentialAt: ${error.message}`);
  return (data as { created_at: string } | null)?.created_at ?? null;
}

export async function userHasCredential(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("tella_webauthn_credentials")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw new Error(`userHasCredential: ${error.message}`);
  return (count ?? 0) > 0;
}

/**
 * Remove every passkey for a user. Used by the recovery flow when someone
 * has lost the device holding their only passkey — without this, that
 * account can never authorize a send again, because register/verify refuses
 * to enroll a second credential.
 *
 * Returns how many were removed, so the caller can tell the user something
 * true about what just happened.
 */
export async function deleteCredentialsForUser(
  userId: string,
): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_webauthn_credentials")
    .delete()
    .eq("user_id", userId)
    .select("id");

  if (error) throw new Error(`deleteCredentialsForUser: ${error.message}`);
  return (data ?? []).length;
}

export async function saveCredential(args: {
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[] | null;
  deviceLabel: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("tella_webauthn_credentials").insert({
    user_id: args.userId,
    credential_id: args.credentialId,
    public_key: args.publicKey,
    counter: args.counter,
    transports: args.transports,
    device_label: args.deviceLabel,
  });

  if (error) throw new Error(`saveCredential: ${error.message}`);
}

export async function updateCredentialCounter(
  credentialId: string,
  counter: number,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("tella_webauthn_credentials")
    .update({ counter, last_used_at: new Date().toISOString() })
    .eq("credential_id", credentialId);

  if (error) throw new Error(`updateCredentialCounter: ${error.message}`);
}

/**
 * Store the challenge for a ceremony. Any existing challenge of the same
 * kind for this user is cleared first so a retried ceremony doesn't leave
 * stale rows lying around.
 */
export async function saveChallenge(
  userId: string,
  kind: ChallengeKind,
  challenge: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("tella_webauthn_challenges")
    .delete()
    .eq("user_id", userId)
    .eq("kind", kind);

  const expiresAt = new Date(
    Date.now() + CHALLENGE_TTL_SECONDS * 1000,
  ).toISOString();

  const { error } = await supabase.from("tella_webauthn_challenges").insert({
    user_id: userId,
    kind,
    challenge,
    expires_at: expiresAt,
  });

  if (error) throw new Error(`saveChallenge: ${error.message}`);
}

/**
 * Fetch and delete the latest challenge for (user, kind) — single use, so
 * it's removed whether or not it had expired. Returns null when there's
 * no challenge or it has expired (caller should treat as "start over").
 */
export async function consumeChallenge(
  userId: string,
  kind: ChallengeKind,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_webauthn_challenges")
    .select("id, challenge, expires_at")
    .eq("user_id", userId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`consumeChallenge: ${error.message}`);
  if (!data) return null;

  const row = data as { id: string; challenge: string; expires_at: string };
  await supabase.from("tella_webauthn_challenges").delete().eq("id", row.id);

  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.challenge;
}
