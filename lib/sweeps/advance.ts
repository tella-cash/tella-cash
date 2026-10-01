import type { SweepStatus, tellaChain, tellaSweep } from "@/lib/supabase/types";
import type { CircleTxStatus, ContractCall } from "@/lib/wallet/circle";
import type { Delivery } from "./iris";
import type { SweepPatch } from "./repository";
import { microFromDb } from "./micro";
import {
  ARC_CCTP_DOMAIN,
  ZERO_BYTES32,
  addressToBytes32,
  evmChainIdFor,
  forwardHookData,
  receiveAuthorizationTypedData,
  splitSignature,
  stepIdempotencyKey,
  tokenMessengerFor,
} from "./cctp";

/**
 * The sweep saga: one step per call.
 *
 * `advanceSweep` looks at where a sweep is, does the ONE thing that state
 * calls for, and records it. It never loops. A step that submits a transaction
 * returns immediately and the next call — the next cron tick, or the caller
 * that just created the sweep — checks whether that transaction finished.
 * Keeping each call to a single step is what makes every crash point a state
 * the row already describes.
 *
 * WHAT EACH FAILURE MEANS FOR THE USER'S MONEY. This is the part worth
 * reading before changing anything:
 *
 *   before the pull confirms   nothing has left the user's wallet. Failure is
 *                              `failed`: safe, and the user keeps their USDC.
 *   after the pull confirms    the USDC is in tella's sweeper wallet. A failure
 *                              here is `stuck`, never `failed` — "failed" would
 *                              tell the next reader that nothing moved.
 *   after the burn confirms    the USDC no longer exists on the source chain.
 *                              It is Circle's to mint. Failure to see it minted
 *                              is `stuck` (or an alert, while it is only late).
 *
 * Every dependency is passed in (`SweepDeps`) so the whole machine can be run
 * against fakes; the real ones are in deps.ts.
 */

/** How long a burn may be in flight before someone is told. */
export const STALL_AFTER_MINUTES = 30;

export interface SweepContext {
  chain: tellaChain;
  /** Circle wallet id of the USER's wallet on the source chain: what signs. */
  userWalletId: string;
  /** tella's own smart-contract wallet on the source chain: what submits. */
  sweeperWalletId: string;
  sweeperAddress: string;
  network: "mainnet" | "testnet";
}

export interface SweepDeps {
  now(): number;
  context(sweep: tellaSweep): Promise<SweepContext>;
  sign(walletId: string, typedData: string, memo: string): Promise<string>;
  submit(call: ContractCall): Promise<{ transactionId: string }>;
  txStatus(circleTxId: string): Promise<CircleTxStatus>;
  delivery(sourceDomain: number, burnTxHash: string): Promise<Delivery>;
  transition(
    id: string,
    from: SweepStatus,
    to: SweepStatus,
    patch?: SweepPatch,
  ): Promise<tellaSweep | null>;
  alert(kind: "sweep_stuck" | "sweep_stalled", message: string, sweep: tellaSweep): void;
}

export type Advance =
  | { moved: true; sweep: tellaSweep }
  // Nothing to do yet (a transaction still pending), or another runner moved
  // it first. Either way the caller has nothing to react to.
  | { moved: false; sweep: tellaSweep };

const RECEIVE_AUTH_SIG =
  "receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)";
const APPROVE_SIG = "approve(address,uint256)";
const BURN_SIG = "depositForBurnWithHook(uint256,uint32,bytes32,address,bytes32,uint256,uint32,bytes)";

function ageMinutes(iso: string, now: number): number {
  return (now - new Date(iso).getTime()) / 60_000;
}

export async function advanceSweep(sweep: tellaSweep, deps: SweepDeps): Promise<Advance> {
  switch (sweep.status) {
    case "created":
      return submitPull(sweep, deps);
    case "pull_submitted":
      return await settle(sweep, deps, sweep.pull_circle_tx_id, {
        to: "pulled",
        // The pull reverting means the USDC never left the user's wallet.
        onFailure: "failed",
        what: "the pull from the user's wallet",
      });
    case "pulled":
      return submitApprove(sweep, deps);
    case "approve_submitted":
      return await settle(sweep, deps, sweep.approve_circle_tx_id, {
        to: "approved",
        onFailure: "stuck",
        what: "the approval",
      });
    case "approved":
      return submitBurn(sweep, deps);
    case "burn_submitted":
      return settleBurn(sweep, deps);
    case "burned":
      return checkDelivery(sweep, deps);
    case "delivered":
    case "failed":
    case "stuck":
      return { moved: false, sweep };
  }
}

