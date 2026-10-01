/**
 * Which Circle wallets are tella's own sweepers.
 *
 * A sweeper is not a user's wallet. Every step of a sweep touches it (the pull
 * lands in it, the approve and the burn leave it), and Circle reports each of
 * those to the webhook as an ordinary inbound or outbound transaction. The
 * webhook asks here before doing anything with a wallet id, so that tella's own
 * plumbing is never announced to a user as a deposit or a send.
 *
 * Its id comes from TELLA_SWEEPER_WALLET_ID_<BLOCKCHAIN> (BASE, BASE_SEPOLIA:
 * the Circle code with "-" as "_"). Unset is a refusal, not a fallback — a
 * sweep against a wallet nobody chose is money sent somewhere nobody chose.
 */

const PREFIX = "TELLA_SWEEPER_WALLET_ID_";

export function sweeperEnvName(blockchain: string): string {
  return `${PREFIX}${blockchain.replace(/-/g, "_").toUpperCase()}`;
}

export function sweeperWalletIdFor(blockchain: string): string | null {
  return process.env[sweeperEnvName(blockchain)]?.trim() || null;
}

/**
 * True if `walletId` is any configured sweeper, on any chain.
 *
 * Scans the environment rather than asking for a chain: the webhook has a
 * wallet id and, for a pull, the notification's blockchain is the source chain
 * — but a check that does not depend on that pairing cannot be defeated by it
 * being wrong.
 */
export function isSweeperWalletId(walletId: string | undefined | null, env: Record<string, string | undefined> = process.env): boolean {
  if (!walletId) return false;
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith(PREFIX) && value?.trim() === walletId) return true;
  }
  return false;
}

/**
 * True if any sweeper wallet is configured.
 *
 * Sweeps cannot exist without one, so code that only matters once a sweep
 * exists (matching a mint, cancelling a parked send on freeze) asks this first
 * and does nothing otherwise. That is what lets the code be deployed BEFORE
 * migrations 0029 to 0031 are applied: until a sweeper is configured, no path
 * touches those tables, so an unapplied migration cannot break a deposit
 * notification or a freeze.
 */
export function sweepsConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Object.entries(env).some(([key, value]) => key.startsWith(PREFIX) && !!value?.trim());
}
