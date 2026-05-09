import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const KEY_LENGTH = 64;
const SALT_BYTES = 16;

// scrypt cost params for a 4-digit PIN.
//
// The keyspace is 10,000 — so the meaningful security boundary is
// rate-limiting + lockout on the confirm flow, not the hash work factor.
// scrypt here is defense-in-depth against an offline dump.
//
// N=2^14 keeps us inside OpenSSL's default 32MB scrypt budget without
// needing to override `maxmem`. Memory ≈ 128 * N * r * p = 16MB.
const SCRYPT_PARAMS = { N: 1 << 14, r: 8, p: 1 } as const;

const PIN_PATTERN = /^\d{4,8}$/;
const HASH_SCHEME = "scrypt";

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

/**
 * Stored hash format: `scrypt$N$r$p$saltB64$hashB64`
 *
 * Embedding the params lets us bump N later without breaking existing
 * users — verifyPin reads the params off the stored string.
 */
async function deriveKey(
  pin: string,
  salt: Buffer,
  params: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(pin, salt, KEY_LENGTH, params, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(pin, salt, SCRYPT_PARAMS);
  return [
    HASH_SCHEME,
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== HASH_SCHEME) return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");

  const candidate = await deriveKey(pin, salt, { N, r, p });

  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export async function setPinForUser({
  userId,
  pin,
}: {
  userId: string;
  pin: string;
}): Promise<void> {
  if (!isValidPin(pin)) {
    throw new Error("PIN must be 4–8 digits");
  }
  const pin_hash = await hashPin(pin);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("upay_users")
    .update({ pin_hash })
    .eq("id", userId);

  if (error) throw new Error(`setPinForUser failed: ${error.message}`);
}