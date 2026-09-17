/**
 * Network selection tests. Runner-free — run with `pnpm test`. Exits
 * non-zero on any failure.
 *
 * The case that matters most is the typo: a misspelt ARC_NETWORK must not
 * quietly mean testnet, because wallets created on the wrong chain can't be
 * moved afterwards.
 */

import { arcNetwork, isMainnet, explorerTxUrl } from "./network";

function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    saved[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

const TX = "0xabc";

const CHECKS: [string, () => boolean][] = [
  ["unset means testnet", () => withEnv({ ARC_NETWORK: undefined }, () => arcNetwork() === "ARC-TESTNET")],
  ["empty means testnet", () => withEnv({ ARC_NETWORK: "" }, () => arcNetwork() === "ARC-TESTNET")],
  ["ARC is mainnet", () => withEnv({ ARC_NETWORK: "ARC" }, () => isMainnet())],
  ["ARC-TESTNET is not mainnet", () => withEnv({ ARC_NETWORK: "ARC-TESTNET" }, () => !isMainnet())],
  ["surrounding whitespace is tolerated", () => withEnv({ ARC_NETWORK: " ARC\n" }, () => isMainnet())],
  ["a typo throws instead of falling back", () => withEnv({ ARC_NETWORK: "ARC_MAINNET" }, () => throws(arcNetwork))],
  ["lowercase is not accepted", () => withEnv({ ARC_NETWORK: "arc" }, () => throws(arcNetwork))],

  [
    "testnet explorer by default",
    () =>
      withEnv({ ARC_NETWORK: undefined, ARC_EXPLORER_TX_URL: undefined }, () =>
        explorerTxUrl(TX) === "https://testnet.arcscan.app/tx/0xabc"),
  ],
  [
    "mainnet explorer on ARC",
    () =>
      withEnv({ ARC_NETWORK: "ARC", ARC_EXPLORER_TX_URL: undefined }, () =>
        explorerTxUrl(TX) === "https://explorer.arc.io/tx/0xabc"),
  ],
  [
    "the override wins and a trailing slash is dropped",
    () =>
      withEnv({ ARC_NETWORK: "ARC", ARC_EXPLORER_TX_URL: "https://example.io/tx/" }, () =>
        explorerTxUrl(TX) === "https://example.io/tx/0xabc"),
  ],
  [
    "an empty override falls back instead of producing /0xabc",
    () =>
      withEnv({ ARC_NETWORK: "ARC", ARC_EXPLORER_TX_URL: "" }, () =>
        explorerTxUrl(TX) === "https://explorer.arc.io/tx/0xabc"),
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

console.log(`network: ${passed}/${CHECKS.length} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
