import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, readAdminCookie } from "@/lib/admin/session";
import { parsePeriod } from "@/lib/analytics/period";
import { loadAnalytics } from "@/lib/analytics/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/stats?period=all|day|week|month
 *
 * The same figures the dashboard page renders, for the same period values.
 *
 * Middleware has already checked that a cookie is PRESENT; this verifies that
 * it is valid, unexpired, and still on the allowlist. Both checks exist on
 * purpose — the middleware one is a cheap early-out that runs on the edge
 * without node:crypto, and this is the actual authorization decision.
 */
export async function GET(request: Request) {
  const jar = await cookies();
  const identity = readAdminCookie(jar.get(ADMIN_COOKIE_NAME)?.value);

  if (!identity) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const period = parsePeriod(new URL(request.url).searchParams.get("period"));
    return NextResponse.json(await loadAnalytics({ period }));
  } catch (err) {
    console.error("[admin] stats failed", err);
    return NextResponse.json({ error: "Couldn't load stats" }, { status: 500 });
  }
}
