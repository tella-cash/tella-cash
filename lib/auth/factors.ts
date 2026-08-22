import type { tellaUser } from "@/lib/supabase/types";
import { userHasCredential } from "@/lib/webauthn/repository";

/**
 * One answer to "what can this account authenticate with".
 *
 * The question was previously asked in three places and answered three
 * different ways: the WebAuthn register routes checked
 * `pin_hash || userHasCredential()`, while pin/setup checked `pin_hash`
 * alone. That disagreement was a live hole — a passkey-only account could
 * have a PIN planted on it by anyone holding a confirm link, with no factor
 * proven at all. Gates that ask the same question must not be free to
 * disagree, so they now all call this.
 *
 * `totp` is here and always false. TOTP is not built yet; the field exists
 * so every gate is already written to account for it and none of them has to
 * be found and edited on the day it lands.
 */
export interface FactorSet {
  pin: boolean;
  passkey: boolean;
  totp: boolean;
}

export async function listFactors(user: tellaUser): Promise<FactorSet> {
  return {
    pin: Boolean(user.pin_hash),
    passkey: await userHasCredential(user.id),
    totp: false,
  };
}

export async function factorCount(user: tellaUser): Promise<number> {
  const factors = await listFactors(user);
  return Number(factors.pin) + Number(factors.passkey) + Number(factors.totp);
}

/**
 * The invariant every enrollment gate enforces, in one place.
 *
 * Holding a confirm link proves possession of the LINK, not of the account.
 * A fresh enrollment gesture may therefore double as authorization for the
 * send only while the account has nothing else — that is the bootstrap path
 * every new user takes, and it is sound because there is nothing yet to
 * bypass. Once any factor exists, adding another has to be authorized by an
 * existing one, and that happens through recovery rather than through a
 * confirm link.
 *
 * Note the panic code is deliberately NOT counted. It can only freeze; it
 * cannot authorize anything, so an account holding one and nothing else is
 * still an account with no factors.
 */
export async function canEnrollFromConfirmLink(user: tellaUser): Promise<boolean> {
  return (await factorCount(user)) === 0;
}
