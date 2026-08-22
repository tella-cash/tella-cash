/**
 * The admin cookie's name, and nothing else.
 *
 * Deliberately its own module. proxy.ts runs on the edge, where node:crypto
 * does not exist, so importing this constant from lib/admin/session.ts would
 * drag the whole signing implementation into that bundle — which builds with
 * a warning today and would fail outright the moment the proxy touched
 * anything that actually needs the crypto.
 *
 * Splitting it also makes the boundary honest: the proxy is allowed to know
 * that a cookie exists, and is deliberately not allowed to verify it. That
 * decision belongs in the route, where the secret is.
 */
export const ADMIN_COOKIE_NAME = "tella_admin";
