import { NextResponse } from "next/server";
import { buildAuthUrl, type GooglePurpose } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

const PURPOSES: GooglePurpose[] = ["freeze", "unfreeze", "link", "admin"];

/**
 * GET /api/auth/google/start?purpose=freeze|unfreeze|link&token=...
 *
 * Kicks off the Google round trip. Everything that has to survive it — the
 * PKCE verifier, what the user was doing, and for a link, which account asked
 * — travels in a signed `state` rather than a cookie or a table row.
 *
 * `token` is only meaningful for `link`, where an already-authenticated
 * channel minted it. `freeze` and `unfreeze` carry no token because the whole
 * premise is a user who cannot prove anything yet; Google is what identifies
 * them, and the callback decides what that is worth.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const purpose = searchParams.get("purpose") as GooglePurpose | null;
  const token = searchParams.get("token") ?? undefined;

  if (!purpose || !PURPOSES.includes(purpose)) {
    return NextResponse.json({ error: "Unknown purpose" }, { status: 400 });
  }

  if (purpose === "link" && !token) {
    return NextResponse.json({ error: "Missing link token" }, { status: 400 });
  }

  try {
    return NextResponse.redirect(buildAuthUrl({ purpose, token }));
  } catch (err) {
    console.error("[google] start failed", err);
    return NextResponse.json({ error: "Google sign-in isn't available" }, { status: 500 });
  }
}
