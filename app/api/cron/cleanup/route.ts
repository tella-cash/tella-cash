import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/cleanup
 *
 * Deletes expired rows. Every table below has a TTL column that the code
 * respects on read — an expired pending send doesn't load, an expired
 * challenge doesn't verify — but nothing ever removed them, as
 * migrations/0006's own comment notes. So the tables grow forever, holding
 * onto payloads that name recipients and amounts long after they stopped
 * meaning anything. Expired data that is never deleted is just data waiting
 * to be in a breach.
 *
 * Claimed-but-unresolved sends (outcome = 'unknown', migration 0008) are
 * deliberately NOT deleted here. Those are transfers whose fate we don't
 * know, and they exist to be reconciled by a person.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const results: Record<string, number | string> = {};

  // Expired, unclaimed. A claimed row is either mid-flight or an unresolved
  // outcome worth keeping.
  results.pending_sends = await purge(async () => {
    const { data, error } = await supabase
      .from("tella_pending_send")
      .delete()
      .lt("expires_at", now)
      .is("claimed_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  });

  results.webauthn_challenges = await purge(async () => {
    const { data, error } = await supabase
      .from("tella_webauthn_challenges")
      .delete()
      .lt("expires_at", now)
      .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  });

  results.pending_actions = await purge(async () => {
    const { data, error } = await supabase
      .from("tella_pending_action")
      .delete()
      .lt("expires_at", now)
      .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  });

  // Kept for 30 days as the audit trail for "when was this PIN last reset",
  // then dropped. Long enough to investigate a dispute, short enough not to
  // be an indefinite record.
  results.security_tokens = await purge(async () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("tella_security_token")
      .delete()
      .lt("created_at", cutoff)
      .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  });

  // Webhook dedupe keys (migration 0011). Circle stops retrying a delivery
  // long before this, so a week-old key can only ever match a notification
  // that will never arrive again. Kept a week rather than a day so a
  // redelivery during an outage still finds its claim.
  results.processed_notifications = await purge(async () => {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("tella_processed_notification")
      .delete()
      .lt("processed_at", cutoff)
      .select("key");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  });

  // Inbound message dedupe keys (migration 0013). Same reasoning and same
  // window as the Circle notification keys above: providers stop retrying
  // within minutes, so a week-old key can only match a delivery that will
  // never arrive again.
  results.processed_messages = await purge(async () => {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("tella_processed_message")
      .delete()
      .lt("processed_at", cutoff)
      .select("key");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  });

  // Only rows whose window and lockout have both elapsed — deleting an
  // active counter would hand an attacker a free reset of their attempts.
  results.auth_attempts = await purge(async () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("tella_auth_attempts")
      .delete()
      .lt("window_start", cutoff)
      .or(`locked_until.is.null,locked_until.lt.${now}`)
      .select("user_id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  });

  console.log("[cron:cleanup] done", results);
  return NextResponse.json(results);
}

/**
 * One table failing must not stop the rest — a missing table or a permission
 * problem on one is not a reason to leave the others growing.
 */
async function purge(run: () => Promise<number>): Promise<number | string> {
  try {
    return await run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron:cleanup] purge failed", { message });
    return `error: ${message}`;
  }
}