/** Common tail: a CAS that reports whether this caller was the mover. */
async function move(
  sweep: tellaSweep,
  deps: SweepDeps,
  to: SweepStatus,
  patch: SweepPatch = {},
): Promise<Advance> {
  const updated = await deps.transition(sweep.id, sweep.status, to, patch);
  return updated ? { moved: true, sweep: updated } : { moved: false, sweep };
}

async function toStuck(sweep: tellaSweep, deps: SweepDeps, detail: string): Promise<Advance> {
  const result = await move(sweep, deps, "stuck", { detail });
  if (result.moved) deps.alert("sweep_stuck", detail, result.sweep);
  return result;
}

async function submitPull(sweep: tellaSweep, deps: SweepDeps): Promise<Advance> {
  const validBeforeMs = new Date(sweep.auth_valid_before).getTime();

  // Past its authorisation, and still 'created'. Not `failed`: a previous run
  // may have submitted the pull and died before recording it, and "failed"
  // would assert that nothing moved. A person can settle it in a minute by
  // looking at Circle for a pull under this sweep's idempotency key.
  if (deps.now() >= validBeforeMs) {
    return toStuck(
      sweep,
      deps,
      "The user's authorisation expired before the pull was recorded. Check Circle for a pull transaction under this sweep before treating it as not started.",
    );
  }

  const ctx = await deps.context(sweep);
  const chainId = evmChainIdFor(ctx.chain.blockchain);
  if (chainId === null) {
    // Nothing has been signed or submitted, so this really is safe to fail.
    return move(sweep, deps, "failed", {
      detail: `No EVM chain id is known for ${ctx.chain.blockchain}; it cannot be swept.`,
    });
  }

  const value = microFromDb(sweep.amount_micro);
  const validBefore = Math.floor(validBeforeMs / 1000);

  const typedData = receiveAuthorizationTypedData({
    usdc: ctx.chain.usdc_address,
    chainId,
    from: sweep.address,
    to: ctx.sweeperAddress,
    value,
    validAfter: 0,
    validBefore,
    nonce: sweep.auth_nonce,
  });

  const signature = await deps.sign(ctx.userWalletId, typedData, "Move USDC to Arc");
  const { v, r, s } = splitSignature(signature);

  const { transactionId } = await deps.submit({
    walletId: ctx.sweeperWalletId,
    contractAddress: ctx.chain.usdc_address,
    abiFunctionSignature: RECEIVE_AUTH_SIG,
    abiParameters: [
      sweep.address,
      ctx.sweeperAddress,
      value.toString(),
      "0",
      String(validBefore),
      sweep.auth_nonce,
      v,
      r,
      s,
    ],
    idempotencyKey: stepIdempotencyKey(sweep.id, "pull"),
  });

  return move(sweep, deps, "pull_submitted", { pull_circle_tx_id: transactionId });
}

async function submitApprove(sweep: tellaSweep, deps: SweepDeps): Promise<Advance> {
  const ctx = await deps.context(sweep);
  const { transactionId } = await deps.submit({
    walletId: ctx.sweeperWalletId,
    contractAddress: ctx.chain.usdc_address,
    abiFunctionSignature: APPROVE_SIG,
    abiParameters: [tokenMessengerFor(ctx.network), sweep.amount_micro],
    idempotencyKey: stepIdempotencyKey(sweep.id, "approve"),
  });
  return move(sweep, deps, "approve_submitted", { approve_circle_tx_id: transactionId });
}

