import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

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
  walletId: string;
  address: string;
}

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

export interface TokenBalance {
  symbol: string;
  amount: string;
  tokenAddress: string | null;
}

export async function getWalletBalances(
  walletId: string,
): Promise<TokenBalance[]> {
  const client = getCircleClient();

  const response = await client.getWalletTokenBalance({ id: walletId });

  const balances = response.data?.tokenBalances ?? [];

  return balances.map((b) => ({
    symbol: b.token?.symbol ?? "UNKNOWN",
    amount: b.amount ?? "0",
    tokenAddress: b.token?.tokenAddress ?? null,
  }));
}

export interface SendUsdcArgs {
  fromWalletId: string;
  toAddress: string;
  amount: string;
}

export interface SendUsdcResult {
  transactionId: string;
  txHash: string | null;
}

export async function sendUsdc({
  fromWalletId,
  toAddress,
  amount,
}: SendUsdcArgs): Promise<SendUsdcResult> {
  const network = process.env.ARC_NETWORK ?? "ARC-TESTNET";
  const client = getCircleClient();

  const response = await client.createTransaction({
    idempotencyKey: crypto.randomUUID(),
    walletId: fromWalletId,
    destinationAddress: toAddress,
    tokenId: undefined as unknown as string,
    blockchain: network as any,
    amount: [amount],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const tx = response.data;
  if (!tx?.id) {
    throw new Error("Circle createTransaction returned no transaction ID");
  }

  console.log("[circle] send submitted", {
    fromWalletId,
    toAddress,
    amount,
    txId: tx.id,
  });

  return {
    transactionId: tx.id,
    txHash: (tx as any).txHash ?? null,
  };
}