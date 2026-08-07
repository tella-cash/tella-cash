import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { listUsersNeedingWallet } from "@/lib/users/repository";
import { provisionWalletForUser } from "@/lib/wallet/provision";
import { notifyUser } from "@/lib/whatsapp/notify";
import { raiseAlert } from "@/lib/observability/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/retry-wallets
 *
 * The retry job that lib/wallet/provision.ts has always claimed exists.
 *
 * Its comment says "none → pending → failed (Circle errored; retry job will
 * pick up)", and the user is told "I couldn't set up your wallet just now —
 * I'll retry automatically". Neither was true: nothing ever retried, so a
 * user whose provisioning failed sat in wallet_status='failed' forever,
 * unable to receive or send, with a promise outstanding that no code kept.
 *
 * Also picks up users stuck in 'pending' past a grace period, which is what
 * a crash between markWalletPending and setWalletActive leaves behind.
 *
 * Retrying is safe: createWalletForUser passes the user id as Circle's
 * idempotencyKey, so a wallet that was actually created before the failure
 * is returned rather than duplicated.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let users;
  try {
    users = await listUsersNeedingWallet();
  } catch (err) {
    console.error("[cron:retry-wallets] lookup failed", err);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }

  if (users.length === 0) {
    return NextResponse.json({ checked: 0, recovered: 0 });
  }

  console.log("[cron:retry-wallets] retrying", { count: users.length });

  let recovered = 0;
  let stillFailing = 0;

  // Sequential, not parallel. This hits Circle's API on behalf of every
  // stuck user at once otherwise, and a burst against the same endpoint
  // that just failed them is not a recovery strategy.
  for (const user of users) {
    const ok = await provisionWalletForUser(user.id);
    if (!ok) {
      stillFailing++;
      continue;
    }
    recovered++;

    // They were told a retry would happen. Closing that loop is the point.
    try {
      await notifyUser({
        user,
        body: [
          "✅ Your wallet is ready.",
          "",
          'Ask me for your *address* to receive funds, or say *balance* to check it.',
        ].join("\n"),
      });
    } catch (err) {
      console.error("[cron:retry-wallets] ready notification failed", {
        userId: user.id,
        err,
      });
    }
  }

  console.log("[cron:retry-wallets] done", {
    checked: users.length,
    recovered,
    stillFailing,
  });

  // Users the retry couldn't rescue stay unable to send or receive. If this
  // keeps firing, Circle isn't having a blip — something is actually broken.
  if (stillFailing > 0) {
    raiseAlert({
      kind: "wallet_provisioning_stuck",
      message: `${stillFailing} user${stillFailing === 1 ? "" : "s"} still cannot be provisioned a wallet after a retry.`,
      context: { checked: users.length, recovered, stillFailing },
    });
  }

  return NextResponse.json({ checked: users.length, recovered, stillFailing });
}
