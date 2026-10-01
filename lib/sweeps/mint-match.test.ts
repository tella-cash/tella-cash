/**
 * Matching an Arc mint to the sweep that produced it, and recognising tella's
 * own sweeper wallets. Runner-free — run with `pnpm test`.
 */

import type { tellaSweep } from "@/lib/supabase/types";
import { DELIVERED_MATCH_WINDOW_MS, pickSweepForMint } from "./mint-match";
import { isSweeperWalletId, sweeperEnvName, sweepsConfigured } from "./sweeper";

const NOW = Date.parse("2026-09-30T12:00:00Z");
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

function sweep(over: Partial<tellaSweep> = {}): tellaSweep {
  return {
    id: "s1",
    user_id: "u1",
    chain_id: "c1",
    status: "burned",
    amount_micro: "25000000",
    max_fee_micro: "20000",
    finality_threshold: 1000,
    address: "0x" + "a".repeat(40),
    auth_nonce: "0x" + "0".repeat(64),
    auth_valid_before: iso(3_600_000),
    pull_circle_tx_id: null,
    approve_circle_tx_id: null,
    burn_circle_tx_id: null,
    burn_tx_hash: null,
    forward_tx_hash: null,
    mint_matched_at: null, sweep_send_id: null,
    detail: null,
    created_at: iso(-600_000),
    updated_at: iso(-60_000),
    progressed_at: iso(-60_000),
    ...over,
  };
}

const mint = (amountMicro: bigint, txHash: string | null = null) => ({ amountMicro, txHash, now: NOW });
const pick = (c: tellaSweep[], m: ReturnType<typeof mint>) => pickSweepForMint(c, m)?.id ?? null;

type Check = [string, () => boolean];

const CHECKS: Check[] = [
  ["an in-flight burn matches the amount it could have produced", () => pick([sweep()], mint(BigInt(24_990_000))) === "s1"],
  ["the full burn amount matches (no fee taken)", () => pick([sweep()], mint(BigInt(25_000_000))) === "s1"],
  ["exactly amount minus the fee ceiling matches", () => pick([sweep()], mint(BigInt(24_980_000))) === "s1"],
  ["one micro-USDC below the floor does not match", () => pick([sweep()], mint(BigInt(24_979_999))) === null],
  ["more than was burned never matches", () => pick([sweep()], mint(BigInt(25_000_001))) === null],
  ["an unrelated deposit is not swallowed", () => pick([sweep()], mint(BigInt(5_000_000))) === null],
  ["no sweeps, no match", () => pick([], mint(BigInt(24_990_000))) === null],
  ["a matched sweep is spent", () => pick([sweep({ mint_matched_at: iso(-1000) })], mint(BigInt(24_990_000))) === null],
  ["burn_submitted can match: the mint can beat the advance job", () => pick([sweep({ status: "burn_submitted" })], mint(BigInt(24_990_000))) === "s1"],
  ["created, pulled or stuck sweeps cannot have minted", () =>
    (["created", "pull_submitted", "pulled", "approve_submitted", "approved", "failed", "stuck"] as const).every(
      (status) => pick([sweep({ status })], mint(BigInt(24_990_000))) === null,
    )],
  ["a recently delivered sweep still matches its late notification", () => pick([sweep({ status: "delivered" })], mint(BigInt(24_990_000))) === "s1"],
  ["a delivered sweep stops matching after the window", () =>
    pick([sweep({ status: "delivered", progressed_at: iso(-DELIVERED_MATCH_WINDOW_MS - 1000) })], mint(BigInt(24_990_000))) === null],
  ["a recorded hash matches on the hash, whatever the amount", () =>
    pick([sweep({ status: "delivered", forward_tx_hash: "0xABC" })], mint(BigInt(1), "0xabc")) === "s1"],
  ["a recorded, different hash rules the sweep out", () =>
    pick([sweep({ status: "delivered", forward_tx_hash: "0xabc" })], mint(BigInt(24_990_000), "0xdef")) === null],
  ["with two candidates the older sweep is matched first", () =>
    pick([sweep({ id: "new", created_at: iso(-1000) }), sweep({ id: "old", created_at: iso(-5000) })], mint(BigInt(24_990_000))) === "old"],
  ["a hash match beats an older amount match", () =>
    pick(
      [sweep({ id: "old", created_at: iso(-9000) }), sweep({ id: "hit", status: "delivered", forward_tx_hash: "0xfeed", created_at: iso(-1000) })],
      mint(BigInt(24_990_000), "0xfeed"),
    ) === "hit"],
  ["a zero fee ceiling only matches the exact amount", () =>
    pick([sweep({ max_fee_micro: "0" })], mint(BigInt(24_999_999))) === null && pick([sweep({ max_fee_micro: "0" })], mint(BigInt(25_000_000))) === "s1"],

  ["sweeper env name maps the chain code", () => sweeperEnvName("BASE-SEPOLIA") === "TELLA_SWEEPER_WALLET_ID_BASE_SEPOLIA"],
  ["a configured sweeper id is recognised", () => isSweeperWalletId("w-1", { TELLA_SWEEPER_WALLET_ID_BASE: "w-1" })],
  ["recognised on any chain's variable", () => isSweeperWalletId("w-2", { TELLA_SWEEPER_WALLET_ID_BASE: "w-1", TELLA_SWEEPER_WALLET_ID_OP: " w-2 " })],
  ["a user wallet id is not a sweeper", () => !isSweeperWalletId("user-wallet", { TELLA_SWEEPER_WALLET_ID_BASE: "w-1" })],
  ["an unrelated variable holding the id does not count", () => !isSweeperWalletId("w-1", { SOMETHING_ELSE: "w-1" })],
  ["no sweeper variable means sweeps are not configured", () => !sweepsConfigured({}) && !sweepsConfigured({ TELLA_SWEEPER_WALLET_ID_BASE: "  " })],
  ["any sweeper variable means they are", () => sweepsConfigured({ TELLA_SWEEPER_WALLET_ID_BASE: "w-1" })],
  ["empty or missing ids are never sweepers", () => !isSweeperWalletId("", { TELLA_SWEEPER_WALLET_ID_BASE: "" }) && !isSweeperWalletId(undefined, {})],
];

let failed = 0;
for (const [name, fn] of CHECKS) {
  let ok = false;
  try {
    ok = fn();
  } catch (err) {
    console.error("  threw:", err);
  }
  if (!ok) {
    failed++;
    console.error(`FAIL  ${name}`);
  }
}
if (failed) {
  console.error(`${failed} of ${CHECKS.length} mint-match checks failed`);
  process.exit(1);
}
console.log(`mint-match: ${CHECKS.length} checks passed`);
