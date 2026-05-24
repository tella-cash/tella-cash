/**
 * Build the user-facing confirm URL embedded in WhatsApp messages.
 *
 * The token IS the pending_action.id — UUIDv4 has ~122 bits of entropy
 * which is sufficient for an unguessable single-use link.
 *
 * APP_BASE_URL must be set in env (e.g. https://tella-xi.vercel.app) and
 * MUST match the actual deployed origin so confirmation links resolve.
 */
export function buildConfirmUrl(token: string): string {
  const base = process.env.APP_BASE_URL;
  if (!base) {
    throw new Error("Missing APP_BASE_URL environment variable");
  }
  return `${base.replace(/\/$/, "")}/confirm/${token}`;
}