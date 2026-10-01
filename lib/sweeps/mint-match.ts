import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { tellaSweep } from "@/lib/supabase/types";
import { microFromDb } from "./micro";
import { transition } from "./repository";

/**
 * Recognising the end of a sweep when Circle tells us about it.
 *
 * The mint lands in the user's Arc wallet and Circle reports it like any other
 * deposit, with a source address that is Circle's, not anyone's the user knows.
 * Left alone, the webhook would tell the user "Received 24.98 USDC from 0x81d4…"
 * for money that is theirs and already accounted for. So before announcing an
 * inbound, the webhook asks whether it is one of ours.
 *
 * There is no memo on a CCTP mint to match on, so the match is on what is
 * known: whose wallet, which sweeps are still waiting, and whether the amount
 * is one a sweep could have produced. The ways this can go wrong are not
 * symmetric, and the rules lean accordingly:
 *
 *   swallow a real deposit  bad: the user is never told, and the money is not
 *                           in their history.
 *   announce a sweep mint   embarrassing: a confusing message, money correct.
 *
 * so the amount window is tight, a delivered sweep only matches for a short
 * time, and a sweep whose mint hash is already known matches on the hash alone.
 */

/** Postgres undefined_table. */
const UNDEFINED_TABLE = "42P01";

/** How long after `delivered` a mint notification can still be matched by amount. */
export const DELIVERED_MATCH_WINDOW_MS = 6 * 60 * 60 * 1000;

export interface MintObservation {
  amountMicro: bigint;
  txHash: string | null;
  now: number;
}

function sameHash(a: string | null, b: string | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/** The mint is the burn amount less what Circle kept, so it is never above it and never below amount - maxFee. */
function amountFits(sweep: tellaSweep, received: bigint): boolean {
  const amount = microFromDb(sweep.amount_micro);
  const maxFee = microFromDb(sweep.max_fee_micro);
  const floor = amount > maxFee ? amount - maxFee : BigInt(0);
  return received <= amount && received >= floor;
}

/**
 * Pure: which of a user's sweeps, if any, does this mint belong to.
 * Candidates are expected to be that user's, but a sweep already matched, or
 * one that can no longer be waiting on a mint, is skipped here regardless.
 */
export function pickSweepForMint(candidates: tellaSweep[], mint: MintObservation): tellaSweep | null {
  const live = candidates.filter((s) => {
    if (s.mint_matched_at) return false;
    if (s.status === "burn_submitted" || s.status === "burned") return true;
    if (s.status === "delivered") {
      // Delivered means tella has already seen Circle report the mint. The
      // notification is late, not a stranger's deposit — but only recently so.
      return mint.now - new Date(s.progressed_at).getTime() <= DELIVERED_MATCH_WINDOW_MS;
    }
    return false;
  });

  // A hash we recorded from Circle is decisive: it matches, or it rules out.
  const byHash = live.find((s) => sameHash(s.forward_tx_hash, mint.txHash));
  if (byHash) return byHash;

  const byAmount = live
    .filter((s) => !s.forward_tx_hash) // a known, different hash is a different transaction
    .filter((s) => amountFits(s, mint.amountMicro))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return byAmount[0] ?? null;
}

/**
 * If this inbound is the mint of one of the user's sweeps, consume the match
 * and return that sweep; otherwise null and the caller announces as usual.
 *
 * Throws on a database failure. The caller must let that propagate: the webhook
 * then releases its claim and Circle redelivers, which is the right outcome —
 * guessing "not a sweep" on an error is exactly how a false announcement gets
 * sent.
 */
export async function claimSweepMint(userId: string, mint: MintObservation): Promise<tellaSweep | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("tella_sweeps")
    .select("*")
    .eq("user_id", userId)
    .is("mint_matched_at", null)
    .in("status", ["burn_submitted", "burned", "delivered"]);
  // 42P01: the table is not there. That is a deployment that has run ahead of
  // migration 0029, not a database failure, and it must not stop users hearing
  // about money that arrived: with no sweeps table there are no sweeps, so no
  // inbound can be the end of one. Any other error still throws.
  if (error?.code === UNDEFINED_TABLE) return null;
  if (error) throw new Error(`claimSweepMint lookup failed: ${error.message}`);

  const sweep = pickSweepForMint((data as tellaSweep[]) ?? [], mint);
  if (!sweep) return null;

  // Consume it. Only one of two racing notifications gets the row back.
  const { data: claimed, error: claimErr } = await getSupabaseAdmin()
    .from("tella_sweeps")
    .update({ mint_matched_at: new Date(mint.now).toISOString() })
    .eq("id", sweep.id)
    .is("mint_matched_at", null)
    .select()
    .maybeSingle();
  if (claimErr) throw new Error(`claimSweepMint claim failed: ${claimErr.message}`);
  if (!claimed) return null;

  // The webhook may well beat the advance job to it. The mint is proof of
  // delivery; the advance job's own move is a compare-and-set, so if it got
  // there first this is a harmless no-op and the reverse holds too.
  if (sweep.status === "burn_submitted" || sweep.status === "burned") {
    await transition(sweep.id, sweep.status, "delivered", {
      forward_tx_hash: mint.txHash ?? undefined,
    });
  }
  return claimed as tellaSweep;
}
