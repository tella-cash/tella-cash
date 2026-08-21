import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Once-only processing for Circle's webhook notifications.
 *
 * Circle delivers at least once: a timeout, a 5xx, or a redelivery on retry
 * hands us the same notification again. Handling it twice sends a second
 * "you received X" WhatsApp message and writes a second history row for one
 * transfer, which is how one 10 USDC receipt shows up as 20.
 *
 * The claim is the insert itself. `key` is the primary key, so two
 * concurrent deliveries both attempting it means exactly one succeeds and
 * the other gets 23505 — no read-then-write race to lose.
 *
 * See migrations/0011_webhook_idempotency.sql.
 */

const TABLE = "tella_processed_notification";

/** Postgres unique_violation — the key is already claimed. */
const UNIQUE_VIOLATION = "23505";

/**
 * Composite because Circle reuses a transaction's id across the states it
 * passes through, and a self-transfer emits both an inbound and an outbound
 * event for the same money.
 */
export function notificationKey(
  notificationType: string,
  notificationId: string,
): string {
  return `${notificationType}:${notificationId}`;
}

/**
 * Returns true if this caller now owns the notification, false if it was
 * already processed.
 *
 * Fails CLOSED: an unexpected database error throws rather than returning
 * true. Treating "I can't tell" as "go ahead" is what this module exists to
 * prevent, and the caller logs the throw. This does mean the table must
 * exist before the code that calls it deploys — same ordering requirement as
 * migrations 0007 and 0008.
 */
export async function claimNotification({
  key,
  notificationId,
  notificationType,
}: {
  key: string;
  notificationId: string;
  notificationType: string;
}): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from(TABLE).insert({
    key,
    notification_id: notificationId,
    notification_type: notificationType,
  });

  if (!error) return true;
  if (error.code === UNIQUE_VIOLATION) return false;

  throw new Error(`claimNotification failed: ${error.message}`);
}

/**
 * Gives the claim back so Circle's next retry can do the work.
 *
 * Without this, a claim taken immediately before a transient failure — a
 * WhatsApp send that 503s, a database blip — would permanently swallow the
 * only notification the user was ever going to get about their money.
 *
 * Never throws: it runs on a path that is already handling an error, and a
 * failure to release is strictly less bad than losing the original one.
 */
export async function releaseNotification(key: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from(TABLE).delete().eq("key", key);
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("[circle-webhook] claim release failed", { key, err });
  }
}
