/**
 * Balance dedupe + merge tests. Runner-free — run with `pnpm test`. Exits
 * non-zero on any failure.
 *
 * The case that matters is the first one: Circle listing one USDC holding as
 * two entries used to be summed into double the money the wallet held, which
 * is how a 10 USDC receipt showed up as 20 in the balance reply and on the
 * "money received" card.
 */

import {
  dedupeSameToken,
  mergeBalancesBySymbol,
  type RawBalance,
  type TokenBalance,
} from "./circle";

const USDC_A = "11111111-1111-1111-1111-111111111111";
const USDC_B = "22222222-2222-2222-2222-222222222222";

function raw(over: Partial<RawBalance>): RawBalance {
  return {
    symbol: "USDC",
    amount: 10,
    tokenId: USDC_A,
    tokenAddress: "0xaaaa",
    ...over,
  };
}

/** Raw entries in, display lines out — the whole path getWalletBalances runs. */
function display(balances: RawBalance[]): TokenBalance[] {
  return mergeBalancesBySymbol(dedupeSameToken(balances));
}

const CASES: Array<[string, RawBalance[], TokenBalance[]]> = [
  [
    "same token id twice is one entry, not double",
    [raw({}), raw({})],
    [{ symbol: "USDC", amount: "10", tokenAddress: "0xaaaa" }],
  ],
  [
    "same token, no id from Circle — matched on symbol + address instead",
    [raw({ tokenId: "" }), raw({ tokenId: "" })],
    [{ symbol: "USDC", amount: "10", tokenAddress: "0xaaaa" }],
  ],
  [
    // The behaviour the symbol merge exists for: two genuinely different
    // contracts a user thinks of as one currency still show as one line.
    "two distinct USDC tokens still sum",
    [raw({}), raw({ tokenId: USDC_B, tokenAddress: "0xbbbb", amount: 5 })],
    [{ symbol: "USDC", amount: "15", tokenAddress: "0xaaaa" }],
  ],
  [
    "different symbols stay on their own lines",
    [raw({}), raw({ symbol: "EURC", tokenId: USDC_B, tokenAddress: "0xbbbb", amount: 3 })],
    [
      { symbol: "USDC", amount: "10", tokenAddress: "0xaaaa" },
      { symbol: "EURC", amount: "3", tokenAddress: "0xbbbb" },
    ],
  ],
  [
    "duplicate native entries (no contract address) collapse",
    [
      raw({ symbol: "ETH", tokenId: "", tokenAddress: null, amount: 1 }),
      raw({ symbol: "ETH", tokenId: "", tokenAddress: null, amount: 1 }),
    ],
    [{ symbol: "ETH", amount: "1", tokenAddress: null }],
  ],
  [
    "a duplicate reporting a different amount keeps the first, not the sum",
    [raw({}), raw({ amount: 999 })],
    [{ symbol: "USDC", amount: "10", tokenAddress: "0xaaaa" }],
  ],
  ["no balances", [], []],
];

let passed = 0;
const failures: string[] = [];

for (const [name, input, expected] of CASES) {
  const got = display(input);
  if (JSON.stringify(got) === JSON.stringify(expected)) {
    passed++;
  } else {
    failures.push(
      `  ✗ ${name}: got ${JSON.stringify(got)} (expected ${JSON.stringify(expected)})`,
    );
  }
}

console.log(`balances: ${passed}/${CASES.length} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
