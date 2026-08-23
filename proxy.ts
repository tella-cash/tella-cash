import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/admin/cookie-name";

/**
 * The first proxy in this app, added for one specific reason.
 *
 * (Next 16 renamed the middleware convention to `proxy`; the behaviour is
 * unchanged. This runs on the edge, which is why it imports only the cookie's
 * NAME — node:crypto does not exist here, so verification cannot and should
 * not happen in this file.)
 *
 * Introducing a cookie introduces a class of bug this codebase did not
 * previously have. Every authenticated surface here was a bearer token in a
 * URL, which is not ambient: a request to /api/confirm/... carries authority
 * only if the caller put it there. A cookie IS ambient — the browser attaches
 * it to every same-origin request — so from the moment one exists, any route
 * that learns to read it becomes reachable by anything that can make the
 * browser issue a request.
 *
 * TWO INVARIANTS, ENFORCED HERE RATHER THAN PER-ROUTE
 *
 *   1. The admin cookie never reaches a money or recovery route. Not "no
 *      handler reads it" — it is stripped from the request entirely, so a
 *      handler that starts reading it tomorrow still gets nothing.
 *   2. /admin and /api/admin are unreachable without it.
 *
 * The first matters more than it looks. "No route reads the cookie" is a
 * property that holds until someone adds a route, and the person adding it
 * will not be thinking about this file. Stripping makes it hold regardless.
 */

/** Everything that authorizes money or account recovery. Token-only, forever. */
const TOKEN_ONLY = [
  "/api/confirm",
  "/api/security",
  "/api/panic",
  "/api/circle-webhook",
  "/api/whatsapp",
  "/api/telegram",
  "/api/cron",
  "/confirm",
  "/security",
  "/panic",
];

const ADMIN_PATHS = ["/admin", "/api/admin"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (TOKEN_ONLY.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    // Strip rather than ignore. These routes derive identity from their token
    // and nothing else, and that must stay true even if one of them acquires
    // a cookie read by accident.
    if (request.cookies.has(ADMIN_COOKIE_NAME)) {
      const headers = new Headers(request.headers);
      const surviving = request.cookies
        .getAll()
        .filter((c) => c.name !== ADMIN_COOKIE_NAME)
        .map((c) => `${c.name}=${c.value}`)
        .join("; ");

      if (surviving) headers.set("cookie", surviving);
      else headers.delete("cookie");

      return NextResponse.next({ request: { headers } });
    }
    return NextResponse.next();
  }

  if (ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    // The sign-in page itself has to be reachable while signed out.
    if (pathname === "/admin/login") return NextResponse.next();

    // Presence only. The signature, expiry and allowlist are verified in the
    // route, where node:crypto is available — this is a cheap early-out, not
    // the authorization decision, and it is deliberately not the only check.
    if (!request.cookies.has(ADMIN_COOKIE_NAME)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Not signed in" }, { status: 401 });
      }
      // Carries a reason so a bounce is diagnosable. "Nothing happened" is
      // the worst possible failure message, and it is what this looked like
      // when the cookie was SameSite=Strict: signed in successfully, then
      // silently returned to the login page.
      const login = new URL("/admin/login", request.url);
      login.searchParams.set("r", "nocookie");
      return NextResponse.redirect(login);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Everything except static assets. The strip has to run on the money routes
  // too, so this cannot be narrowed to /admin.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
