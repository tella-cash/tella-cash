import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { raiseAlert } from "@/lib/observability/alerts";

/**
 * Per-user attempt limiting for the confirm-link auth paths.
 *
 * Backed by `tella_auth_attempts` + the `tella_record_auth_attempt` RPC
 * (migrations/0007_auth_attempts.sql). The increment and the limit check
 * happen inside one Postgres call so a burst of parallel guesses can't all
 * read the same pre-increment count and slip through together.
 */

export type AuthScope =
  | "pin_verify"
  | "webauthn_authenticate"
  | "pin_reset"
  // The freeze door. Limited like the others so the code can't be ground
  // down, but note the consequence of a lockout here is different: it means
  // someone cannot freeze. Keep the ceiling generous relative to the others.
  | "panic_code";

export interface AttemptResult {
  allowed: boolean;
  attempts: number;
  /** Seconds until the caller may try again. 0 when not locked out. */
  retryAfterSeconds: number;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function limits() {
  return {
    max: intFromEnv("TELLA_AUTH_MAX_ATTEMPTS", 5),
    windowSeconds: intFromEnv("TELLA_AUTH_WINDOW_SECONDS", 15 * 60),
    lockoutSeconds: intFromEnv("TELLA_AUTH_LOCKOUT_SECONDS", 15 * 60),
  };
}

/**
 * Count one attempt against (user, scope) and report whether it may proceed.
 *
 * Fails CLOSED: if the RPC errors we refuse the attempt rather than waving
 * it through. A database blip should not turn the brute-force guard off.
 */
export async function recordAuthAttempt(
  userId: string,
  scope: AuthScope,
): Promise<AttemptResult> {
  const { max, windowSeconds, lockoutSeconds } = limits();
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc("tella_record_auth_attempt", {
    p_user_id: userId,
    p_scope: scope,
    p_max: max,
    p_window: `${windowSeconds} seconds`,
    p_lockout: `${lockoutSeconds} seconds`,
  });

  if (error) {
    console.error("[rate-limit] attempt check failed, refusing", {
      scope,
      message: error.message,
    });
    return { allowed: false, attempts: max, retryAfterSeconds: lockoutSeconds };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { allowed: boolean; attempts: number; locked_until: string | null }
    | undefined;

  if (!row) {
    console.error("[rate-limit] attempt check returned no row, refusing", { scope });
    return { allowed: false, attempts: max, retryAfterSeconds: lockoutSeconds };
  }

  if (!row.allowed) {
    // A lockout means someone burned through the whole attempt budget. On a
    // 4-digit PIN that is a person guessing, not a person mistyping.
    raiseAlert({
      kind: "auth_locked_out",
      message: `A ${scope} lockout was hit after ${row.attempts} attempts.`,
      // No user id: this goes to a chat channel, and which account is being
      // attacked isn't needed to know that one is.
      context: { scope },
    });
  }

  return {
    allowed: row.allowed,
    attempts: row.attempts,
    retryAfterSeconds: secondsUntil(row.locked_until),
  };
}

/**
 * Clear the counter after a successful authentication. Best-effort — a
 * failure here only means the user keeps a stale count until the window
 * rolls, so it must never break the success path.
 */
export async function resetAuthAttempts(
  userId: string,
  scope: AuthScope,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.rpc("tella_reset_auth_attempts", {
      p_user_id: userId,
      p_scope: scope,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("[rate-limit] counter reset failed", { scope, err });
  }
}

function secondsUntil(iso: string | null): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

/** Human-readable "try again in …" for chat and the confirm page. */
export function formatRetryAfter(seconds: number): string {
  if (seconds <= 60) return "a minute";
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
