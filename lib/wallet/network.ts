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

/**
 * The USDC ERC-20 predeploy, which is the only contract address a "USDC"
 * balance is allowed to have.
 *
 * Arc runs USDC as the native gas token AND as an ERC-20 view over the same
 * asset, at this address on both networks (Circle's contract-address docs;
 * confirmed against the mainnet explorer at explorer.arc.io). Circle reports
 * one wallet's holding under both interfaces, which is why collapseBySymbol
 * exists.
 *
 * WHY THIS IS NEEDED AT ALL. Before this, "is this USDC?" was answered by the
 * token's own symbol() string. Nobody bothers to spoof that on a testnet. On
 * mainnet anyone can deploy an ERC-20 that calls itself USDC and airdrop it
 * to an address they read off the explorer — and because the larger balance
 * wins, it would have displaced the real holding in the balance reply, in the
 * "money received" card, and in the token a transfer actually draws on. The
 * user would have been told they sent USDC while the recipient received a
 * worthless token.
 *
 * Same value for both networks today. It stays a function rather than an
 * exported constant so that a chain with a different predeploy is a one-line
 * change here, switching on arcNetwork(), rather than a hunt through the
 * money path.
 */
const USDC_PREDEPLOY = "0x3600000000000000000000000000000000000000";

export function arcUsdcAddress(): string {
  return USDC_PREDEPLOY;
}

/**
 * Is this balance entry really USDC, rather than something that merely calls
 * itself that?
 *
 * Accepts two shapes, both legitimate:
 *   - the native asset, which Circle reports with isNative set and no
 *     contract address;
 *   - the ERC-20 view, at the predeploy address above.
 *
 * Anything else with symbol "USDC" is an impostor. Tokens with other symbols
 * are none of this function's business and pass through untouched, because
 * nothing spendable is keyed on them.
 */
export function isRecognisedUsdc(token: {
  symbol: string;
  tokenAddress: string | null;
  isNative?: boolean;
}): boolean {
  return isRecognisedUsdcAt(token, arcUsdcAddress(), true);
}

/**
 * The same question for a chain other than Arc, where the official USDC
 * contract comes from tella_chains instead of the constant above.
 *
 * The rule is identical — a token is USDC because of its contract, not its
 * name — with one difference: there is no such thing as native USDC. On Arc
 * the gas token IS USDC, so a native entry with that symbol is real. On Base
 * the native asset is ETH, so a native entry calling itself USDC is exactly
 * the disguise this exists to catch, and allowNative is false.
 *
 * `allowNative` is a parameter rather than being inferred from the address so
 * that the one place it is true (Arc, via isRecognisedUsdc) says so out loud.
 */
export function isRecognisedUsdcAt(
  token: {
    symbol: string;
    tokenAddress: string | null;
    isNative?: boolean;
  },
  usdcAddress: string,
  allowNative = false,
): boolean {
  if (token.symbol !== "USDC") return true;
  if (token.isNative === true) return allowNative;
  // Circle reports the native entry with no contract address at all; an
  // ERC-20, impostor or not, always carries one.
  if (token.tokenAddress === null) return allowNative && token.isNative !== false;
  return token.tokenAddress.toLowerCase() === usdcAddress.toLowerCase();
}
