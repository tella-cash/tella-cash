/**
 * Sends parked behind a sweep: readiness, snapshot round trip, and the settle
 * decision tree against fakes. Runner-free — run with `pnpm test`.
 */

import type { SendPayload, SweepStatus, tellaSweep, tellaSweepSend, tellaUser } from "@/lib/supabase/types";
import { NO_FEES, quoteSend, type ChainHolding } from "./quote";
import { sweepSendReadiness } from "./readiness";
import { settleOne, settleSweepSends, type SettleDeps } from "./settle";
import { readSnapshot, snapshotQuote } from "./snapshot";

const U = (n: number) => BigInt(Math.round(n * 1_000_000));

function sweep(status: SweepStatus, id = "s"): tellaSweep {
  return {
    id, user_id: "u1", chain_id: "c1", status, amount_micro: "1000000", max_fee_micro: "20000", finality_threshold: 1000,
    address: "0x" + "a".repeat(40), auth_nonce: "0x" + "0".repeat(64), auth_valid_before: "2026-10-01T00:00:00Z",
    pull_circle_tx_id: null, approve_circle_tx_id: null, burn_circle_tx_id: null, burn_tx_hash: null, forward_tx_hash: null,
    mint_matched_at: null, sweep_send_id: "ss1", detail: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
    progressed_at: "2026-10-01T00:00:00Z",
  };
}

const PAYLOAD: SendPayload = {
  amount: "40", amountNgn: "60000", token: "USDC", recipientUserId: null, recipientName: "Ada",
  recipientAddress: "0x" + "b".repeat(40), recipientWhatsappNumber: null, network: "ARC-TESTNET",
};

const SEND: tellaSweepSend = {
  id: "ss1", user_id: "u1", payload: PAYLOAD, quote: {}, state: "sweeping", detail: null,
  circle_transaction_id: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
};

const USER = { id: "u1" } as unknown as tellaUser;

interface Calls {
  transitions: string[];
  told: string[][];
  reserved: number;
  released: number;
  transfers: number;
  attached: number;
  afterSent: number;
}

function fakes(over: Partial<SettleDeps> & { sweeps?: tellaSweep[] } = {}): { deps: SettleDeps; calls: Calls } {
  const calls: Calls = { transitions: [], told: [], reserved: 0, released: 0, transfers: 0, attached: 0, afterSent: 0 };
  const deps: SettleDeps = {
    listSweeping: async () => [SEND],
    sweepsFor: async () => over.sweeps ?? [sweep("delivered")],
    transition: async (id, from, to) => {
      calls.transitions.push(`${from}>${to}`);
      return { ...SEND, state: to };
    },
    findUser: async () => USER,
    network: () => "ARC-TESTNET",
    gate: () => ({ ok: true, walletId: "w1" }),
    checkLimits: async () => ({ ok: true, usdc: { tokenId: "t1", available: 100 }, limits: { perTx: Infinity, daily: Infinity, holdThreshold: null, customised: false } }),
    reserve: async () => { calls.reserved++; return { ok: true, transactionId: "tx1" }; },
    releaseReservation: async () => { calls.released++; },
    attachCircleTransaction: async () => { calls.attached++; },
    transfer: async () => { calls.transfers++; return { ok: true, transactionId: "c1" }; },
    tell: async (_u, lines) => { calls.told.push(lines); },
    afterSent: async () => { calls.afterSent++; },
    ...over,
  };
  return { deps, calls };
}

type Check = [string, () => boolean | Promise<boolean>];

