import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// promisify drops the 4-arg (options) overload from its type signature,
// so we re-assert it. Runtime accepts options fine — this is purely typing.
const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options?: ScryptOptions,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_BYTES = 16;

// scrypt cost params for a 4-digit PIN.
//
// Real security here is rate-limiting + lockout on the confirm flow,
// since the keyspace is only 10,000. scrypt is defense-in-depth.
//
// N=2^14 → ~16 MB working memory. We override maxmem because OpenSSL's
// default 32 MB ceiling has been observed to reject this on some Node
// builds (Vercel runtime among them) due to internal overhead.
const SCRYPT_PARAMS = {
  N: 1 << 14,
  r: 8,
  p: 1,
  maxmem: 128 * 1024 * 1024,
} as const;

const PIN_PATTERN = /^\d{4,8}$/;
const HASH_SCHEME = "scrypt";

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

async function deriveKey(
  pin: string,
  salt: Buffer,
  params: { N: number; r: number; p: number },
): Promise<Buffer> {
  return scrypt(pin, salt, KEY_LENGTH, {
    ...params,
    maxmem: SCRYPT_PARAMS.maxmem,
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
    .from("tella_users")
    // Stamped on every write, including a reset. Unfreezing requires a factor
    // that predates the freeze, and without this a PIN chosen by whoever is
    // holding the phone right now would be indistinguishable from one the
    // owner set months ago. See migrations/0019_pin_set_at.sql.
    .update({ pin_hash, pin_set_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) throw new Error(`setPinForUser failed: ${error.message}`);
}

/**
 * Replace an existing PIN. Separate from setPinForUser so the caller has to
 * be explicit: setPinForUser is reachable from the confirm flow, which is
 * guarded by a 409 precisely so a link-holder can't overwrite someone's PIN.
 * This one is only reachable from the recovery flow, which has its own gate.
 */
export async function replacePinForUser({
  userId,
  pin,
}: {
  userId: string;
  pin: string;
}): Promise<void> {
  await setPinForUser({ userId, pin });
}