async function submitBurn(sweep: tellaSweep, deps: SweepDeps): Promise<Advance> {
  const ctx = await deps.context(sweep);
  const { transactionId } = await deps.submit({
    walletId: ctx.sweeperWalletId,
    contractAddress: tokenMessengerFor(ctx.network),
    abiFunctionSignature: BURN_SIG,
    abiParameters: [
      sweep.amount_micro,
      ARC_CCTP_DOMAIN,
      // The user's own address. The mint goes to the same wallet the burn
      // came from; nothing in this file ever chooses a different one.
      addressToBytes32(sweep.address),
      ctx.chain.usdc_address,
      // Zero, so any party may submit the mint. Also what Circle's
      // forwarder requires.
      ZERO_BYTES32,
      sweep.max_fee_micro,
      sweep.finality_threshold,
      forwardHookData(),
    ],
    idempotencyKey: stepIdempotencyKey(sweep.id, "burn"),
  });
  return move(sweep, deps, "burn_submitted", { burn_circle_tx_id: transactionId });
}

async function settle(
  sweep: tellaSweep,
  deps: SweepDeps,
  circleTxId: string | null,
  o: { to: SweepStatus; onFailure: "failed" | "stuck"; what: string },
): Promise<Advance> {
  if (!circleTxId) {
    // A submitted state with no transaction id cannot be reasoned about.
    return toStuck(sweep, deps, `Sweep is ${sweep.status} but has no Circle transaction id for ${o.what}.`);
  }

  const status = await deps.txStatus(circleTxId);
  if (status.outcome === "complete") return move(sweep, deps, o.to);

  if (status.outcome === "failed") {
    const detail = `${o.what} did not go through (${status.state}${status.reason ? `: ${status.reason}` : ""}).`;
    return o.onFailure === "stuck"
      ? toStuck(sweep, deps, detail)
      : move(sweep, deps, "failed", { detail });
  }

  await maybeStalled(sweep, deps, o.what);
  return { moved: false, sweep };
}

async function settleBurn(sweep: tellaSweep, deps: SweepDeps): Promise<Advance> {
  if (!sweep.burn_circle_tx_id) {
    return toStuck(sweep, deps, "Sweep is burn_submitted but has no Circle transaction id for the burn.");
  }

  const status = await deps.txStatus(sweep.burn_circle_tx_id);

  if (status.outcome === "failed") {
    // The burn reverted, so the USDC is still in the sweeper wallet.
    return toStuck(
      sweep,
      deps,
      `The burn did not go through (${status.state}${status.reason ? `: ${status.reason}` : ""}). The USDC is in the sweeper wallet.`,
    );
  }

  if (status.outcome === "pending") {
    await maybeStalled(sweep, deps, "the burn");
    return { moved: false, sweep };
  }

  // Complete but no hash: Iris is asked by hash, so nothing can be followed.
  if (!status.txHash) {
    return toStuck(
      sweep,
      deps,
      "The burn completed but Circle gave no transaction hash, so it cannot be followed. Find it on the explorer.",
    );
  }

  return move(sweep, deps, "burned", { burn_tx_hash: status.txHash });
}

async function checkDelivery(sweep: tellaSweep, deps: SweepDeps): Promise<Advance> {
  if (!sweep.burn_tx_hash) {
    return toStuck(sweep, deps, "Sweep is burned but has no burn hash.");
  }
  const ctx = await deps.context(sweep);

  let d: Delivery;
  try {
    d = await deps.delivery(ctx.chain.cctp_domain, sweep.burn_tx_hash);
  } catch {
    // Could not ask. That says nothing about Circle minting; try next time.
    return { moved: false, sweep };
  }

  if (d.state === "delivered") {
    return move(sweep, deps, "delivered", { forward_tx_hash: d.forwardTxHash ?? undefined });
  }

  if (d.state === "failed" || d.state === "claimable") {
    return toStuck(
      sweep,
      deps,
      `Burned and attested, but Circle did not mint it on Arc (${d.state}${d.reason ? `: ${d.reason}` : ""}). It can be minted by anyone with the attestation.`,
    );
  }

  await maybeStalled(sweep, deps, "Circle's mint on Arc");
  return { moved: false, sweep };
}

async function maybeStalled(sweep: tellaSweep, deps: SweepDeps, what: string): Promise<void> {
  if (ageMinutes(sweep.progressed_at, deps.now()) < STALL_AFTER_MINUTES) return;
  deps.alert(
    "sweep_stalled",
    `Waiting on ${what} for over ${STALL_AFTER_MINUTES} minutes (sweep status ${sweep.status}).`,
    sweep,
  );
}
