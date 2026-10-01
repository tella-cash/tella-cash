import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { advanceSweep } from "@/lib/sweeps/advance";
import { realSweepDeps } from "@/lib/sweeps/deps";
import { listAdvanceableSweeps } from "@/lib/sweeps/repository";
import { settleSweepSends } from "@/lib/sweeps/settle";
import { realSettleDeps } from "@/lib/sweeps/settle-deps";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Stop starting new sweeps after this, leaving room inside maxDuration. */
const BUDGET_MS = 240_000;

/**
 * GET /api/cron/advance-sweeps
 *
 * Gives every unfinished sweep one step (see lib/sweeps/advance.ts). A sweep
 * that submits a transaction is checked on the next run, so a sweep takes a
 * handful of runs end to end; the send path that creates one can also call
 * advanceSweep itself to skip the first wait.
 *
 * Safe to run twice at once: every write is a compare-and-set on the status
 * and every Circle call carries a per-step idempotency key.
 *
 * One sweep failing never stops the others. A stuck sweep is not retried here
 * (listAdvanceableSweeps leaves it out) and has already raised its alert.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sweeps;
  try {
    sweeps = await listAdvanceableSweeps(50);
  } catch (err) {
    console.error("[cron:advance-sweeps] lookup failed", err);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }

  const deps = realSweepDeps();
  const started = Date.now();
  let moved = 0;
  let errors = 0;

  for (const sweep of sweeps) {
    if (Date.now() - started > BUDGET_MS) break;
    try {
      const r = await advanceSweep(sweep, deps);
      if (r.moved) moved++;
    } catch (err) {
      // Left where it is. The next run sees the same row and tries again,
      // which is right for a Circle timeout and loud enough (one line per
      // run) for anything that is not.
      errors++;
      console.error("[cron:advance-sweeps] step failed", { sweepId: sweep.id, status: sweep.status, err });
    }
  }

  // Then the sends those sweeps were funding. After the advance, so a sweep
  // that just delivered is settled in the same run instead of the next one.
  // A failure here never hides the advance's own result.
  let settled = null;
  try {
    settled = await settleSweepSends(realSettleDeps());
  } catch (err) {
    console.error("[cron:advance-sweeps] settling parked sends failed", err);
  }

  console.log("[cron:advance-sweeps] done", { open: sweeps.length, moved, errors, settled });
  return NextResponse.json({ open: sweeps.length, moved, errors, settled });
}
