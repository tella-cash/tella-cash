/**
 * normalizeFaucetAsset tests. Runner-free — run with `pnpm test`. Exits
 * non-zero on any failure.
 */

import { normalizeFaucetAsset } from "./normalize-faucet-asset";

const CASES: Array<[string | null | undefined, string | null]> = [
  ["usdc", "USDC"],
  ["USDC", "USDC"],
  ["usdc please", "USDC"],
  ["eurc", "EURC"],
  ["give me eurc", "EURC"],
  ["native", "NATIVE"],
  ["gas", "NATIVE"],
  ["native gas", "NATIVE"],
  ["dogecoin", null],
  ["", null],
  ["   ", null],
  [null, null],
  [undefined, null],
];

let passed = 0;
const failures: string[] = [];

for (const [input, expected] of CASES) {
  const got = normalizeFaucetAsset(input);
  if (got === expected) {
    passed++;
  } else {
    failures.push(
      `  ✗ normalizeFaucetAsset(${JSON.stringify(input)}) -> ${JSON.stringify(got)} (expected ${JSON.stringify(expected)})`,
    );
  }
}

console.log(`normalize-faucet-asset: ${passed}/${CASES.length} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
