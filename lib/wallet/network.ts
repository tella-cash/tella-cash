/**
 * Which Arc network this deployment runs on, read once from ARC_NETWORK.
 *
 * Everything that differs between testnet and mainnet asks this module
 * instead of reading the env var itself. Before this existed, three call
 * sites each defaulted to "ARC-TESTNET" on their own and one of them cast
 * the value to the testnet type, so a mainnet deploy would have typechecked
 * and then behaved half-testnet.
 *
 * An unrecognised value throws rather than falling back. A typo such as
 * "ARC_MAINNET" silently resolving to testnet would create wallets on the
 * wrong chain for every new user, and those can't be moved afterwards.
 */

export type ArcNetwork = "ARC-TESTNET" | "ARC";

const KNOWN: readonly ArcNetwork[] = ["ARC-TESTNET", "ARC"];

export function arcNetwork(): ArcNetwork {
  const raw = process.env.ARC_NETWORK?.trim();
  if (!raw) return "ARC-TESTNET";
  if ((KNOWN as readonly string[]).includes(raw)) return raw as ArcNetwork;
  throw new Error(
    `ARC_NETWORK must be one of ${KNOWN.join(", ")} (got "${raw}")`,
  );
}

export function isMainnet(): boolean {
  return arcNetwork() === "ARC";
}

/**
 * Explorer link for a transaction. ARC_EXPLORER_TX_URL (no trailing slash
 * needed) overrides the per-network default.
 *
 * The mainnet default is the explorer Arc's contract-addresses docs list.
 * Confirm it against a real mainnet transaction before relying on it, and
 * set ARC_EXPLORER_TX_URL if it differs.
 */
export function explorerTxUrl(txHash: string): string {
  const fallback = isMainnet()
    ? "https://explorer.arc.io/tx"
    : "https://testnet.arcscan.app/tx";
  const base = process.env.ARC_EXPLORER_TX_URL || fallback;
  return `${base.replace(/\/$/, "")}/${txHash}`;
}
