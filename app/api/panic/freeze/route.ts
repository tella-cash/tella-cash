import { NextResponse } from "next/server";
import { readJson } from "@/lib/http/json";
import { normalizePhone } from "@/lib/utils/phone";
import { findUserByWhatsApp } from "@/lib/users/repository";
import { verifyPanicCode } from "@/lib/security/panic-code";
import { freezeAccount } from "@/lib/users/freeze";
import { isFrozen } from "@/lib/users/wallet-gate";
import { recordAuthAttempt, formatRetryAfter } from "@/lib/auth/rate-limit";
import { notifyUser } from "@/lib/messaging/notify";

export const dynamic = "force-dynamic";

/**
 * POST /api/panic/freeze
 *
 * The door for someone who no longer has their phone. Phone number plus
 * panic code, from any device, and outbound money stops.
 *
 * Two properties this route has to hold, and they pull against each other:
 *
 *   1. It must not become a phone-number oracle. This is an unauthenticated
 *      endpoint that takes a phone number, so a wrong code and an unknown
 *      number return the SAME response. Otherwise anyone can walk a list of
 *      Nigerian mobile numbers and learn which ones hold a USDC wallet,
 *      which is a target list.
 *   2. It must give a real answer on success. Someone using this is not in a
 *      position to wonder whether it worked, so a success is unambiguous.
 *
 * Those coexist because success requires the code. Failure is uniform;
 * success is not reachable without knowing something only the owner knows.
 */
export async function POST(request: Request) {
  const parsed = await readJson<{ phone?: string; code?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  if (!body.phone || !body.code) {
    return NextResponse.json(
      { error: "Enter your phone number and your panic code." },
      { status: 400 },
    );
  }

  // The single failure response. Every unsuccessful path returns exactly
  // this, whatever actually went wrong.
  const refuse = () =>
    NextResponse.json(
      {
        error:
          "That phone number and panic code don't match. Check both and try again.",
      },
      { status: 401 },
    );

  const normalized = normalizePhone(body.phone);
  if (!normalized) return refuse();

  const user = await findUserByWhatsApp(`whatsapp:${normalized}`);
  if (!user) return refuse();

  // Counted before verification, so a crash mid-check still costs the
  // attacker an attempt — same ordering as the PIN verify route.
  const attempt = await recordAuthAttempt(user.id, "panic_code");
  if (!attempt.allowed) {
    return NextResponse.json(
      {
        error: `Too many attempts. Try again in ${formatRetryAfter(attempt.retryAfterSeconds)}.`,
      },
      { status: 429 },
    );
  }

  if (!(await verifyPanicCode(user, body.code))) return refuse();

  // Already frozen is a success, not an error. Someone hitting this twice
  // because they weren't sure the first one worked should be reassured, not
  // corrected.
  if (isFrozen(user)) {
    return NextResponse.json({ ok: true, alreadyFrozen: true, cancelledSends: 0 });
  }

  const { cancelledSends } = await freezeAccount({
    userId: user.id,
    source: "panic_code",
    reason: "panic code used on the web",
  });

  // Best-effort, and deliberately after the freeze rather than before it. If
  // the attacker still holds the phone they will see this, which is fine:
  // the account is already frozen by the time they do, and the legitimate
  // owner may well be reading the same thread from another device.
  try {
    await notifyUser({
      user,
      body: [
        "🔒 Your account was frozen using your panic code.",
        "",
        "Nothing can leave your wallet. You can still receive money.",
        "",
        "If this wasn't you, reply here straight away.",
      ].join("\n"),
    });
  } catch (err) {
    console.error("[panic] freeze notification failed", { userId: user.id, err });
  }

  return NextResponse.json({ ok: true, alreadyFrozen: false, cancelledSends });
}
