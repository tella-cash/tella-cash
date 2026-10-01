import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { tellaUser } from "@/lib/supabase/types";
import { factorCount } from "@/lib/auth/factors";
import { upsertChannel } from "@/lib/messaging/channels";
import { markFactorsChanged } from "@/lib/users/repository";

/**
 * Attaching a WhatsApp number to a Telegram account, and the rule that makes it
 * safe: the only account that may ever be thrown away to do it is one that has
 * never held anything.
 *
 * WHY AN ACCOUNT IS DELETED AT ALL. A phone that messages tella for the first
 * time is given an account on the spot (findOrCreateUser), before anyone can
 * ask whether they already have one on Telegram. If they do, that fresh row
 * and the existing account would both claim the same person, and
 * tella_users.whatsapp_number is unique. The merge keeps the account with the
 * history and removes the one that has none.
 *
 * Deleting a user row cascades to their transactions, beneficiaries and held
 * sends, so "has none" is the whole safety argument and is checked twice: once
 * before the link token is spent, and again immediately before the delete.
 * It fails CLOSED: a count that cannot be read counts as "not empty".
 */

export const LINK_WHATSAPP_START = "linkwa";

/** Tables whose rows would be destroyed by deleting the user. */
const OWNED_TABLES = [
  "tella_transactions",
  "tella_beneficiaries",
  "tella_held_send",
  "tella_pending_send",
  "tella_google_identity",
  "tella_user_chain_wallets",
  "tella_user_limits",
  "tella_sweeps",
  "tella_sweep_send",
] as const;

const WHATSAPP_LINK_PATTERNS: RegExp[] = [
  /\b(link|connect|add|use)\b[^.!?]{0,16}\bwhatsapp\b/i,
  /\bwhatsapp\b[^.!?]{0,16}\b(link|account)\b/i,
];

export function isWhatsappLinkRequest(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 80) return false;
  return WHATSAPP_LINK_PATTERNS.some((p) => p.test(trimmed));
}

// "<token uuid>_<secret>", the handoff loadAuthorizedLink checks. Matched
// strictly here so nothing else a person types is ever read as one.
const HANDOFF = /^\s*link\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[A-Za-z0-9_-]{20,40})\s*$/i;

/** The handoff in a "link <handoff>" message, or null for anything else. */
export function parseWhatsappLinkHandoff(text: string): string | null {
  return HANDOFF.exec(text)?.[1] ?? null;
}

/** What the prefilled WhatsApp message says. */
export function whatsappHandoffMessage(handoff: string): string {
  return `link ${handoff}`;
}

/**
 * The row-level half of "has this account never held anything". Pure, so the
 * rule is testable; the database half is `hasNoOwnedRows`.
 *
 * An account that finished onboarding, has a wallet in any state, or has a PIN
 * is never abandonable, whatever its other tables say.
 */
export function looksUnused(user: tellaUser): boolean {
  return (
    user.onboarding_step !== "completed" &&
    user.wallet_status === "none" &&
    !user.circle_wallet_id &&
    !user.wallet_address &&
    !user.pin_hash &&
    !user.profile_name
  );
}

async function hasNoOwnedRows(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  for (const table of OWNED_TABLES) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    // Cannot tell: not safe to delete. A table that is absent counts too.
    if (error || count === null || count > 0) return false;
  }
  return true;
}

/** Whether this account may be thrown away to make room for a link. */
export async function isAbandonableAccount(user: tellaUser): Promise<boolean> {
  if (!looksUnused(user)) return false;
  if ((await factorCount(user)) > 0) return false;
  return hasNoOwnedRows(user.id);
}

export type MergeResult =
  | { ok: true }
  | { ok: false; reason: "not_empty" | "phone_taken" | "failed" };

/**
 * Give `target` the phone number of `placeholder`, and remove `placeholder`.
 *
 * Order matters and is the recovery story. The placeholder goes first because
 * it holds the unique phone number. If anything after that fails, the number
 * belongs to nobody, and the person's next WhatsApp message simply creates a
 * fresh placeholder; nothing is lost, only repeated.
 */
export async function mergePlaceholderIntoAccount(args: {
  placeholder: tellaUser;
  target: tellaUser;
  profileName?: string | null;
}): Promise<MergeResult> {
  const { placeholder, target } = args;
  const phone = placeholder.whatsapp_number;
  if (!phone) return { ok: false, reason: "failed" };

  // Checked again, right before the delete that cascades.
  if (!(await isAbandonableAccount(placeholder))) return { ok: false, reason: "not_empty" };

  const supabase = getSupabaseAdmin();

  const { error: delError } = await supabase.from("tella_users").delete().eq("id", placeholder.id);
  if (delError) {
    console.error("[link-whatsapp] removing the placeholder failed", { error: delError.message });
    return { ok: false, reason: "failed" };
  }

  // Only ever set where the account has no number yet, so a number cannot be
  // swapped out from under an account that already has one.
  const { data, error } = await supabase
    .from("tella_users")
    .update({ whatsapp_number: phone })
    .eq("id", target.id)
    .is("whatsapp_number", null)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("[link-whatsapp] attaching the number failed", { error: error?.message });
    return { ok: false, reason: error ? "failed" : "phone_taken" };
  }

  await upsertChannel({
    userId: target.id,
    provider: "meta",
    externalId: phone,
    displayName: args.profileName ?? null,
    // Never primary on linking: conversational replies stay where the account
    // already lives, as with a Telegram link.
    isPrimary: false,
    verified: true,
  });

  await markFactorsChanged(target.id);
  return { ok: true };
}
