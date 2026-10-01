/**
 * Portfolio formatting tests. Runner-free — run with `pnpm test`.
 *
 * The pure half of lib/wallet/portfolio.ts: how holdings become the lines and
 * notes a user reads. The rules worth pinning are the ones that stop the
 * balance reply overclaiming — money on another chain must be labelled as such
 * and must never be added to the Arc figure, and a chain that could not be
 * read must be said out loud rather than quietly leaving the total smaller.
 */

import { arcUsdcHoldings, portfolioLines, portfolioNotes, type Portfolio } from "./portfolio";
import type { tellaChain } from "@/lib/supabase/types";

const BASE = {
  id: "c1",
  slug: "base",
  display_name: "Base",
  network: "mainnet",
  blockchain: "BASE",
  usdc_address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  cctp_domain: 6,
  explorer_tx_url: "https://basescan.org/tx",
  added_by: null,
  created_at: "2026-09-21T00:00:00Z",
} as tellaChain;

const ARB = { ...BASE, id: "c2", display_name: "Arbitrum", blockchain: "ARB", slug: "arbitrum" } as tellaChain;

const EMPTY: Portfolio = { arc: [], chains: [], unavailable: [] };

type Check = [string, () => boolean];

const CHECKS: Check[] = [
  ["nothing held gives no lines", () => portfolioLines(EMPTY).length === 0],
  [
    "an Arc balance reads as before",
    () =>
      portfolioLines({ ...EMPTY, arc: [{ symbol: "USDC", amount: "12.5", tokenAddress: null }] })[0] ===
      "12.5 USDC",
  ],
  [
    "money on Base is labelled with its network",
    () => portfolioLines({ ...EMPTY, chains: [{ chain: BASE, amount: "20" }] })[0] === "20 USDC on Base",
  ],
  [
    "Arc and Base are listed separately, never added",
    () => {
      const lines = portfolioLines({
        arc: [{ symbol: "USDC", amount: "5", tokenAddress: null }],
        chains: [{ chain: BASE, amount: "20" }],
        unavailable: [],
      });
      return lines.length === 2 && lines[0] === "5 USDC" && lines[1] === "20 USDC on Base";
    },
  ],
  [
    "chains keep the order they were added in",
    () => {
      const lines = portfolioLines({
        ...EMPTY,
        chains: [{ chain: BASE, amount: "1" }, { chain: ARB, amount: "2" }],
      });
      return lines[0].endsWith("Base") && lines[1].endsWith("Arbitrum");
    },
  ],
  [
    "Arc shows USDC and nothing else",
    () => {
      const kept = arcUsdcHoldings([
        { symbol: "USDC", amount: "5", tokenAddress: null },
        { symbol: "EURC", amount: "3", tokenAddress: "0x1" },
        { symbol: "Visit scam.example to claim", amount: "1000", tokenAddress: "0x2" },
      ]);
      return kept.length === 1 && kept[0].symbol === "USDC";
    },
  ],
  [
    "a zero USDC balance is not listed",
    () => arcUsdcHoldings([{ symbol: "USDC", amount: "0", tokenAddress: null }]).length === 0,
  ],
  ["no notes when everything is on Arc", () => portfolioNotes(EMPTY).length === 0],
  [
    "money on another chain comes with the note that sends use Arc",
    () => portfolioNotes({ ...EMPTY, chains: [{ chain: BASE, amount: "20" }] }).some((n) => /Arc balance/.test(n)),
  ],
  [
    "a chain that could not be read is named",
    () => portfolioNotes({ ...EMPTY, unavailable: ["Base"] }).some((n) => n.includes("Base")),
  ],
  [
    "two unreadable chains are both named",
    () => {
      const n = portfolioNotes({ ...EMPTY, unavailable: ["Base", "Arbitrum"] }).join(" ");
      return n.includes("Base") && n.includes("Arbitrum");
    },
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

console.log(`portfolio: ${passed}/${CHECKS.length} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
