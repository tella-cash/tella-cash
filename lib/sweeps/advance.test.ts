/**
 * The sweep saga against fake dependencies. Runner-free — run with `pnpm test`.
 *
 * The properties worth pinning are about what each failure is allowed to be
 * called. A sweep that never took the user's money may be `failed`. One that
 * did — pulled, approved, burned — may only ever be `stuck`, because "failed"
 * tells the next reader that nothing moved.
 */

import type { SweepStatus, tellaChain, tellaSweep } from "@/lib/supabase/types";
import type { CircleTxStatus, ContractCall } from "@/lib/wallet/circle";
import { advanceSweep, STALL_AFTER_MINUTES, type SweepDeps } from "./advance";
import type { Delivery } from "./iris";
import { stepIdempotencyKey } from "./cctp";

const NOW = Date.parse("2026-09-27T12:00:00Z");
const ADDR = "0x1234567890abcdef1234567890abcdef12345678";
const SWEEPER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

const CHAIN = {
  id: "chain-1", slug: "base", display_name: "Base", network: "mainnet", blockchain: "BASE",
  usdc_address: USDC, cctp_domain: 6, explorer_tx_url: "https://basescan.org/tx",
  added_by: null, created_at: "2026-09-21T00:00:00Z",
} as tellaChain;

function sweep(over: Partial<tellaSweep> = {}): tellaSweep {
  return {
    id: "sweep-1", user_id: "user-1", chain_id: "chain-1", status: "created",
    amount_micro: "10000000", max_fee_micro: "19546", finality_threshold: 1000,
    address: ADDR, auth_nonce: "0x" + "ab".repeat(32),
    auth_valid_before: new Date(NOW + 3_600_000).toISOString(),
    pull_circle_tx_id: null, approve_circle_tx_id: null, burn_circle_tx_id: null,
    burn_tx_hash: null, forward_tx_hash: null, mint_matched_at: null, sweep_send_id: null, detail: null,
    created_at: new Date(NOW).toISOString(), updated_at: new Date(NOW).toISOString(),
    progressed_at: new Date(NOW).toISOString(),
    ...over,
  };
}

interface Harness {
  deps: SweepDeps;
  submitted: ContractCall[];
  alerts: string[];
  /** The row as the fake database holds it. */
  row: { current: tellaSweep };
}

function harness(o: {
  tx?: CircleTxStatus;
  delivery?: Delivery | Error;
  now?: number;
  /** Simulate another runner having moved the sweep first. */
  lose?: boolean;
} = {}): Harness {
  const submitted: ContractCall[] = [];
  const alerts: string[] = [];
  const row = { current: sweep() };
  const deps: SweepDeps = {
    now: () => o.now ?? NOW,
    context: async () => ({
      chain: CHAIN, userWalletId: "uw-1", sweeperWalletId: "sw-1", sweeperAddress: SWEEPER, network: "mainnet",
    }),
    sign: async () => "0x" + "11".repeat(32) + "22".repeat(32) + "1b",
    submit: async (call) => { submitted.push(call); return { transactionId: `circle-tx-${submitted.length}` }; },
    txStatus: async () => o.tx ?? { outcome: "pending", state: "SENT", txHash: null, reason: null },
    delivery: async () => {
      if (o.delivery instanceof Error) throw o.delivery;
      return o.delivery ?? { state: "waiting", forwardTxHash: null, reason: null };
    },
    transition: async (id, from, to, patch) => {
      if (o.lose || row.current.status !== from) return null;
      row.current = { ...row.current, ...patch, status: to, progressed_at: new Date(o.now ?? NOW).toISOString() } as tellaSweep;
      return row.current;
    },
    alert: (kind, message) => { alerts.push(`${kind}: ${message}`); },
  };
  return { deps, submitted, alerts, row };
}

const OK_TX: CircleTxStatus = { outcome: "complete", state: "COMPLETE", txHash: "0xburnhash", reason: null };
const FAILED_TX: CircleTxStatus = { outcome: "failed", state: "FAILED", txHash: null, reason: "reverted" };

