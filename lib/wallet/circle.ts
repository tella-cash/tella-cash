import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

/**
 * Lazily-initialized Circle client. Same singleton pattern as the Supabase
 * admin client — we want one instance reused across the lifetime of the
 * Node process, with env-var validation deferred until first use so missing
 * config produces a clear error rather than crashing on import.
 */
let _client: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null =
  null;

function getCircleClient() {
  if (_client) return _client;

  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret) {
    throw new Error(
      "Missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET environment variables",
    );
  }

  _client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  return _client;
}

export interface CreatedWallet {
  /** Circle's internal UUID. Use this to sign transactions later. */
  walletId: string;
  /** Public 0x address — what we show the user and what others send to. */
  address: string;
}

/**
 * Create a single Arc wallet for a user.
 *
 * The `userId` is passed as both the idempotency key and the wallet's `refId`
 * so retries don't create duplicates and we can find the wallet by user ID
 * later via Circle's API if our DB row ever drifts out of sync.
 *
 * Returns the Circle wallet ID and the on-chain address. The caller persists
 * these to the user row.
 *
 * Throws if Circle returns an error or doesn't include a wallet in the
 * response. Callers should treat this as a recoverable failure — mark the
 * user's wallet_status as 'failed' and retry later, don't crash the
 * onboarding flow.
 */
export async function createWalletForUser(userId: string): Promise<CreatedWallet> {
  const walletSetId = process.env.CIRCLE_WALLET_SET_ID;
  const network = process.env.ARC_NETWORK ?? "ARC-TESTNET";
  if (!walletSetId) {
    throw new Error("Missing CIRCLE_WALLET_SET_ID environment variable");
  }

  const client = getCircleClient();

  const response = await client.createWallets({
    walletSetId,
    blockchains: [network as "ARC-TESTNET"],
    count: 1,
    accountType: "EOA",
    idempotencyKey: userId,
    metadata: [{ refId: userId }],
  });

  const wallet = response.data?.wallets?.[0];
  if (!wallet?.id || !wallet?.address) {
    throw new Error(
      `Circle createWallets returned no wallet (userId=${userId})`,
    );
  }

  console.log("[circle] wallet created", {
    userId,
    walletId: wallet.id,
    address: wallet.address,
  });

  return {
    walletId: wallet.id,
    address: wallet.address,
  };
}