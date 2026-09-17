/**
 * Wallet gate tests. Runner-free — run with `pnpm test`. Exits non-zero on
 * any failure.
 *
 * The case that matters most: after ARC_NETWORK moves to mainnet, a wallet
 * created on testnet must not count as ready. Otherwise a send to that user
 * pays real USDC into an address the mainnet Circle entity cannot sign for.
 */

import type { tellaUser } from "@/lib/supabase/types";
import { gateSpend, gateWalletReady } from "./wallet-gate";

function user(over: Partial<tellaUser> = {}): tellaUser {
  return {
    id: "u1",
    whatsapp_number: "whatsapp:+2348000000000",
    whatsapp_channel: "meta",
    profile_name: "Ada",
    onboarding_step: "completed",
    circle_wallet_id: "w1",
    wallet_address: "0xabc",
    wallet_status: "active",
    wallet_network: "ARC-TESTNET",
    pin_hash: null,
    pin_salt: null,
    pin_set_at: null,
    factors_changed_at: null,
    frozen_at: null,
    frozen_reason: null,
    frozen_source: null,
    panic_code_hash: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function onNetwork<T>(network: string | undefined, fn: () => T): T {
  const saved = process.env.ARC_NETWORK;
  if (network === undefined) delete process.env.ARC_NETWORK;
  else process.env.ARC_NETWORK = network;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.ARC_NETWORK;
    else process.env.ARC_NETWORK = saved;
  }
}

const CHECKS: Array<[string, () => boolean]> = [
  ["a testnet wallet is ready on testnet", () => onNetwork("ARC-TESTNET", () => gateWalletReady(user()).ok)],
  [
    "a testnet wallet is NOT ready on mainnet",
    () => onNetwork("ARC", () => !gateWalletReady(user()).ok),
  ],
  [
    "a testnet wallet cannot spend on mainnet",
    () => onNetwork("ARC", () => !gateSpend(user()).ok),
  ],
  [
    "a mainnet wallet is ready on mainnet",
    () => onNetwork("ARC", () => gateWalletReady(user({ wallet_network: "ARC" })).ok),
  ],
  [
    "a mainnet wallet is not ready on testnet",
    () => onNetwork("ARC-TESTNET", () => !gateWalletReady(user({ wallet_network: "ARC" })).ok),
  ],
  [
    "a wallet with no recorded network is treated as testnet",
    () =>
      onNetwork("ARC", () => !gateWalletReady(user({ wallet_network: null })).ok) &&
      onNetwork(undefined, () => gateWalletReady(user({ wallet_network: null })).ok),
  ],
  [
    "frozen still blocks spending, not reading",
    () =>
      onNetwork("ARC-TESTNET", () => {
        const frozen = user({ frozen_at: "2026-02-01T00:00:00Z" });
        return !gateSpend(frozen).ok && gateWalletReady(frozen).ok;
      }),
  ],
];

let passed = 0;
const failures: string[] = [];

for (const [name, check] of CHECKS) {
  let ok = false;
  try {
    ok = check();
  } catch (err) {
    failures.push(`  ✗ ${name} threw: ${(err as Error).message}`);
    continue;
  }
  if (ok) passed++;
  else failures.push(`  ✗ ${name}`);
}

console.log(`wallet-gate: ${passed}/${CHECKS.length} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
