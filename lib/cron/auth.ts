import crypto from "node:crypto";

/**
 * Shared auth for the maintenance cron routes.
 *
 * Vercel Cron calls these over the public internet, so they need a gate.
 * Vercel signs its own invocations with CRON_SECRET as a bearer token; the
 * same secret works for a manual curl during an incident.
 *
 * Fails CLOSED when CRON_SECRET is unset. These routes retry wallets and
 * delete rows — "nobody configured the secret" must not mean "anyone can
 * trigger them".
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET is not set — refusing");
    return false;
  }

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
