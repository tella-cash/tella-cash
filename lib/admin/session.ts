import { createHmac, timingSafeEqual } from "node:crypto";
import { ADMIN_COOKIE_NAME } from "./cookie-name";

/**
 * The admin session — the first durable session this app has had, and
 * deliberately the smallest one that does the job.
 *
 * Everything else here authorizes a single action and is over: a confirm
 * link, a reset link, a Google sign-in that freezes. I argued against a
 * session on that basis and it was right for those flows. A dashboard is the
 * case that genuinely breaks it — many reads across many page loads — which
 * is exactly the condition I said would be the moment to revisit it.
 *
 * WHAT KEEPS IT SMALL
 *
 * Stateless and signed, so there is no table and nothing to clean up. The
 * payload is not secret from its holder — it is their own identity — only
 * unforgeable by anyone else.
 *
 * Revocation still works, and that is the part worth understanding. The
 * cookie carries the Google `sub`, and every request re-checks that sub
 * against ADMIN_GOOGLE_SUBS. Removing someone from that env var locks them
 * out on their next request, without a session table and without waiting for
 * an expiry. The allowlist is the source of truth; the cookie only says who
 * you are.
 *
 * WHAT IT CANNOT DO
 *
 * It cannot authorize a send, reach a confirm link, or touch a recovery
 * route. That is enforced structurally in proxy.ts rather than by each route
 * remembering, because "every handler checks" is a property that survives
 * exactly until someone adds a handler.
 */

const COOKIE = ADMIN_COOKIE_NAME;
/** Absolute. No sliding renewal — a session that refreshes itself never ends. */
const TTL_MS = 4 * 60 * 60 * 1000;

export interface AdminIdentity {
  sub: string;
  email: string;
}

interface Payload extends AdminIdentity {
  exp: number;
}

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET ?? process.env.GOOGLE_STATE_SECRET;
  if (!s) throw new Error("Missing ADMIN_SESSION_SECRET");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Who is allowed in, by Google subject id.
 *
 * Subs, not emails, for the same reason the identity table matches on sub:
 * a Workspace address can be reassigned to a new person, and an allowlist
 * keyed on one hands them the dashboard.
 */
export function adminSubs(): string[] {
  return (process.env.ADMIN_GOOGLE_SUBS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdminSub(sub: string): boolean {
  const allowed = adminSubs();
  // Empty allowlist means nobody, never everybody. A misconfigured env var
  // must not open the door.
  if (allowed.length === 0) return false;
  return allowed.includes(sub);
}

export function issueAdminCookie(identity: AdminIdentity): string {
  const payload: Payload = { ...identity, exp: Date.now() + TTL_MS };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

/**
 * Verify a cookie value. Returns null for anything not currently valid.
 *
 * The allowlist re-check is here rather than only at sign-in, so revocation
 * takes effect on the next request instead of at the next expiry.
 */
export function readAdminCookie(value: string | undefined): AdminIdentity | null {
  if (!value) return null;

  const [body, sig] = value.split(".");
  if (!body || !sig) return null;

  let expected: string;
  try {
    expected = b64url(createHmac("sha256", secret()).update(body).digest());
  } catch {
    // Missing secret. Fail closed rather than letting anything through.
    return null;
  }

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
    ) as Payload;

    if (!payload.exp || payload.exp < Date.now()) return null;
    if (!payload.sub || !isAdminSub(payload.sub)) return null;

    return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export { ADMIN_COOKIE_NAME };

/**
 * Path is "/" and that is deliberate, despite the temptation to scope it.
 *
 * Scoping to /admin would stop the browser sending it to the money routes,
 * which sounds strictly better — but cookie paths are prefix matches, and
 * /api/admin is not under /admin, so the dashboard's own API would stop
 * receiving it. Two cookies to cover two prefixes is more moving parts than
 * the thing it protects against.
 *
 * So the browser does attach it to every same-origin request, and proxy.ts
 * strips it from the confirm, security, panic, webhook and cron paths before
 * any handler runs. That is a stronger guarantee than scoping anyway: a
 * scoped cookie protects the paths someone remembered to exclude, while
 * stripping protects every path on the list whether or not its handler ever
 * learns to read cookies.
 *
 * SameSite=Strict because no cross-site flow should ever carry it — the
 * OAuth return lands on a same-site redirect rather than setting it
 * cross-site.
 */
export function adminCookieOptions() {
  return {
    name: COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: Math.floor(TTL_MS / 1000),
  };
}
