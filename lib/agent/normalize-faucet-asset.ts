import type { FaucetAsset } from "@/lib/wallet/circle";

/**
 * Maps free text (from either sendam-ai's `asset` slot or a user's raw
 * follow-up reply like "usdc please") onto one of Circle's three
 * testnet-faucet-supported tokens, or null if it's not recognized.
 */
export function normalizeFaucetAsset(input: string | null | undefined): FaucetAsset | null {
  if (!input) return null;
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.includes("usdc")) return "USDC";
  if (normalized.includes("eurc")) return "EURC";
  if (normalized.includes("native") || normalized.includes("gas")) return "NATIVE";
  return null;
}
