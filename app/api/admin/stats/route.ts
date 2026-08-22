import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, readAdminCookie } from "@/lib/admin/session";
import { loadDashboard } from "@/lib/analytics/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/stats
 *
 * Middleware has already checked that a cookie is PRESENT; this verifies that
 * it is valid, unexpired, and still on the allowlist. Both checks exist on
 * purpose — the middleware one is a cheap early-out that runs on the edge
 * without node:crypto, and this is the actual authorization decision.
 */
export async function GET() {
  const jar = await cookies();
  const identity = readAdminCookie(jar.get(ADMIN_COOKIE_NAME)?.value);

  if (!identity) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    return NextResponse.json(await loadDashboard());
  } catch (err) {
    console.error("[admin] stats failed", err);
    return NextResponse.json({ error: "Couldn't load stats" }, { status: 500 });
  }
}
