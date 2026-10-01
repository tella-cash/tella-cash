import type { SendPayload, tellaSweep, tellaSweepSend, tellaUser } from "@/lib/supabase/types";
import { listUserChainWallets } from "@/lib/chains/wallets";
import { advanceSweep } from "./advance";
import { realSweepDeps } from "./deps";
import type { Quote } from "./quote";
import { createSweep, transition } from "./repository";
import { createSweepSend, transitionSweepSend } from "./send-repository";
import { snapshotQuote } from "./snapshot";

export type StartSweepSendResult =
  | { ok: true; sweepSend: tellaSweepSend; sweeps: tellaSweep[] }
  // A leg could not be created: the user already has an unfinished sweep on
  // that chain (a stuck one keeps its slot on purpose). Nothing was started.
  | { ok: false; reason: "in_flight" | "no_wallet" };

/**
 * Park an authorized send and start the sweeps that fund it.
 *
 * The send is written FIRST and the legs second, so a leg is never funding a
 * send that does not exist. If a leg then cannot be created, the legs already
 * made are retired (they are still `created`, so nothing has touched the
 * chain: `failed` is the truth) and the send is cancelled. All or nothing:
 * half a top-up is a send that can never run.
 *
 * Each leg is given its first step immediately rather than waiting for the
 * next cron tick, which on GitHub's scheduler can be many minutes away. A
 * failure there is not a failure of the start: the sweep exists and the cron
 * will carry it on.
 */
export async function startSweepSend(args: {
  user: tellaUser;
  payload: SendPayload;
  quote: Extract<Quote, { kind: "sweep" }>;
}): Promise<StartSweepSendResult> {
  const { user, payload, quote } = args;

  const wallets = await listUserChainWallets(user.id);
  const addressByChain = new Map(wallets.map((w) => [w.chain.id, w.wallet.address]));
  if (quote.legs.some((l) => !addressByChain.has(l.chainId))) return { ok: false, reason: "no_wallet" };

  const sweepSend = await createSweepSend({ userId: user.id, payload, quote: snapshotQuote(quote) });

  const created: tellaSweep[] = [];
  for (const leg of quote.legs) {
    const r = await createSweep({
      userId: user.id,
      chainId: leg.chainId,
      address: addressByChain.get(leg.chainId)!,
      amountMicro: leg.amountMicro,
      maxFeeMicro: leg.maxFeeMicro,
      finality: leg.finality,
      sweepSendId: sweepSend.id,
    });
    if (!r.ok) {
      for (const s of created) {
        await transition(s.id, "created", "failed", { detail: "Retired before any step: a sibling leg could not be created." });
      }
      await transitionSweepSend(sweepSend.id, "sweeping", "cancelled", {
        detail: `Could not create a sweep on chain ${leg.blockchain}: one is already in flight.`,
      });
      return { ok: false, reason: "in_flight" };
    }
    created.push(r.sweep);
  }

  const deps = realSweepDeps();
  for (const s of created) {
    try {
      await advanceSweep(s, deps);
    } catch (err) {
      console.error("[sweeps] first step failed, the cron will retry", { sweepId: s.id, err });
    }
  }

  return { ok: true, sweepSend, sweeps: created };
}
