/**
 * Chain validation tests. Runner-free — run with `pnpm test`. Exits non-zero
 * on any failure.
 *
 * Everything accepted by validateNewChain is written to an add-only table, so
 * the rejections matter as much as the acceptances: each one here is a row
 * that could not later be corrected.
 */

import { validateNewChain, isTestnetCode, type ChainValidation } from "./validate";

const BASE = {
  slug: "base",
  blockchain: "BASE",
  cctp_domain: 6,
};

const GOOD = {
  slug: "arbitrum",
  displayName: "Arbitrum",
  blockchain: "ARB",
  usdcAddress: "0xAF88D065E77C8CC2239327C5EDB3A432268E5831",
  cctpDomain: 3,
  explorerTxUrl: "https://arbiscan.io/tx/",
};

const errorsOf = (v: ChainValidation) => (v.ok ? {} : v.errors);

type Check = [string, () => boolean];

const CHECKS: Check[] = [
  [
    "a well-formed mainnet chain is accepted",
    () => validateNewChain(GOOD, "mainnet", [BASE]).ok,
  ],
  [
    "the address is stored lowercased",
    () => {
      const v = validateNewChain(GOOD, "mainnet", [BASE]);
      return v.ok && v.value.usdcAddress === GOOD.usdcAddress.toLowerCase();
    },
  ],
  [
    "the code is stored uppercased and trimmed",
    () => {
      const v = validateNewChain({ ...GOOD, blockchain: " arb " }, "mainnet", [BASE]);
      return v.ok && v.value.blockchain === "ARB";
    },
  ],
  [
    "the explorer link loses its trailing slash",
    () => {
      const v = validateNewChain(GOOD, "mainnet", [BASE]);
      return v.ok && v.value.explorerTxUrl === "https://arbiscan.io/tx";
    },
  ],
  [
    "a domain typed into a text box is read as a number",
    () => {
      const v = validateNewChain({ ...GOOD, cctpDomain: "3" }, "mainnet", [BASE]);
      return v.ok && v.value.cctpDomain === 3;
    },
  ],

  // --- the network must match the deployment ---
  [
    "a testnet code is refused on mainnet",
    () => !!errorsOf(validateNewChain({ ...GOOD, blockchain: "ARB-SEPOLIA" }, "mainnet", [BASE])).blockchain,
  ],
  [
    "a mainnet code is refused on testnet",
    () => !!errorsOf(validateNewChain(GOOD, "testnet", [BASE])).blockchain,
  ],
  [
    "a testnet code is accepted on testnet",
    () => validateNewChain({ ...GOOD, blockchain: "ARB-SEPOLIA" }, "testnet", [BASE]).ok,
  ],
  ["isTestnetCode: BASE-SEPOLIA", () => isTestnetCode("BASE-SEPOLIA")],
  ["isTestnetCode: BASE is not", () => !isTestnetCode("BASE")],

  // --- codes that would watch nothing, or watch Arc twice ---
  ...["ARC", "ARC-TESTNET", "EVM", "EVM-TESTNET"].map((code): Check => [
    `${code} is refused as a deposit network`,
    () => !!errorsOf(validateNewChain({ ...GOOD, blockchain: code }, code.endsWith("TESTNET") ? "testnet" : "mainnet", [BASE])).blockchain,
  ]),
  [
    "Arc's CCTP domain is refused",
    () => !!errorsOf(validateNewChain({ ...GOOD, cctpDomain: 26 }, "mainnet", [BASE])).cctpDomain,
  ],

  // --- collisions with what is already there ---
  [
    "a chain already added is refused",
    () => !!errorsOf(validateNewChain({ ...GOOD, blockchain: "BASE", slug: "b2", cctpDomain: 9 }, "mainnet", [BASE])).blockchain,
  ],
  [
    "a name already used is refused",
    () => !!errorsOf(validateNewChain({ ...GOOD, slug: "base" }, "mainnet", [BASE])).slug,
  ],
  [
    "a domain already used is refused",
    () => !!errorsOf(validateNewChain({ ...GOOD, cctpDomain: 6 }, "mainnet", [BASE])).cctpDomain,
  ],

  // --- the address is the security-critical field ---
  [
    "an address that is too short is refused",
    () => !!errorsOf(validateNewChain({ ...GOOD, usdcAddress: "0x1234" }, "mainnet", [BASE])).usdcAddress,
  ],
  [
    "an address with a non-hex character is refused",
    () => !!errorsOf(validateNewChain({ ...GOOD, usdcAddress: "0x" + "g".repeat(40) }, "mainnet", [BASE])).usdcAddress,
  ],
  [
    "the zero address is refused",
    () => !!errorsOf(validateNewChain({ ...GOOD, usdcAddress: "0x" + "0".repeat(40) }, "mainnet", [BASE])).usdcAddress,
  ],
  [
    "a missing address is refused",
    () => !!errorsOf(validateNewChain({ ...GOOD, usdcAddress: undefined }, "mainnet", [BASE])).usdcAddress,
  ],

  // --- the explorer link ---
  [
    "an http link is refused",
    () => !!errorsOf(validateNewChain({ ...GOOD, explorerTxUrl: "http://arbiscan.io/tx" }, "mainnet", [BASE])).explorerTxUrl,
  ],
  [
    "a link with a query string is refused",
    () => !!errorsOf(validateNewChain({ ...GOOD, explorerTxUrl: "https://arbiscan.io/tx?x=1" }, "mainnet", [BASE])).explorerTxUrl,
  ],
  [
    "a link with credentials is refused",
    () => !!errorsOf(validateNewChain({ ...GOOD, explorerTxUrl: "https://a:b@arbiscan.io/tx" }, "mainnet", [BASE])).explorerTxUrl,
  ],
  [
    "not a URL at all is refused",
    () => !!errorsOf(validateNewChain({ ...GOOD, explorerTxUrl: "arbiscan" }, "mainnet", [BASE])).explorerTxUrl,
  ],

  // --- names ---
  [
    "an empty name is refused",
    () => !!errorsOf(validateNewChain({ ...GOOD, displayName: "  " }, "mainnet", [BASE])).displayName,
  ],
  [
    "a slug with spaces is refused",
    () => !!errorsOf(validateNewChain({ ...GOOD, slug: "my chain" }, "mainnet", [BASE])).slug,
  ],
  [
    "a code with a lowercase-only garbage shape is refused",
    () => !!errorsOf(validateNewChain({ ...GOOD, blockchain: "arb!" }, "mainnet", [BASE])).blockchain,
  ],

  // --- shape ---
  ["null input is refused, not thrown on", () => !validateNewChain(null, "mainnet", []).ok],
  ["every problem is reported at once", () => Object.keys(errorsOf(validateNewChain({}, "mainnet", []))).length >= 5],
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

console.log(`chains/validate: ${passed}/${CHECKS.length} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
