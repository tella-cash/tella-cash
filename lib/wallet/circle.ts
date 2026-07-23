import {
  initiateDeveloperControlledWalletsClient,
  ForbiddenError,
  RatelimitError,
  type TestnetBlockchain,
} from "@circle-fin/developer-controlled-wallets";

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

/**
 * Fetches wallet token balances, merging any entries that share a symbol
 * into one line. Circle's testnet occasionally lists what's effectively
 * the same token as more than one balance entry (e.g. a bridged/native
 * pair), which otherwise shows up as a confusing duplicate "X USDC" /
 * "Y USDC" pair in the balance reply instead of one combined total.
 */
export async function getWalletBalances(
  walletId: string,
): Promise<TokenBalance[]> {
  const client = getCircleClient();

  const response = await client.getWalletTokenBalance({ id: walletId });

  const balances = response.data?.tokenBalances ?? [];

  const merged = new Map<string, TokenBalance>();
  for (const b of balances) {
    const symbol = b.token?.symbol ?? "UNKNOWN";
    const amount = parseFloat(b.amount ?? "0");
    const existing = merged.get(symbol);
    if (existing) {
      existing.amount = String(parseFloat(existing.amount) + amount);
    } else {
      merged.set(symbol, {
        symbol,
        amount: String(amount),
        tokenAddress: b.token?.tokenAddress ?? null,
      });
    }
  }

  return [...merged.values()];
}

/**
 * Fetches wallet balances and formats them as "{amount} {symbol}" lines,
 * dropping zero-balance tokens. Shared by the "what's my balance?" agent
 * reply and the money-received notification, so both surfaces show the
 * same numbers in the same shape.
 */
export async function getFormattedBalanceLines(
  walletId: string,
): Promise<string[]> {
  const balances = await getWalletBalances(walletId);
  return balances
    .filter((b) => parseFloat(b.amount) > 0)
    .map((b) => `${b.amount} ${b.symbol}`);
}

/**
 * Resolves a token's ticker symbol from its Circle-internal UUID.
 *
 * Circle's transaction webhooks (`transactions.inbound`/`.outbound`) only
 * carry a `tokenId` (a UUID), not a human-readable symbol — there is no
 * `tokenSymbol` field on that payload despite how tempting a name that'd
 * be to assume. Any code that read one straight off the webhook body was
 * silently always getting `undefined` and falling back to a hardcoded
 * default, mislabeling every non-default token (e.g. EURC or cirBTC
 * showing up as "USDC" in a "received" notification). This looks it up
 * properly via Circle's token API, cached in-memory since a token's
 * symbol never changes for a given ID.
 */
const tokenSymbolCache = new Map<string, string>();

export async function getTokenSymbol(tokenId: string): Promise<string> {
  const cached = tokenSymbolCache.get(tokenId);
  if (cached) return cached;

  try {
    const client = getCircleClient();
    const response = await client.getToken({ id: tokenId });
    const symbol = response.data?.token?.symbol ?? "UNKNOWN";

    tokenSymbolCache.set(tokenId, symbol);
    return symbol;
  } catch (err) {
    // Don't cache a failure, and don't let a Circle API hiccup take down
    // the whole "you received money" notification — worst case the user
    // sees "UNKNOWN" instead of the real symbol, not silence.
    console.error("[circle] getTokenSymbol lookup failed", { tokenId, err });
    return "UNKNOWN";
  }
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

export type FaucetAsset = "NATIVE" | "USDC" | "EURC";

/** Thrown when Circle's testnet faucet has already been tapped too recently
 *  for this address — distinct from a generic failure so the caller can
 *  give the user a "try again later" reply instead of a bare error. */
export class FaucetRateLimitedError extends Error {
  constructor() {
    super("Circle faucet rate limit reached for this address");
    this.name = "FaucetRateLimitedError";
  }
}

/** Thrown when Circle returns 403 Forbidden for a faucet drip. Per Circle's
 *  docs, `POST /v1/faucet/drips` requires the account to be upgraded to
 *  mainnet — until then every drip is rejected regardless of chain or key
 *  scope. Distinct from a generic failure so the caller can point the user
 *  at the web faucet (faucet.circle.com), which has no such gate. */
export class FaucetForbiddenError extends Error {
  constructor() {
    super("Circle faucet API is not enabled for this account (requires mainnet upgrade)");
    this.name = "FaucetForbiddenError";
  }
}

export interface RequestFaucetTokensArgs {
  address: string;
  asset: FaucetAsset;
}

/** Requests one of Circle's three testnet-faucet-supported tokens — native
 *  gas, USDC, or EURC (the complete set `requestTestnetTokens` accepts) —
 *  for a wallet address. Throws `FaucetRateLimitedError` on a 429 so the
 *  caller can distinguish "try again later" from a real failure. */
export async function requestFaucetTokens({
  address,
  asset,
}: RequestFaucetTokensArgs): Promise<void> {
  const network = process.env.ARC_NETWORK ?? "ARC-TESTNET";
  const client = getCircleClient();

  try {
    await client.requestTestnetTokens({
      address,
      blockchain: network as TestnetBlockchain,
      native: asset === "NATIVE",
      usdc: asset === "USDC",
      eurc: asset === "EURC",
    });
  } catch (err) {
    // NOTE: don't rely on the SDK's typed error classes alone here. The SDK
    // picks the class from the *body's* `code` field when present (falling
    // back to HTTP status only when it's absent), and the faucet endpoint
    // returns generic body codes (429 → {code: 5}, 403 → {code: 3}) that
    // match no class — so `instanceof RatelimitError/ForbiddenError` is
    // false for exactly the responses this endpoint actually sends, and the
    // error arrives as the base HttpResponseError. Check the HTTP status
    // directly, keeping instanceof as a backstop for bodies without a code.
    const status = (err as { status?: number }).status;
    if (status === 429 || err instanceof RatelimitError) {
      throw new FaucetRateLimitedError();
    }
    // Circle's HttpError hides the response body from its own serialization
    // ("prevents sensitive data leakage"), so a bare log shows only
    // status/url and a generic "Forbidden" — the real reason (e.g. faucet
    // not enabled for this chain, API key lacks scope) lives in the raw
    // Axios response body. Surface it here so faucet failures are
    // diagnosable from logs instead of opaque.
    const axiosError = (err as { error?: { response?: { data?: unknown } } }).error;
    console.error("[circle] faucet request rejected", {
      address,
      asset,
      blockchain: network,
      status,
      circleResponse: axiosError?.response?.data ?? "(no response body)",
    });
    if (status === 403 || err instanceof ForbiddenError) {
      throw new FaucetForbiddenError();
    }
    throw err;
  }

  console.log("[circle] faucet request submitted", { address, asset });
}