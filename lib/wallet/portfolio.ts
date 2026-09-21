import type { tellaChain, tellaUser } from "@/lib/supabase/types";
import { listUserChainWallets } from "@/lib/chains/wallets";
import { getChainUsdcBalance, getWalletBalances, type TokenBalance } from "@/lib/wallet/circle";

/**
 * Everything a user holds, across Arc and every chain they can be paid on.
 *
 * WHAT THIS IS NOT
 *
 * It is not the amount they can spend. A send draws on the Arc wallet only
 * (resolveSpendableUsdc), and nothing here changes that: money sitting on
 * another chain is shown so nobody wonders where a deposit went, and labelled
 * so nobody is told they can send it when they cannot. The two questions —
 * "what do I have" and "what can I send" — used to be one number because
 * there was one chain, and are now separate on purpose.
 *
 * WHY THE ARC BALANCE IS NOT SUMMED WITH THE REST
 *
 * The rule in lib/wallet/circle.ts is one entry per symbol, never a sum,
 * because Arc reports the same money twice. That rule is per WALLET. Across
 * wallets there is no duplication — a balance on Base and a balance on Arc
 * are different money — but adding them would produce a total nobody can
 * spend, so they are listed, not added.
 *
 * FAILURE IS PER CHAIN. A Base lookup that fails must not blank the Arc
 * balance, and must not silently make the total look smaller either, so it is
 * reported in `unavailable` for the caller to say out loud.
 */

export interface ChainHolding {
  chain: tellaChain;
  /** Six-decimal string, already known to be non-zero. */
  amount: string;
}

export interface Portfolio {
  /** Non-zero Arc balances. */
  arc: TokenBalance[];
  /** Non-zero USDC on other chains. */
  chains: ChainHolding[];
  /** Display names of chains whose balance could not be read just now. */
  unavailable: string[];
}

/**
 * Throws if the Arc balance cannot be read, exactly as getWalletBalances does,
 * so existing callers keep their error handling. Only the extra chains are
 * isolated.
 */
export async function loadPortfolio(
  user: Pick<tellaUser, "id">,
  arcWalletId: string,
): Promise<Portfolio> {
  const arcAll = await getWalletBalances(arcWalletId);
  const arc = arcAll.filter((b) => parseFloat(b.amount) > 0);

  const chains: ChainHolding[] = [];
  const unavailable: string[] = [];

  let wallets;
  try {
    wallets = await listUserChainWallets(user.id);
  } catch (err) {
    console.error("[portfolio] chain wallets lookup failed", { userId: user.id, err });
    return { arc, chains, unavailable: ["other networks"] };
  }

  const results = await Promise.allSettled(
    wallets.map(({ wallet, chain }) =>
      getChainUsdcBalance(wallet.circle_wallet_id, chain.usdc_address),
    ),
  );

  results.forEach((r, i) => {
    const { chain } = wallets[i];
    if (r.status === "rejected") {
      console.error("[portfolio] chain balance failed", {
        userId: user.id,
        blockchain: chain.blockchain,
        err: r.reason,
      });
      unavailable.push(chain.display_name);
      return;
    }
    if (parseFloat(r.value) > 0) chains.push({ chain, amount: r.value });
  });

  return { arc, chains, unavailable };
}

/**
 * The portfolio as plain lines: "12 USDC", "20 USDC on Base".
 *
 * No bullets — the balance reply adds its own and the received-money card
 * wants them bare. Arc first, then chains in the order they were added.
 */
export function portfolioLines(p: Portfolio): string[] {
  return [
    ...p.arc.map((b) => `${b.amount} ${b.symbol}`),
    ...p.chains.map((h) => `${h.amount} USDC on ${h.chain.display_name}`),
  ];
}

/** Anything worth telling the user about that the lines alone would not. */
export function portfolioNotes(p: Portfolio): string[] {
  const notes: string[] = [];
  if (p.chains.length > 0) {
    notes.push(
      "Money on another network shows here, but sends use your Arc balance for now.",
    );
  }
  if (p.unavailable.length > 0) {
    notes.push(
      `I couldn't check ${p.unavailable.join(" and ")} just now, so it isn't included above.`,
    );
  }
  return notes;
}
