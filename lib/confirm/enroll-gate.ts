import type { tellaUser } from "@/lib/supabase/types";
import { enrollmentGateFor, listFactors, type FactorSet } from "@/lib/auth/factors";
import { verifyPin } from "@/lib/auth/pin";
import {
  recordAuthAttempt,
  resetAuthAttempts,
  formatRetryAfter,
} from "@/lib/auth/rate-limit";

/**
 * May this request enroll a passkey on this account?
 *
 * Used by BOTH register routes (options and verify) so the answer cannot
 * differ between them. For an account with a PIN and nothing else, the PIN has
 * to be proven here, in the request itself: a confirm link on its own proves
 * possession of the link, not of the account.
 *
 * The PIN goes through the same attempt limiter as /api/confirm/pin/verify
 * ("pin_verify"), counted before the check, so this route is not a faster way
 * to guess a PIN than the one that already exists. The limit is shared, so
 * guesses made here and there add up.
 *
 * Returns data rather than a Response so the rule can be tested without a
 * framework; the routes turn a refusal into a JSON error.
 */
export type EnrollmentAuth =
  | { ok: true; /** True when an existing PIN authorized this. */ steppedUp: boolean }
  | { ok: false; status: 401 | 409 | 429; error: string; retryAfter?: number };

export interface EnrollmentDeps {
  listFactors: (user: tellaUser) => Promise<FactorSet>;
  recordAuthAttempt: typeof recordAuthAttempt;
  resetAuthAttempts: typeof resetAuthAttempts;
  verifyPin: (pin: string, stored: string) => Promise<boolean>;
}

const DEFAULT_DEPS: EnrollmentDeps = {
  listFactors,
  recordAuthAttempt,
  resetAuthAttempts,
  verifyPin,
};

export async function authorizeEnrollment(
  user: tellaUser,
  pin: unknown,
  deps: EnrollmentDeps = DEFAULT_DEPS,
): Promise<EnrollmentAuth> {
  const gate = enrollmentGateFor(await deps.listFactors(user));

  if (gate === "open") return { ok: true, steppedUp: false };

  if (gate === "refused") {
    return {
      ok: false,
      status: 409,
      error: "This account already has a confirmation method set up.",
    };
  }

  // needs_pin. A string is required: anything else is "no PIN given", never a
  // value to coerce into one.
  if (!user.pin_hash || typeof pin !== "string" || pin === "") {
    return { ok: false, status: 401, error: "Enter your PIN to add Face ID or a fingerprint." };
  }

  // Counted before the PIN is checked, so a crash mid-verify cannot hand back
  // a free guess.
  const attempt = await deps.recordAuthAttempt(user.id, "pin_verify");
  if (!attempt.allowed) {
    return {
      ok: false,
      status: 429,
      error: `Too many attempts. Try again in ${formatRetryAfter(attempt.retryAfterSeconds)}.`,
      retryAfter: attempt.retryAfterSeconds,
    };
  }

  if (!(await deps.verifyPin(pin, user.pin_hash))) {
    return { ok: false, status: 401, error: "Incorrect PIN" };
  }

  await deps.resetAuthAttempts(user.id, "pin_verify");
  return { ok: true, steppedUp: true };
}
