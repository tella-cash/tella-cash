/**
 * Amount-parser tests. Runner-free — run with `pnpm test` (chained after
 * the intent tests). Exits non-zero on any failure.
 */

import { parseAmount } from "./parse-amount";
import { parseSendIntent } from "./parse-send";

const AMOUNTS: Array<[string, string | null]> = [
  ["5", "5"],
  ["5.5", "5.5"],
  ["5.50", "5.5"],
  ["$5", "5"],
  ["₦2000", "2000"],
  ["₦2,000", "2000"],
  ["5 usdc", "5"],
  ["10 dollars", "10"],
  ["20 bucks", "20"],
  ["five", "5"],
  ["twenty", "20"],
  ["twenty five", "25"],
  ["one hundred", "100"],
  ["a hundred", "100"],
  ["two thousand", "2000"],
  ["two thousand five hundred", "2500"],
  ["one hundred twenty five", "125"],
  ["fifty usdc", "50"],
  ["0", null],
  ["zero", null],
  ["-5", null],
  ["", null],
  ["banana", null],
  ["five hundred bananas", null],
];

// End-to-end: the parsed amount flows through parseSendIntent.
const SENDS: Array<[string, string | null]> = [
  ["send 5 to +2348012345678", "5"],
  ["send five usdc to +2348012345678", "5"],
  ["send $20 to +2348012345678", "20"],
  ["send twenty five to +2348012345678", "25"],
  ["send 2.5 usdc to 0x1111111111111111111111111111111111111111", "2.5"],
  ["send a hundred to +2348012345678", "100"],
  ["send nothing to +2348012345678", null], // unparseable amount
];

let passed = 0;
const failures: string[] = [];

for (const [input, expected] of AMOUNTS) {
  const got = parseAmount(input);
  if (got === expected) passed++;
  else failures.push(`  ✗ parseAmount(${JSON.stringify(input)}) -> ${got} (expected ${expected})`);
}

for (const [input, expected] of SENDS) {
  const got = parseSendIntent(input)?.amount ?? null;
  if (got === expected) passed++;
  else failures.push(`  ✗ send(${JSON.stringify(input)}) amount -> ${got} (expected ${expected})`);
}

const total = AMOUNTS.length + SENDS.length;
console.log(`parse-amount: ${passed}/${total} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
