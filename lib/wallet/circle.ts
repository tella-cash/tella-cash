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
    address: shortenForLog(wallet.address),
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

/** One raw balance entry, before same-symbol entries are merged for display. */
export interface RawBalance {
  symbol: string;
  amount: number;
  tokenId: string;
  tokenAddress: string | null;
}

async function fetchRawBalances(walletId: string): Promise<RawBalance[]> {
  const client = getCircleClient();
  const response = await client.getWalletTokenBalance({ id: walletId });

  const balances = (response.data?.tokenBalances ?? []).map((b) => ({
    symbol: b.token?.symbol ?? "UNKNOWN",
    amount: parseFloat(b.amount ?? "0"),
    tokenId: b.token?.id ?? "",
    tokenAddress: b.token?.tokenAddress ?? null,
  }));

  return dedupeSameToken(balances);
}

/**
 * Collapses repeated entries for the SAME token down to one.
 *
 * Circle can list a wallet's holding of a single token as more than one
 * `tokenBalances` entry. getWalletBalances then adds same-symbol entries
 * together, which is correct for two genuinely different tokens and wrong
 * for two views of one — it reported a wallet holding 10 USDC as holding 20,
 * in the balance reply and on the "money received" card alike.
 *
 * Deduping here rather than inside getWalletBalances keeps
 * resolveSpendableUsdc seeing the same set: it picks the largest USDC entry
 * to spend from, and a phantom duplicate is a candidate it should never have
 * been offered.
 *
 * Identity is the token id when Circle gives one, falling back to
 * symbol + contract address — two genuinely distinct tokens never share a
 * contract address, so a bridged/native pair still merges as it should while
 * a repeat of one token does not.
 *
 * Exported for lib/wallet/balances.test.ts.
 */
export function dedupeSameToken(balances: RawBalance[]): RawBalance[] {
  const seen = new Set<string>();
  const unique: RawBalance[] = [];

  for (const b of balances) {
    const identity = b.tokenId || `${b.symbol}@${b.tokenAddress ?? "native"}`;
    if (seen.has(identity)) {
      console.warn("[circle] duplicate token balance entry dropped", {
        identity,
        symbol: b.symbol,
        amount: b.amount,
      });
      continue;
    }
    seen.add(identity);
    unique.push(b);
  }

  return unique;
}

/**
 * Fetches wallet token balances, merging entries that share a symbol into
 * one line. Circle's testnet lists what a user thinks of as "USDC" as more
 * than one balance entry (e.g. a bridged/native pair), which otherwise shows
 * up as a confusing duplicate "X USDC" / "Y USDC" pair in the balance reply
 * instead of one combined total.
 *
 * This only ever sums DISTINCT tokens: fetchRawBalances has already dropped
 * repeats of a single token, which this function would otherwise add to
 * itself and report as double the money in the wallet.
 *
 * Merging is right for DISPLAY and wrong for SENDING — a single transfer
 * draws on one token, not the sum of two. Use resolveSpendableUsdc for
 * anything that decides whether a transfer can go through.
 */
export async function getWalletBalances(
  walletId: string,
): Promise<TokenBalance[]> {
  return mergeBalancesBySymbol(await fetchRawBalances(walletId));
}

/**
 * The symbol merge itself, split out from the fetch so it can be tested
 * against a fixed set of entries rather than a live wallet. Expects input
 * that has already been through dedupeSameToken.
 */
export function mergeBalancesBySymbol(balances: RawBalance[]): TokenBalance[] {
  const merged = new Map<string, TokenBalance>();
  for (const b of balances) {
    const existing = merged.get(b.symbol);
    if (existing) {
      existing.amount = String(parseFloat(existing.amount) + b.amount);
    } else {
      merged.set(b.symbol, {
        symbol: b.symbol,
        amount: String(b.amount),
        tokenAddress: b.tokenAddress,
      });
    }
  }

  return [...merged.values()];
}

export interface SpendableUsdc {
  /** Circle's token UUID — passed explicitly to createTransaction. */
  tokenId: string;
  /** Balance of that specific token, which is what a transfer can draw on. */
  available: number;
}

/**
 * Finds the USDC holding a transfer would actually spend from.
 *
 * Two things depend on this. The transfer needs an explicit `tokenId`:
 * createTransaction takes a discriminated union of either `{tokenId}` or
 * `{tokenAddress, blockchain}`, and this code used to pass
 * `tokenId: undefined as unknown as string` alongside a blockchain, which
 * is not a valid member of either arm — an empty tokenAddress means NATIVE
 * token, so the shape only did the right thing by accident. And the balance
 * precheck needs to compare against one token's balance, not a merged total.
 *
 * When the wallet holds more than one USDC-symbol token, the largest is
 * chosen: it's the one most likely to cover the send, and picking the
 * smaller one would fail a transfer the user can afford.
 *
 * CIRCLE_USDC_TOKEN_ID pins the choice when set, for when the testnet's
 * duplicate entries need overriding.
 */
export async function resolveSpendableUsdc(
  walletId: string,
): Promise<SpendableUsdc | null> {
  const raw = await fetchRawBalances(walletId);
  const usdc = raw.filter((b) => b.symbol === "USDC" && b.tokenId);

  const pinned = process.env.CIRCLE_USDC_TOKEN_ID;
  if (pinned) {
    const match = usdc.find((b) => b.tokenId === pinned);
    return { tokenId: pinned, available: match?.amount ?? 0 };
  }

  if (usdc.length === 0) return null;

  const best = usdc.reduce((a, b) => (b.amount > a.amount ? b : a));
  return { tokenId: best.tokenId, available: best.amount };
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
  /** Circle token UUID from resolveSpendableUsdc. */
  tokenId: string;
  /**
   * Stable per-send key. Circle dedupes on it, so a retry of the SAME send
   * can't become a second transfer. Must NOT be random per call — that is
   * precisely what makes a retry unsafe.
   */
  idempotencyKey: string;
}

export interface SendUsdcResult {
  transactionId: string;
  /** Circle's submit state (INITIATED, SENT, …) — never COMPLETE yet. */
  state: string;
}

export async function sendUsdc({
  fromWalletId,
  toAddress,
  amount,
  tokenId,
  idempotencyKey,
}: SendUsdcArgs): Promise<SendUsdcResult> {
  const client = getCircleClient();

  const response = await client.createTransaction({
    idempotencyKey,
    walletId: fromWalletId,
    destinationAddress: toAddress,
    tokenId,
    amount: [amount],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const tx = response.data;
  if (!tx?.id) {
    throw new Error("Circle createTransaction returned no transaction ID");
  }

  console.log("[circle] send submitted", {
    fromWallet: shortenForLog(fromWalletId),
    toAddress: shortenForLog(toAddress),
    amount,
    txId: tx.id,
  });

  // createTransaction's response carries only `id` and `state` — there is no
  // txHash at submit time, so the old `(tx as any).txHash` was reading a
  // field that never existed and was always null. The hash arrives later on
  // the transactions.outbound webhook, which is what posts the explorer link.
  return {
    transactionId: tx.id,
    state: tx.state,
  };
}

/**
 * Wallet addresses and IDs are identifiers for a person's money. Logs get
 * shipped to third-party aggregators and read by people who don't need to
 * know whose wallet is whose, so they go in truncated — enough to correlate
 * two lines, not enough to be a directory.
 */
function shortenForLog(value: string | null | undefined): string {
  if (!value) return "(none)";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
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
      address: shortenForLog(address),
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

  console.log("[circle] faucet request submitted", {
    address: shortenForLog(address),
    asset,
  });
}