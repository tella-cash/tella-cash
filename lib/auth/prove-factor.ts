import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { tellaUser } from "@/lib/supabase/types";
import { verifyPin } from "@/lib/auth/pin";
import { verifyAuthentication } from "@/lib/webauthn/server";
import {
  consumeChallenge,
  listCredentials,
  updateCredentialCounter,
} from "@/lib/webauthn/repository";

/**
 * Check a PIN or a passkey assertion against the account's own factors.
 *
 * The caller owns everything around it — rate limiting, which factors are
 * acceptable, what success unlocks. The unfreeze route only accepts factors
 * that predate the freeze, so it passes `allow` accordingly; a caller with no
 * such constraint passes both.
 *
 * Never throws for a bad credential. A verification library throwing on a
 * malformed assertion is a failed proof, not a server error.
 */
export async function proveFactor({
  user,
  pin,
  assertion,
  allow = { pin: true, passkey: true },
}: {
  user: tellaUser;
  pin?: string;
  assertion?: AuthenticationResponseJSON;
  allow?: { pin: boolean; passkey: boolean };
}): Promise<boolean> {
  if (assertion) {
    // Consumed whether or not the rest succeeds, so a challenge is single use.
    const challenge = await consumeChallenge(user.id, "authentication");
    if (!challenge || !allow.passkey) return false;

    const credentials = await listCredentials(user.id);
    const credential = credentials.find((c) => c.credential_id === assertion.id);
    if (!credential) return false;

    try {
      const verification = await verifyAuthentication(assertion, challenge, credential);
      if (!verification.verified) return false;
      await updateCredentialCounter(
        credential.credential_id,
        verification.authenticationInfo.newCounter,
      );
      return true;
    } catch (err) {
      console.error("[auth] passkey proof threw", { userId: user.id, err });
      return false;
    }
  }

  if (pin) {
    if (!allow.pin || !user.pin_hash) return false;
    return verifyPin(pin, user.pin_hash);
  }

  return false;
}
