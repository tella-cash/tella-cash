import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { listActiveChains } from "@/lib/chains/config";
import { backfillChain } from "@/lib/chains/wallets";
import { raiseAlert } from "@/lib/observability/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Stop starting new batches after this, leaving room inside maxDuration. */
const BUDGET_MS = 240_000;

/**
 * GET /api/cron/chain-wallets
 *
 * Gives every user a Circle wallet record on each chain tella watches besides
 * Arc. New users get theirs when their Arc wallet is created; this covers
 * everyone who did not — accounts that predate the chain, users whose derive
 * failed, and, most importantly, every user the moment an admin adds a chain.
 *
 * Adding a chain writes one row and returns. It does not derive thousands of
 * wallets inside an admin's button press; it leaves this job to work through
 * them in batches, which is why a newly added chain reaches everyone over the
 * next few runs rather than instantly.
 *
 * Safe to run twice at once and safe to re-run: Circle returns the existing
 * record for an already-derived wallet, and the row is written with
 * ignoreDuplicates.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let chains;
  try {
    chains = await listActiveChains();
  } catch (err) {
    console.error("[cron:chain-wallets] chain lookup failed", err);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }

  const started = Date.now();
  let checked = 0;
  let created = 0;
  let failed = 0;

  for (const chain of chains) {
    // A chain's backlog is worked in batches until it is empty or the budget
    // is spent; whatever is left is still "missing" and the next run has it.
    for (;;) {
      if (Date.now() - started > BUDGET_MS) break;
      try {
        const r = await backfillChain(chain, 25);
        checked += r.checked;
        created += r.created;
        failed += r.failed;
        // Nothing missing — or nothing but failures, which would loop here
        // forever if we asked again straight away.
        if (r.checked === 0 || r.created === 0) break;
      } catch (err) {
        console.error("[cron:chain-wallets] batch failed", {
          blockchain: chain.blockchain,
          err,
        });
        failed++;
        break;
      }
    }
  }

  console.log("[cron:chain-wallets] done", { chains: chains.length, checked, created, failed });

  if (failed > 0) {
    raiseAlert({
      kind: "wallet_provisioning_stuck",
      message: `${failed} chain wallet${failed === 1 ? "" : "s"} could not be created on the last run. Deposits on those chains will not be announced for the affected users until it succeeds.`,
      context: { chains: chains.length, checked, created, failed },
    });
  }

  return NextResponse.json({ chains: chains.length, checked, created, failed });
}
