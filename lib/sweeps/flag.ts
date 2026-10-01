/**
 * Whether sends may be funded by a sweep.
 *
 * Off unless TELLA_SWEEP_SENDS is "on". With it off, every code path that
 * could start a sweep is skipped and the send flow behaves exactly as it did
 * before sweeps existed, so the code can ship ahead of the day it is switched
 * on, and be switched off again without a deploy if Circle's side misbehaves.
 */
export function sweepSendsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.TELLA_SWEEP_SENDS?.trim().toLowerCase() === "on";
}
