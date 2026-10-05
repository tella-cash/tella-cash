import type { PendingSend, tellaUser } from "@/lib/supabase/types";
import { resolveLimits } from "@/lib/sends/limits";
import { tierFor } from "@/lib/sends/tiers";
import { sweepSendsEnabled } from "./flag";
import { planSweepSend } from "./plan";
import type { Quote } from "./quote";
import { startSweepSend } from "./start";

/**
 * What funding a send by sweep would take, or null for "not by sweep".
 *
 * Shared by the compose step (which tells the user what it will cost) and the
 * confirm step (which does it), so the number promised and the number charged
 * come from one place. Null is the answer to every doubt: sweeps off, nothing
 * elsewhere, a failure reading anything. This only ever adds a way for a send
 * to succeed; it must never be the reason one fails differently from before,
 * so it never throws.
 *
 * A send in the hold tier is not swept. It waits out its hold and then runs
 * through the release job, which has no sweep step, so starting one now would
 * only move money for a send that is not going out today. Those keep the
 * ordinary insufficient-balance answer until the release job learns to fund
 * from a sweep.
 */
export async function quoteSweepFunding(args: { user: tellaUser; amount: string }): Promise<Quote | null> {
  if (!sweepSendsEnabled()) return null;
  const { user, amount } = args;
  try {
    const limits = await resolveLimits(user.id);
    if (tierFor(Number.parseFloat(amount), limits, user.factors_changed_at) === "hold") return null;
    return await planSweepSend({ user, amount });
  } catch (err) {
    console.error("[sweeps] could not quote a sweep, refusing as before", { userId: user.id, err });
    return null;
  }
}

/** Park a confirmed send and start the sweeps that fund it. Null if it cannot be done. */
export async function fundSendBySweep(args: {
  user: tellaUser;
  pending: PendingSend;
}): Promise<Awaited<ReturnType<typeof startSweepSend>> | null> {
  const { user, pending } = args;
  const p = pending.payload;

  const quote = await quoteSweepFunding({ user, amount: p.amount });
  if (!quote || quote.kind !== "sweep") return null;

  try {
    const started = await startSweepSend({ user, payload: p, quote });
    return started.ok ? started : null;
  } catch (err) {
    console.error("[sweeps] could not start a sweep, refusing as before", { userId: user.id, err });
    return null;
  }
}
