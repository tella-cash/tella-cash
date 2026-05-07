import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
// scrypt cost params: N=2^15, r=8, p=1 — recommended baseline that runs in
// well under 100ms on Vercel Fluid Compute and stays inside the default
// memory budget of 128MB.
const SCRYPT_OPTS = { N: 1 << 15, r: 8, p: 1 } as const;

const PIN_PATTERN = /^\d{4,8}$/;

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

export function hashPin(pin: string): { hash: string; salt: string } {
  const salt = randomBytes(SALT_BYTES).toString("base64");
  const hash = scryptSync(pin, salt, KEY_LENGTH, SCRYPT_OPTS).toString(
    "base64",
  );
  return { hash, salt };
}

export function verifyPin({
  pin,
  hash,
  salt,
}: {
  pin: string;
  hash: string;
  salt: string;
}): boolean {
  const candidate = scryptSync(pin, salt, KEY_LENGTH, SCRYPT_OPTS);
  const expected = Buffer.from(hash, "base64");
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
  const { hash, salt } = hashPin(pin);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("upay_users")
    .update({ pin_hash: hash, pin_salt: salt })
    .eq("id", userId);

  if (error) throw new Error(`setPinForUser failed: ${error.message}`);
}
