import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hashPin, verifyPin } from "@/lib/auth/pin";
import type { tellaUser } from "@/lib/supabase/types";

/**
 * The panic code: a freeze-only credential that works without the phone.
 *
 * Every other way into this account runs through WhatsApp, which is exactly
 * the thing that is gone in the case this exists for. The panic code is the
 * one credential a user can write on paper, keep in a wallet, or leave with
 * someone they trust, and still use from a borrowed device.
 *
 * It is safe to hand out that freely because of what it CANNOT do. It cannot
 * unfreeze, authorize a transfer, change a factor, or read anything. The only
 * verb it has is "stop", and an attacker who steals it has gained the ability
 * to inconvenience its owner. That narrowness is the entire security argument,
 * and it is why this is a separate credential rather than a second PIN.
 *
 * Stored as a scrypt hash in the same self-describing format the PIN uses, so
 * there is one hashing implementation in the codebase rather than two.
 */

/**
 * Crockford-style base32 with the ambiguous letters removed. Someone reading
 * this off paper under stress should not have to decide whether that is an O
 * or a zero, and normalizeCode below forgives them when they get it wrong
 * anyway. 32 symbols is exactly 5 bits, so masking randomBytes introduces no
 * modulo bias.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 16;
const GROUP_SIZE = 4;

/** 16 symbols over a 32-symbol alphabet is 80 bits. */
export function generatePanicCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[bytes[i] & 31];
    if ((i + 1) % GROUP_SIZE === 0 && i !== CODE_LENGTH - 1) out += "-";
  }
  return out;
}

/**
 * Canonical form for comparison.
 *
 * Forgives the mistakes people actually make when retyping from paper:
 * lowercase, missing or extra separators, spaces, and the four confusable
 * letters the alphabet deliberately excludes. Being strict here would mean
 * rejecting a correct code from someone whose account is being drained,
 * which is not a trade worth making for a credential that can only stop
 * things.
 */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

/**
 * Issue a fresh code, replacing any previous one.
 *
 * Returns the plaintext, which is the only time it exists in readable form.
 * The caller must deliver it immediately and must not log it or persist it
 * anywhere else. Re-issuing invalidates the old code, which is the intended
 * way to recover from one being seen by the wrong person.
 */
export async function issuePanicCode(userId: string): Promise<string> {
  const code = generatePanicCode();
  const hash = await hashPin(normalizeCode(code));

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("tella_users")
    .update({ panic_code_hash: hash })
    .eq("id", userId);

  if (error) throw new Error(`issuePanicCode failed: ${error.message}`);

  console.log("[panic-code] issued", { userId });
  return code;
}

export function hasPanicCode(user: tellaUser): boolean {
  return Boolean(user.panic_code_hash);
}

/**
 * Constant-time check against the stored hash.
 *
 * Returns false rather than throwing for an account with no code set, so the
 * caller's response is identical whether the code was wrong or was never
 * issued. Anything that distinguishes the two tells a stranger which phone
 * numbers belong to accounts worth attacking.
 */
export async function verifyPanicCode(
  user: tellaUser,
  submitted: string,
): Promise<boolean> {
  if (!user.panic_code_hash) return false;
  return verifyPin(normalizeCode(submitted), user.panic_code_hash);
}