async function run(status: SweepStatus, over: Partial<tellaSweep>, o: Parameters<typeof harness>[0] = {}) {
  const h = harness(o);
  h.row.current = sweep({ status, ...over });
  const result = await advanceSweep(h.row.current, h.deps);
  return { h, result };
}

type Check = [string, () => Promise<boolean>];

const CHECKS: Check[] = [
  [
    "created: signs and submits the pull, naming the sweeper as recipient",
    async () => {
      const { h, result } = await run("created", {});
      const call = h.submitted[0];
      return result.moved && result.sweep.status === "pull_submitted" &&
        result.sweep.pull_circle_tx_id === "circle-tx-1" &&
        call.walletId === "sw-1" && call.contractAddress === USDC &&
        call.abiParameters[0] === ADDR && call.abiParameters[1] === SWEEPER &&
        call.abiParameters[2] === "10000000" &&
        call.idempotencyKey === stepIdempotencyKey("sweep-1", "pull");
    },
  ],
  [
    "created: an expired authorisation is stuck, not failed — a pull may have gone out unrecorded",
    async () => {
      const { h, result } = await run("created", { auth_valid_before: new Date(NOW - 1).toISOString() });
      return result.moved && result.sweep.status === "stuck" && h.submitted.length === 0 && h.alerts.length === 1;
    },
  ],
  [
    "pull_submitted: pending waits and does not move",
    async () => {
      const { result } = await run("pull_submitted", { pull_circle_tx_id: "t1" });
      return !result.moved && result.sweep.status === "pull_submitted";
    },
  ],
  [
    "pull_submitted: a confirmed pull moves to pulled",
    async () => {
      const { result } = await run("pull_submitted", { pull_circle_tx_id: "t1" }, { tx: OK_TX });
      return result.moved && result.sweep.status === "pulled";
    },
  ],
  [
    "pull_submitted: a reverted pull is `failed` — the user's USDC never moved",
    async () => {
      const { h, result } = await run("pull_submitted", { pull_circle_tx_id: "t1" }, { tx: FAILED_TX });
      return result.moved && result.sweep.status === "failed" && h.alerts.length === 0;
    },
  ],
  [
    "pulled: approves exactly the amount, to Circle's token messenger",
    async () => {
      const { h, result } = await run("pulled", {});
      return result.moved && result.sweep.status === "approve_submitted" &&
        h.submitted[0].abiFunctionSignature === "approve(address,uint256)" &&
        h.submitted[0].abiParameters[1] === "10000000" &&
        h.submitted[0].idempotencyKey === stepIdempotencyKey("sweep-1", "approve");
    },
  ],
  [
    "approve_submitted: a failed approval is stuck — the USDC is in the sweeper",
    async () => {
      const { h, result } = await run("approve_submitted", { approve_circle_tx_id: "t2" }, { tx: FAILED_TX });
      return result.moved && result.sweep.status === "stuck" && h.alerts.length === 1;
    },
  ],
  [
    "approved: burns to Arc for the user's own address, zero destination caller, with the hook",
    async () => {
      const { h, result } = await run("approved", {});
      const p = h.submitted[0].abiParameters;
      return result.moved && result.sweep.status === "burn_submitted" &&
        p[0] === "10000000" && p[1] === 26 &&
        p[2] === "0x" + "00".repeat(12) + ADDR.slice(2) &&
        p[3] === USDC && p[4] === "0x" + "00".repeat(32) &&
        p[5] === "19546" && p[6] === 1000 &&
        typeof p[7] === "string" && (p[7] as string).startsWith("0x636374702d666f7277617264");
    },
  ],
  [
    "burn_submitted: a confirmed burn records the hash and becomes burned",
    async () => {
      const { result } = await run("burn_submitted", { burn_circle_tx_id: "t3" }, { tx: OK_TX });
      return result.moved && result.sweep.status === "burned" && result.sweep.burn_tx_hash === "0xburnhash";
    },
  ],
  [
    "burn_submitted: a burn with no hash cannot be followed and is stuck",
    async () => {
      const { result } = await run("burn_submitted", { burn_circle_tx_id: "t3" }, { tx: { ...OK_TX, txHash: null } });
      return result.moved && result.sweep.status === "stuck";
    },
  ],
  [
    "burn_submitted: a reverted burn is stuck, never failed",
    async () => {
      const { result } = await run("burn_submitted", { burn_circle_tx_id: "t3" }, { tx: FAILED_TX });
      return result.moved && result.sweep.status === "stuck";
    },
  ],
  [
    "burned: Circle reporting the mint delivers it",
    async () => {
      const { result } = await run("burned", { burn_tx_hash: "0xh" }, { delivery: { state: "delivered", forwardTxHash: "0xarc", reason: null } });
      return result.moved && result.sweep.status === "delivered" && result.sweep.forward_tx_hash === "0xarc";
    },
  ],
  [
    "burned: waiting inside the window is quiet",
    async () => {
      const { h, result } = await run("burned", { burn_tx_hash: "0xh" });
      return !result.moved && h.alerts.length === 0;
    },
  ],
  [
    "burned: waiting past the window raises a stall alert but does not give up",
    async () => {
      const later = NOW + (STALL_AFTER_MINUTES + 1) * 60_000;
      const { h, result } = await run("burned", { burn_tx_hash: "0xh" }, { now: later });
      return !result.moved && result.sweep.status === "burned" && h.alerts.length === 1 && h.alerts[0].startsWith("sweep_stalled");
    },
  ],
  [
    "burned: a forward Circle reports as failed is stuck and alerts",
    async () => {
      const { h, result } = await run("burned", { burn_tx_hash: "0xh" }, { delivery: { state: "failed", forwardTxHash: null, reason: "INSUFFICIENT_FEE" } });
      return result.moved && result.sweep.status === "stuck" && h.alerts[0].includes("INSUFFICIENT_FEE");
    },
  ],
  [
    "burned: attested but not forwarded is stuck",
    async () => {
      const { result } = await run("burned", { burn_tx_hash: "0xh" }, { delivery: { state: "claimable", forwardTxHash: null, reason: null } });
      return result.moved && result.sweep.status === "stuck";
    },
  ],
  [
    "burned: Iris being unreachable says nothing about the mint, so it just waits",
    async () => {
      const { h, result } = await run("burned", { burn_tx_hash: "0xh" }, { delivery: new Error("timeout") });
      return !result.moved && result.sweep.status === "burned" && h.alerts.length === 0;
    },
  ],
  [
    "losing the race to another runner is a no-op, not a second move",
    async () => {
      const { result } = await run("pull_submitted", { pull_circle_tx_id: "t1" }, { tx: OK_TX, lose: true });
      return !result.moved;
    },
  ],
  [
    "terminal states do nothing",
    async () => {
      const a = await run("delivered", {});
      const b = await run("failed", {});
      const c = await run("stuck", {});
      return !a.result.moved && !b.result.moved && !c.result.moved && a.h.submitted.length === 0;
    },
  ],
  [
    "a submitted state with no Circle id is stuck rather than guessed at",
    async () => {
      const { result } = await run("pull_submitted", { pull_circle_tx_id: null });
      return result.moved && result.sweep.status === "stuck";
    },
  ],
];

async function main() {
  let passed = 0;
  const failures: string[] = [];

  for (const [name, check] of CHECKS) {
    try {
      if (await check()) passed++;
      else failures.push(`  ✗ ${name}`);
    } catch (err) {
      failures.push(`  ✗ ${name} threw: ${(err as Error).message}`);
    }
  }

  console.log(`sweeps/advance: ${passed}/${CHECKS.length} passed`);
  if (failures.length) {
    console.error("\nFailures:\n" + failures.join("\n"));
    process.exit(1);
  }
}

void main();
