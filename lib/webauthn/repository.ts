import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  WebAuthnCredential,
  WebAuthnChallengeKind,
} from "@/lib/supabase/types";

const CHALLENGE_TTL_MINUTES = 5;

interface SaveCredentialArgs {
  userId: string;
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[] | null;
  deviceLabel?: string | null;
}

export async function saveCredential({
  userId,
  credentialId,
  publicKey,
  counter,
  transports,
  deviceLabel,
}: SaveCredentialArgs): Promise<void> {
  const supabase = getSupabaseAdmin();
  // Supabase-js encodes bytea as base64 over the wire; the column type is
  // bytea so the driver round-trips it correctly.
  const { error } = await supabase
    .from("upay_webauthn_credentials")
    .insert({
      user_id: userId,
      credential_id: credentialId,
      public_key: bytesToBase64(publicKey),
      counter,
      transports,
      device_label: deviceLabel ?? null,
    });

  if (error) throw new Error(`saveCredential failed: ${error.message}`);
}

export async function listCredentialsForUser(
  userId: string,
): Promise<WebAuthnCredential[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("upay_webauthn_credentials")
    .select("*")
    .eq("user_id", userId);

  if (error) throw new Error(`listCredentialsForUser failed: ${error.message}`);

  return (data ?? []).map(rowToCredential);
}

export async function findCredentialById(
  credentialId: string,
): Promise<WebAuthnCredential | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("upay_webauthn_credentials")
    .select("*")
    .eq("credential_id", credentialId)
    .maybeSingle();

  if (error) throw new Error(`findCredentialById failed: ${error.message}`);
  return data ? rowToCredential(data) : null;
}

export async function bumpCredentialCounter({
  credentialId,
  counter,
}: {
  credentialId: string;
  counter: number;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("upay_webauthn_credentials")
    .update({ counter, last_used_at: new Date().toISOString() })
    .eq("credential_id", credentialId);

  if (error) throw new Error(`bumpCredentialCounter failed: ${error.message}`);
}

export async function hasAnyCredential(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("upay_webauthn_credentials")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw new Error(`hasAnyCredential failed: ${error.message}`);
  return (count ?? 0) > 0;
}

interface CreateChallengeArgs {
  userId: string;
  kind: WebAuthnChallengeKind;
  challenge: string;
}

/**
 * Create (or replace) the active challenge for a user+kind. Replace-on-write
 * means a second register/auth attempt invalidates the first, which is the
 * desired behavior — the user can only complete the most recent ceremony.
 */
export async function putChallenge({
  userId,
  kind,
  challenge,
}: CreateChallengeArgs): Promise<void> {
  const supabase = getSupabaseAdmin();
  const expiresAt = new Date(
    Date.now() + CHALLENGE_TTL_MINUTES * 60 * 1000,
  ).toISOString();

  // Delete any existing challenge of the same kind first; there's no PK
  // we can upsert on (user_id+kind isn't unique because it doesn't need
  // to be at the schema level), so two-step is correct.
  await supabase
    .from("upay_webauthn_challenges")
    .delete()
    .eq("user_id", userId)
    .eq("kind", kind);

  const { error } = await supabase
    .from("upay_webauthn_challenges")
    .insert({
      user_id: userId,
      kind,
      challenge,
      expires_at: expiresAt,
    });

  if (error) throw new Error(`putChallenge failed: ${error.message}`);
}

/**
 * Read and delete the active challenge in one logical step. We delete
 * unconditionally so a replay can't reuse the value; the verify step
 * must succeed on the first try or the user has to start over.
 */
export async function consumeChallenge({
  userId,
  kind,
}: {
  userId: string;
  kind: WebAuthnChallengeKind;
}): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("upay_webauthn_challenges")
    .delete()
    .eq("user_id", userId)
    .eq("kind", kind)
    .gt("expires_at", new Date().toISOString())
    .select("challenge")
    .maybeSingle();

  if (error) throw new Error(`consumeChallenge failed: ${error.message}`);
  return (data as { challenge: string } | null)?.challenge ?? null;
}

function rowToCredential(row: Record<string, unknown>): WebAuthnCredential {
  const rawPublicKey = row.public_key as string | Uint8Array;
  const publicKey =
    typeof rawPublicKey === "string"
      ? base64ToBytes(stripPgByteaPrefix(rawPublicKey))
      : rawPublicKey;

  return {
    id: row.id as string,
    user_id: row.user_id as string,
    credential_id: row.credential_id as string,
    public_key: publicKey,
    counter: Number(row.counter ?? 0),
    transports: (row.transports as string[] | null) ?? null,
    device_label: (row.device_label as string | null) ?? null,
    created_at: row.created_at as string,
    last_used_at: (row.last_used_at as string | null) ?? null,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

/**
 * Postgres bytea fields come back from PostgREST as either base64 or as
 * the legacy `\x...` hex escape format depending on the column setting.
 * Strip the `\x` prefix if present and decode as hex; otherwise treat
 * the value as base64.
 */
function stripPgByteaPrefix(value: string): string {
  if (value.startsWith("\\x")) {
    return Buffer.from(value.slice(2), "hex").toString("base64");
  }
  return value;
}
