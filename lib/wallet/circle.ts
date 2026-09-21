import { raiseAlert } from "@/lib/observability/alerts";
import {
  arcNetwork,
  isMainnet,
  isRecognisedUsdc,
  isRecognisedUsdcAt,
  type ArcNetwork,
} from "@/lib/wallet/network";
import {
  initiateDeveloperControlledWalletsClient,
  ForbiddenError,
  RatelimitError,
  type EvmBlockchain,
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
  /** Recorded on the user row so a later network switch can't reuse it. */
  network: ArcNetwork;
}

export async function createWalletForUser(userId: string): Promise<CreatedWallet> {
  const walletSetId = process.env.CIRCLE_WALLET_SET_ID;
  const network = arcNetwork();
  if (!walletSetId) {
    throw new Error("Missing CIRCLE_WALLET_SET_ID environment variable");
  }

  const client = getCircleClient();

  const response = await client.createWallets({
    walletSetId,
    blockchains: [network],
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

  // Recorded from what Circle MADE, never from what we asked for. The
  // blockchain comes back on the response and was being ignored, so an
  // idempotency-key replay returning a wallet from another network would have
  // been stamped with this deployment's network and waved through by
  // gateProvisioned. The webhook already checks Circle's blockchain field the
  // same way (app/api/circle-webhook/route.ts).
  const created = wallet.blockchain as ArcNetwork | undefined;
  if (created !== network) {
    throw new Error(
      `Circle returned a wallet on ${created ?? "an unstated network"}, expected ${network} (userId=${userId}). Likely an idempotency-key replay of a wallet created on another network.`,
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
    network,
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
  /**
   * Circle's own flag for the chain's native asset. Optional because rows
   * built before this existed (and older test fixtures) do not carry it;
   * isRecognisedUsdc falls back to "no contract address means native".
   */
  isNative?: boolean;
}

/**
 * `usdcAddress` is set for a wallet on a chain other than Arc: the contract
 * that counts as USDC there comes from tella_chains, and a native entry is
 * never USDC. Left unset, the wallet is the user's Arc wallet.
 */
async function fetchRawBalances(
  walletId: string,
  usdcAddress?: string,
): Promise<RawBalance[]> {
  const client = getCircleClient();
  const response = await client.getWalletTokenBalance({ id: walletId });

  const balances = (response.data?.tokenBalances ?? []).map((b) => ({
    symbol: b.token?.symbol ?? "UNKNOWN",
    amount: parseFloat(b.amount ?? "0"),
    tokenId: b.token?.id ?? "",
    tokenAddress: b.token?.tokenAddress ?? null,
    isNative: b.token?.isNative,
  }));

  // Dropped here, at the edge, rather than at each point of use. Everything
  // downstream — the balance reply, the received-money card, the dedupe, the
  // choice of token a transfer draws on — reads this one list, and a filter
  // applied at only some of those is a filter that will be forgotten at the
  // one that moves money.
  const genuine = balances.filter((b) => {
    if (usdcAddress ? isRecognisedUsdcAt(b, usdcAddress) : isRecognisedUsdc(b)) {
      return true;
    }
    console.warn("[circle] ignoring a token claiming to be USDC", {
      walletId,
      tokenId: b.tokenId,
      tokenAddress: b.tokenAddress,
    });
    raiseAlert({
      kind: "impostor_token",
      message: `A wallet holds a token whose symbol is USDC but whose contract is not ${usdcAddress ? "the one recorded for its chain" : "Arc's"}. It is being ignored; someone may be attempting to have users spend or be credited with a worthless token.`,
      context: { tokenId: b.tokenId, tokenAddress: b.tokenAddress },
    });
    return false;
  });

  return dedupeSameToken(genuine);
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
 * A user's balance, one line per symbol.
 *
 * This used to SUM entries that shared a symbol, and that was wrong in a way
 * that showed people twice their money.
 *
 * On Arc, USDC is both the native gas token and an ERC-20 predeploy at
 * 0x3600…0000, and Circle reports the same balance under both — different
 * token ids, different decimals (18 native, 6 ERC-20), one pot of money:
 *
 *   amount=25.999543733  isNative=true   id=15dc2b5d…  decimals=18
 *   amount=25.999543     isNative=false  id=ef87c8c3…  decimals=6
 *
 * No key made from ids or addresses can tell that those are the same money,
 * which is why the previous dedupe (tokenId, falling back to
 * symbol + tokenAddress) let both through and doubled the total.
 *
 * So this no longer sums anything. It picks ONE entry per symbol, by the
 * same rule resolveSpendableUsdc uses to decide what a transfer draws on.
 * That is the deeper reason summing was never right: a transfer spends from
 * a single token entry, so a total spanning two of them is a number the user
 * cannot actually spend. Balance and send limits now agree, which is the
 * property that matters when someone is deciding whether they can afford
 * something.
 *
 * If a chain ever genuinely holds two different same-symbol tokens, this
 * under-reports rather than over-reports, and says so in the logs. That is
 * the safe direction: quoting someone more than they can send produces a
 * failed transfer and a support message.
 */
export async function getWalletBalances(
  walletId: string,
): Promise<TokenBalance[]> {
  return collapseBySymbol(await fetchRawBalances(walletId));
}

/**
 * A wallet's USDC on a chain other than Arc, as a display string ("0" if none).
 *
 * Only USDC, and only the contract recorded for that chain. Base wallets
 * collect airdropped junk by the hundred, none of which is money and none of
 * which belongs in a balance reply; the same reasoning that made Arc's
 * balance USDC-by-contract applies, with the contract passed in.
 *
 * Same truncation to six places as everywhere else in this file.
 */
export async function getChainUsdcBalance(
  walletId: string,
  usdcAddress: string,
): Promise<string> {
  const raw = (await fetchRawBalances(walletId, usdcAddress)).filter(
    (b) => b.symbol === "USDC",
  );
  return collapseBySymbol(raw)[0]?.amount ?? "0";
}

/**
 * One entry per symbol: the largest, never the sum.
 *
 * Split out from the fetch so the rule can be tested against fixed input
 * rather than a live wallet. Mirrors resolveSpendableUsdc's choice, so the
 * number shown is the number that can be sent.
 */
export function collapseBySymbol(balances: RawBalance[]): TokenBalance[] {
  const bySymbol = new Map<string, RawBalance[]>();
  for (const b of balances) {
    const list = bySymbol.get(b.symbol);
    if (list) list.push(b);
    else bySymbol.set(b.symbol, [b]);
  }

  const out: TokenBalance[] = [];

  for (const [symbol, entries] of bySymbol) {
    const winner = entries.reduce((a, b) => (b.amount > a.amount ? b : a));

    if (entries.length > 1) {
      const smallest = entries.reduce((a, b) => (b.amount < a.amount ? b : a));
      // Near-identical amounts are the native/ERC-20 pair described above.
      // Materially different ones would mean genuinely separate holdings,
      // which this collapses and should therefore be visible somewhere.
      const sameMoney =
        winner.amount === 0 ||
        Math.abs(winner.amount - smallest.amount) / winner.amount < 0.01;

      if (!sameMoney) {
        console.warn("[circle] multiple distinct balances share a symbol", {
          symbol,
          kept: winner.amount,
          dropped: smallest.amount,
        });
      }
    }

    out.push({
      symbol,
      amount: formatAmount(winner.amount),
      tokenAddress: winner.tokenAddress,
    });
  }

  return out;
}

/**
 * Trims to the precision the asset actually has.
 *
 * The native entry carries 18 decimals, so picking it yields values like
 * 25.999543733 where the explorer and every transfer show 25.999543. Six
 * decimals is USDC's real precision; more is invented, and invented digits
 * on a balance make people think they have been shortchanged somewhere.
 */
function formatAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "0";
  // Truncated, not rounded. toFixed(6) turns 25.999543733 into 25.999544,
  // which is a fraction MORE than the wallet holds — and every rule here
  // errs downward, because a balance quoted high produces a transfer that
  // fails at Circle rather than a question the user can ask.
  return String(Math.floor(amount * 1e6) / 1e6);
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
  const decision = pickSpendableUsdc(
    await fetchRawBalances(walletId),
    process.env.CIRCLE_USDC_TOKEN_ID,
  );

  if (decision.pinMissed) {
    console.error("[circle] CIRCLE_USDC_TOKEN_ID matches no token in this wallet", {
      pinned: process.env.CIRCLE_USDC_TOKEN_ID,
    });
    raiseAlert({
      kind: "config_invalid",
      message:
        "CIRCLE_USDC_TOKEN_ID does not match any USDC token these wallets hold, so every send is being refused as insufficient balance.",
      context: { pinned: process.env.CIRCLE_USDC_TOKEN_ID ?? null },
    });
  }

  return decision.usdc;
}

export interface SpendableDecision {
  usdc: SpendableUsdc | null;
  /**
   * The pin named a token this wallet does not hold, WHILE holding USDC under
   * other ids — so the setting is wrong rather than the wallet being empty.
   * Distinguished because only one of those is worth waking anyone for.
   */
  pinMissed: boolean;
}

/**
 * The choice itself, without the network.
 *
 * Split out for the reason collapseBySymbol is: the rule that decides which
 * token a transfer draws on should be testable against fixed input rather than
 * a live wallet. The pinned branch in particular had a failure nobody could
 * see — a pin naming a token the wallet does not hold returns a balance of
 * zero, so every send is refused with "you don't have enough USDC", which is a
 * statement about the user's money for what is actually a typo in an env var.
 */
export function pickSpendableUsdc(
  raw: RawBalance[],
  pinned: string | undefined,
): SpendableDecision {
  // isRecognisedUsdc again, though fetchRawBalances has already applied it.
  // This function is the one that names the token a transfer spends from, and
  // it is called with a caller-supplied list in tests and could be elsewhere
  // tomorrow; the check costs nothing and the failure it prevents is paying
  // someone in a token that merely calls itself USDC.
  const usdc = raw.filter((b) => b.symbol === "USDC" && b.tokenId && isRecognisedUsdc(b));

  if (pinned) {
    const match = usdc.find((b) => b.tokenId === pinned);
    return {
      // Still fails closed. The pin exists precisely to override the automatic
      // choice below, so falling back to it on a miss would defeat the setting
      // and could draw the transfer from a token nobody chose.
      usdc: { tokenId: pinned, available: match?.amount ?? 0 },
      // An empty wallet has nothing to match and is entirely normal, so it
      // stays quiet. USDC held under ids that all differ from the pin is not.
      pinMissed: !match && usdc.length > 0,
    };
  }

  if (usdc.length === 0) return { usdc: null, pinMissed: false };

  const best = usdc.reduce((a, b) => (b.amount > a.amount ? b : a));
  return { usdc: { tokenId: best.tokenId, available: best.amount }, pinMissed: false };
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

export interface TokenInfo {
  symbol: string;
  /** Null for a native asset. */
  tokenAddress: string | null;
  isNative: boolean | undefined;
}

const tokenInfoCache = new Map<string, TokenInfo>();

/**
 * What Circle knows about a token id, or null if it could not be looked up.
 *
 * A chain deposit needs the contract address, not just the symbol: "is this
 * USDC" is answered by the contract (see lib/wallet/network.ts), and a symbol
 * alone is what an airdropped impostor supplies. Like the symbol, it never
 * changes for a given id, so it is cached; a failure is not.
 */
export async function getTokenInfo(tokenId: string): Promise<TokenInfo | null> {
  const cached = tokenInfoCache.get(tokenId);
  if (cached) return cached;

  try {
    const client = getCircleClient();
    const response = await client.getToken({ id: tokenId });
    const token = response.data?.token;
    if (!token) return null;
    const info: TokenInfo = {
      symbol: token.symbol ?? "UNKNOWN",
      tokenAddress: token.tokenAddress ?? null,
      isNative: token.isNative,
    };
    tokenInfoCache.set(tokenId, info);
    return info;
  } catch (err) {
    console.error("[circle] getTokenInfo lookup failed", { tokenId, err });
    return null;
  }
}

export async function getTokenSymbol(tokenId: string): Promise<string> {
  const cached = tokenSymbolCache.get(tokenId);
  if (cached) return cached;

  const info = await getTokenInfo(tokenId);
  // Don't cache a failure, and don't let a Circle API hiccup take down
  // the whole "you received money" notification — worst case the user
  // sees "UNKNOWN" instead of the real symbol, not silence.
  if (!info) return "UNKNOWN";

  // This symbol goes straight into "💰 Received 5 USDC". A token that calls
  // itself USDC without being Arc's is reported as UNKNOWN rather than
  // credited by name — the notification is the whole point of the spoof.
  const named = isRecognisedUsdc(info) ? info.symbol : "UNKNOWN";

  tokenSymbolCache.set(tokenId, named);
  return named;
}

export interface DerivedWallet {
  walletId: string;
  address: string;
}

/**
 * Adds a Circle wallet record on another chain for the SAME address as an
 * existing wallet of the user's.
 *
 * Idempotent on Circle's side: if the target wallet already exists it is
 * returned with its metadata updated, so a retry after a crash between this
 * call and the row that records it is safe.
 *
 * Two things are checked on what comes back, because both would otherwise be
 * wrong quietly. The blockchain must be the one asked for, and the address
 * must be the one the user already has — the whole premise is that a user's
 * address does not change, and a derive that returned a different one would
 * mean telling them to receive somewhere they had not been told about.
 */
export async function deriveWalletOnChain(
  sourceWalletId: string,
  blockchain: string,
  expectedAddress: string,
): Promise<DerivedWallet> {
  const client = getCircleClient();
  const response = await client.deriveWallet({
    id: sourceWalletId,
    // The SDK types the codes it knew at release. A chain added later is
    // valid to Circle and unknown to the union, and is checked by Circle.
    blockchain: blockchain as EvmBlockchain,
  });

  const wallet = response.data?.wallet;
  if (!wallet?.id || !wallet?.address) {
    throw new Error(`Circle deriveWallet returned no wallet (blockchain=${blockchain})`);
  }
  if (wallet.blockchain !== blockchain) {
    throw new Error(
      `Circle derived a wallet on ${wallet.blockchain ?? "an unstated network"}, expected ${blockchain}`,
    );
  }
  if (wallet.address.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(
      `Circle derived a different address on ${blockchain} (${shortenForLog(wallet.address)} vs ${shortenForLog(expectedAddress)}); refusing to record it`,
    );
  }

  return { walletId: wallet.id, address: wallet.address };
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
  // There is no faucet on mainnet. The handler already refuses before
  // getting here; this is the backstop so no other caller can reach it.
  if (isMainnet()) {
    throw new Error("requestFaucetTokens called on mainnet");
  }
  const network: TestnetBlockchain = "ARC-TESTNET";
  const client = getCircleClient();

  try {
    await client.requestTestnetTokens({
      address,
      blockchain: network,
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