import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { tellaUser } from "@/lib/supabase/types";
import type { MessageProvider } from "@/lib/messaging/processed-messages";

/**
 * Single-use recovery tokens (migrations/0010_security_tokens.sql).
 *
 * Deliberately shorter-lived than a confirm link. A confirm link authorizes
 * one transfer of a known amount to a known recipient; a reset link
 * authorizes replacing the factor that guards every future transfer. The
 * blast radius is larger, so the window is smaller.
 */

export type SecurityTokenKind =
  | "pin_reset"
  | "link_telegram"
  | "link_google"
  | "unfreeze";

const TTL_MINUTES = 10;

export interface SecurityToken {
  id: string;
  user_id: string;
  kind: SecurityTokenKind;
  expires_at: string;
  used_at: string | null;
  created_at: string;
  /**
   * Anything the minting side needs the consuming page to know.
   *
   * Today that is only `origin`: which channel asked for this link, so the
   * page can send the user back to the chat they came from instead of
   * assuming WhatsApp. Nullable, because rows minted before this existed
   * have no payload and a ten-minute TTL makes that brief.
   */
  payload: { origin?: MessageProvider } | null;
}

export interface ResetContext {
  user: tellaUser;
  token: SecurityToken;
}

export async function createResetToken(
  userId: string,
  kind: SecurityTokenKind = "pin_reset",
  origin?: MessageProvider,
): Promise<SecurityToken> {
  const supabase = getSupabaseAdmin();
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("tella_security_token")
    .insert({
      user_id: userId,
      kind,
      expires_at: expiresAt,
      ...(origin ? { payload: { origin } } : {}),
    })
    .select()
    .single();

  if (error) throw new Error(`createResetToken failed: ${error.message}`);
  return data as SecurityToken;
}

/**
 * Resolve a reset token to its user, or null if it's expired, already used,
 * or not a token at all.
 *
 * Mirrors loadConfirmContext's handling of Postgres 22P02: a malformed UUID
 * makes the comparison itself fail rather than returning no row, and from
 * the visitor's side that is indistinguishable from a bad link.
 */
export async function loadResetContext(
  token: string,
  kind: SecurityTokenKind = "pin_reset",
): Promise<ResetContext | null> {
  const supabase = getSupabaseAdmin();

  const { data: row, error } = await supabase
    .from("tella_security_token")
    .select("*")
    .eq("id", token)
    .eq("kind", kind)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    if (error.code === "22P02") return null;
    throw new Error(`loadResetContext: ${error.message}`);
  }
  if (!row) return null;

  const { data: user, error: userErr } = await supabase
    .from("tella_users")
    .select("*")
    .eq("id", (row as SecurityToken).user_id)
    .single();

  if (userErr) throw new Error(`loadResetContext: ${userErr.message}`);
  return { user: user as tellaUser, token: row as SecurityToken };
}

/**
 * Atomically consume the token. Like claimPendingSend, the `is used_at null`
 * filter is what enforces single use — two tabs both submitting a new PIN
 * race here and only one wins.
 *
 * Returns false if it was already consumed.
 */
export async function consumeResetToken(id: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tella_security_token")
    .update({ used_at: new Date().toISOString() })
    .eq("id", id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`consumeResetToken failed: ${error.message}`);
  return data !== null;
}

/**
 * Invalidate a user's outstanding tokens OF ONE KIND.
 *
 * Called after a successful reset so a second link, requested minutes
 * earlier and still inside its window, can't be used to reset again by
 * someone who saw it in a notification preview.
 *
 * The `kind` filter is not optional politeness. Without it this revokes every
 * unused token the user holds, which was harmless while 'pin_reset' was the
 * only kind and became a real bug the moment a second one existed: completing
 * a PIN reset would silently kill an in-flight Telegram link, and the user
 * would tap a deep link that just did nothing. Revoking a channel link is
 * also not a security requirement the way revoking a spare reset link is —
 * they authorize different things and their blast radii are different.
 */
export async function revokeResetTokens(
  userId: string,
  kind: SecurityTokenKind = "pin_reset",
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("tella_security_token")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("kind", kind)
    .is("used_at", null);

  if (error) {
    console.error("[security] revoking outstanding reset tokens failed", {
      userId,
      error: error.message,
    });
  }
}

/**
 * Invalidate every outstanding token a user holds, of every kind.
 *
 * The deliberate opposite of revokeResetTokens above, and the distinction is
 * the point. That one is called after a SUCCESSFUL reset, where revoking
 * unrelated kinds is a bug: killing an in-flight Telegram link because someone
 * changed their PIN leaves them tapping a deep link that does nothing.
 *
 * This one is called by a FREEZE, where the opposite reasoning applies. Every
 * outstanding token is a way back into an account whose owner has just said
 * something is wrong, and each was minted before they said it. A freeze that
 * leaves one alive is a freeze with a door propped open.
 *
 * Enumerating kinds by hand is what went wrong: the freeze revoked exactly
 * `pin_reset` and `link_telegram`, and when `link_google` and `unfreeze` were
 * added in 0018 nobody came back here. So an attacker holding the phone who
 * had already minted a Google-link URL could complete it AFTER the freeze and
 * permanently attach their own account — which receives every future security
 * email and can freeze the wallet from the web. A stale `unfreeze` token was
 * worse: inside its ten minutes it could lift the freeze that had just been
 * applied. This takes no kind argument, so a fifth kind is covered on the day
 * it is added rather than the day someone notices.
 */
export async function revokeAllSecurityTokens(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("tella_security_token")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("used_at", null);

  if (error) {
    // Loud, and it does NOT fail the freeze: the flag and the confirm-link
    // cascade are already applied, and a surviving token still has to satisfy
    // its own gate. Reported so it can be chased rather than silently lost.
    console.error("[security] revoking all outstanding tokens failed", {
      userId,
      error: error.message,
    });
    throw new Error(`revokeAllSecurityTokens failed: ${error.message}`);
  }
}

/** The user-facing URL for a reset token. */
export function buildResetUrl(token: string): string {
  const base = process.env.APP_BASE_URL;
  if (!base) {
    throw new Error("Missing APP_BASE_URL environment variable");
  }
  return `${base.replace(/\/$/, "")}/security/${token}`;
}

export const RESET_TTL_MINUTES = TTL_MINUTES;
