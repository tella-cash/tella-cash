import type { tellaSweep } from "@/lib/supabase/types";

/**
 * What a parked send should do, given where its sweep legs have got to.
 *
 * Pure, and the whole decision. The settle job asks this and acts on the
 * answer, so every combination of leg states that can occur has one tested
 * outcome instead of an if-chain spread across a job.
 *
 *   ready    every leg has minted on Arc. Run the send.
 *   waiting  at least one leg is still on its way and none has failed.
 *   abandon  the send cannot happen. `moved` says whether any user money left
 *            its wallet, because that decides what the user is told:
 *
 *              nothing   every leg failed before the pull, so no USDC moved.
 *              some      at least one leg pulled or minted, or is stuck. The
 *                        money is the user's and is either on Arc already or
 *                        being recovered; the SEND is what is cancelled.
 *
 * A single stuck or failed leg abandons the send at once, even while another
 * leg is still in flight. Waiting on legs that can no longer add up to the
 * amount would only make the user wait for a send that will not happen.
 */
export type Readiness =
  | { kind: "ready" }
  | { kind: "waiting" }
  | { kind: "abandon"; moved: "nothing" | "some"; stuck: boolean };

export function sweepSendReadiness(sweeps: tellaSweep[]): Readiness {
  // No legs recorded: nothing can ever fund this send, and "ready" would run
  // it against whatever happens to be on Arc.
  if (sweeps.length === 0) return { kind: "abandon", moved: "nothing", stuck: false };

  const stuck = sweeps.some((s) => s.status === "stuck");
  const failed = sweeps.some((s) => s.status === "failed");

  if (stuck || failed) {
    const anyMoved = sweeps.some((s) => s.status !== "failed" && s.status !== "created");
    return { kind: "abandon", moved: anyMoved ? "some" : "nothing", stuck };
  }

  if (sweeps.every((s) => s.status === "delivered")) return { kind: "ready" };
  return { kind: "waiting" };
}
