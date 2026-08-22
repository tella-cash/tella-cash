/**
 * Balance collapsing tests. Runner-free — run with `pnpm test`. Exits
 * non-zero on any failure.
 *
 * The first case is taken verbatim from what Circle actually returns for an
 * Arc wallet, because the original version of this file was written against
 * an assumption instead, and the assumption was wrong. USDC on Arc is both
 * the native gas token and an ERC-20 predeploy, so the same money comes back
 * twice under different ids with different decimals — and summing it showed
 * users double their balance.
 */

import { collapseBySymbol, dedupeSameToken, type RawBalance } from "./circle";

/** The real shape, from wallet 108aae8a on ARC-TESTNET. */
const ARC_NATIVE: RawBalance = {
  symbol: "USDC",
  amount: 25.999543733,
  tokenId: "15dc2b5d-0994-58b0-bf8c-3a0501148ee8",
  tokenAddress: null,
};
const ARC_ERC20: RawBalance = {
  symbol: "USDC",
  amount: 25.999543,
  tokenId: "ef87c8c3-85de-598a-af50-c5135eecfa74",
  tokenAddress: "0x3600000000000000000000000000000000000000",
};

type Check = [string, () => boolean];

const CHECKS: Check[] = [
  // --- the bug, exactly as production hit it ---
  [
    "the Arc native/ERC-20 pair collapses to ONE line, not a sum",
    () => collapseBySymbol([ARC_NATIVE, ARC_ERC20]).length === 1,
  ],
  [
    "and reports the balance once, not doubled",
    () => collapseBySymbol([ARC_NATIVE, ARC_ERC20])[0].amount === "25.999543",
  ],
  [
    "order of the two entries does not matter",
    () =>
      collapseBySymbol([ARC_ERC20, ARC_NATIVE])[0].amount ===
      collapseBySymbol([ARC_NATIVE, ARC_ERC20])[0].amount,
  ],
  [
    "a 10 USDC wallet reads as 10, which is the reported bug",
    () => {
      const out = collapseBySymbol([
        { ...ARC_NATIVE, amount: 10.000000123 },
        { ...ARC_ERC20, amount: 10 },
      ]);
      return out.length === 1 && out[0].amount === "10";
    },
  ],

  // --- precision: the native entry carries 18 decimals, USDC has 6 ---
  [
    "invented decimals are trimmed away",
    () => collapseBySymbol([ARC_NATIVE])[0].amount === "25.999543",
  ],
  [
    "trailing zeros do not survive",
    () => collapseBySymbol([{ ...ARC_ERC20, amount: 5.5 }])[0].amount === "5.5",
  ],
  [
    "a whole number stays whole",
    () => collapseBySymbol([{ ...ARC_ERC20, amount: 12 }])[0].amount === "12",
  ],

  // --- ordinary cases ---
  [
    "a single entry passes through",
    () => {
      const out = collapseBySymbol([ARC_ERC20]);
      return out.length === 1 && out[0].symbol === "USDC";
    },
  ],
  [
    "different symbols stay on their own lines",
    () =>
      collapseBySymbol([
        ARC_ERC20,
        { symbol: "EURC", amount: 3, tokenId: "x", tokenAddress: "0xbbbb" },
      ]).length === 2,
  ],
  ["no balances", () => collapseBySymbol([]).length === 0],
  [
    "a zero balance does not divide by zero when comparing entries",
    () =>
      collapseBySymbol([
        { ...ARC_NATIVE, amount: 0 },
        { ...ARC_ERC20, amount: 0 },
      ])[0].amount === "0",
  ],

  // --- the safe direction, stated as a test so it cannot drift ---
  [
    "two genuinely different same-symbol balances under-report rather than over-report",
    () => {
      const out = collapseBySymbol([
        { ...ARC_NATIVE, amount: 10 },
        { ...ARC_ERC20, amount: 40 },
      ]);
      // 40, never 50. Quoting more than can be sent produces a failed
      // transfer; quoting less produces a question.
      return out.length === 1 && out[0].amount === "40";
    },
  ],

  // --- dedupeSameToken still guards literal repeats of one entry ---
  [
    "a literally repeated entry is dropped before anything else looks at it",
    () => dedupeSameToken([ARC_ERC20, ARC_ERC20]).length === 1,
  ],
  [
    "the native/ERC-20 pair is NOT what dedupeSameToken is for — it cannot tell",
    () => dedupeSameToken([ARC_NATIVE, ARC_ERC20]).length === 2,
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

console.log(`balances: ${passed}/${CHECKS.length} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