const CHECKS: Check[] = [
  // readiness
  ["no legs can never run a send", () => sweepSendReadiness([]).kind === "abandon"],
  ["all delivered is ready", () => sweepSendReadiness([sweep("delivered"), sweep("delivered")]).kind === "ready"],
  ["a leg still in flight is waiting", () => sweepSendReadiness([sweep("delivered"), sweep("burned")]).kind === "waiting"],
  ["created and pulled legs are waiting", () => sweepSendReadiness([sweep("created")]).kind === "waiting" && sweepSendReadiness([sweep("pulled")]).kind === "waiting"],
  ["a failed-only send moved nothing", () => {
    const r = sweepSendReadiness([sweep("failed")]);
    return r.kind === "abandon" && r.moved === "nothing" && !r.stuck;
  }],
  ["a stuck leg abandons and says money moved", () => {
    const r = sweepSendReadiness([sweep("stuck")]);
    return r.kind === "abandon" && r.moved === "some" && r.stuck;
  }],
  ["a stuck leg abandons even while another is in flight", () => sweepSendReadiness([sweep("stuck"), sweep("burned")]).kind === "abandon"],
  ["a failed leg beside a delivered one still moved money", () => {
    const r = sweepSendReadiness([sweep("failed"), sweep("delivered")]);
    return r.kind === "abandon" && r.moved === "some";
  }],
  ["a failed leg beside a created one moved nothing", () => {
    const r = sweepSendReadiness([sweep("failed"), sweep("created")]);
    return r.kind === "abandon" && r.moved === "nothing";
  }],

  // snapshot
  ["a quote survives the snapshot round trip exactly", () => {
    const holding: ChainHolding = {
      chainId: "c1", blockchain: "BASE", displayName: "Base", balanceMicro: U(100), finality: 1000,
      route: { milliBps: BigInt(325), forwardLow: BigInt(16975), forwardMed: BigInt(17338), forwardHigh: BigInt(19221) },
    };
    const q = quoteSend({ sendMicro: U(40), arcMicro: U(15), holdings: [holding], config: NO_FEES });
    if (q.kind !== "sweep") return false;
    const back = readSnapshot(JSON.parse(JSON.stringify(snapshotQuote(q))));
    return !!back && back.totalMaxMicro === q.totalMaxMicro && back.legs[0].amountMicro === q.legs[0].amountMicro && back.legs[0].maxFeeMicro === q.legs[0].maxFeeMicro;
  }],
  ["junk is not a snapshot", () => readSnapshot(null) === null && readSnapshot({}) === null && readSnapshot({ v: 1, legs: [] }) === null && readSnapshot("x") === null],
  ["a snapshot with a non-integer amount is refused", () => {
    const bad = { v: 1, sendMicro: "1.5", sendFeeMicro: "0", sweepFeeMicro: "0", circleFeeMaxMicro: "0", totalMaxMicro: "0", legs: [{ chainId: "c", blockchain: "B", displayName: "B", amountMicro: "1", maxFeeMicro: "1", minNetMicro: "1", finality: 1000 }] };
    return readSnapshot(bad) === null;
  }],

  // settle
  ["waiting does nothing", async () => {
    const { deps, calls } = fakes({ sweeps: [sweep("burned")] });
    return (await settleOne(SEND, deps)) === "waiting" && calls.transitions.length === 0 && calls.transfers === 0;
  }],
  ["ready runs the whole send once", async () => {
    const { deps, calls } = fakes();
    const r = await settleOne(SEND, deps);
    return r === "sent" && calls.transfers === 1 && calls.reserved === 1 && calls.attached === 1 && calls.afterSent === 1 &&
      calls.transitions.join() === "sweeping>executing,executing>sent";
  }],
  ["a lost claim sends nothing", async () => {
    const { deps, calls } = fakes({ transition: async () => null });
    return (await settleOne(SEND, deps)) === "skipped" && calls.transfers === 0 && calls.reserved === 0;
  }],
  ["a frozen account is cancelled before any claim, and told", async () => {
    const { deps, calls } = fakes({ gate: () => ({ ok: false, reason: "frozen" }) });
    return (await settleOne(SEND, deps)) === "cancelled" && calls.transfers === 0 && calls.transitions.join() === "sweeping>cancelled" && calls.told[0].join(" ").includes("frozen");
  }],
  ["a different network is cancelled", async () => {
    const { deps, calls } = fakes({ network: () => "ARC" });
    return (await settleOne(SEND, deps)) === "cancelled" && calls.transfers === 0;
  }],
  ["failing limits after the claim cancels without sending", async () => {
    const { deps, calls } = fakes({ checkLimits: async () => ({ ok: false, failure: { kind: "insufficient", available: 1, requested: 40 } }) });
    return (await settleOne(SEND, deps)) === "cancelled" && calls.transfers === 0 && calls.reserved === 0 && calls.transitions.join() === "sweeping>executing,executing>cancelled";
  }],
  ["a refused reservation cancels without sending", async () => {
    const { deps, calls } = fakes({ reserve: async () => ({ ok: false, reason: "over_cap", already: 5 }) });
    return (await settleOne(SEND, deps)) === "cancelled" && calls.transfers === 0;
  }],
  ["a definite transfer failure releases the reservation", async () => {
    const { deps, calls } = fakes({ transfer: async () => ({ ok: false, reason: "failed" }) });
    return (await settleOne(SEND, deps)) === "failed" && calls.released === 1 && calls.transitions.join() === "sweeping>executing,executing>failed";
  }],
  ["an unknown transfer keeps the reservation and never says unchanged", async () => {
    const { deps, calls } = fakes({ transfer: async () => ({ ok: false, reason: "unknown" }) });
    const r = await settleOne(SEND, deps);
    const said = calls.told.flat().join(" ");
    return r === "unknown" && calls.released === 0 && !/unchanged/i.test(said) && /can't tell/.test(said);
  }],
  ["a stuck leg cancels the send and says the money is safe", async () => {
    const { deps, calls } = fakes({ sweeps: [sweep("stuck")] });
    const r = await settleOne(SEND, deps);
    return r === "cancelled" && calls.transfers === 0 && /still yours/.test(calls.told.flat().join(" "));
  }],
  ["only failed legs says nothing left the wallet", async () => {
    const { deps, calls } = fakes({ sweeps: [sweep("failed")] });
    await settleOne(SEND, deps);
    return /Nothing left your wallet/.test(calls.told.flat().join(" "));
  }],
  ["a missing user cancels", async () => {
    const { deps } = fakes({ findUser: async () => null });
    return (await settleOne(SEND, deps)) === "cancelled";
  }],
  ["the batch counts outcomes and survives one throwing", async () => {
    let n = 0;
    const { deps } = fakes({
      listSweeping: async () => [SEND, { ...SEND, id: "ss2" }],
      sweepsFor: async () => { if (n++ === 0) throw new Error("boom"); return [sweep("burned")]; },
    });
    const s = await settleSweepSends(deps);
    return s.open === 2 && s.failed === 1 && s.waiting === 1;
  }],
];

(async () => {
  let failed = 0;
  for (const [name, fn] of CHECKS) {
    let ok = false;
    try {
      ok = await fn();
    } catch (err) {
      console.error("  threw:", err);
    }
    if (!ok) {
      failed++;
      console.error(`FAIL  ${name}`);
    }
  }
  if (failed) {
    console.error(`${failed} of ${CHECKS.length} settle checks failed`);
    process.exit(1);
  }
  console.log(`settle: ${CHECKS.length} checks passed`);
})();
