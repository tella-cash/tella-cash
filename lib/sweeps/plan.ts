import type { tellaUser } from "@/lib/supabase/types";
import { listUserChainWallets } from "@/lib/chains/wallets";
import { sumHeldUsdc } from "@/lib/held_sends/repository";
import { getChainUsdcBalance, resolveSpendableUsdc } from "@/lib/wallet/circle";
import { FINALITY_FAST, evmChainIdFor } from "./cctp";
import { loadFeeConfig } from "./fee-config";
import { sweepSendsEnabled } from "./flag";
import { fetchRouteFees } from "./iris";
import { parseMicro, parseMicroTruncating } from "./micro";
import { quoteSend, type ChainHolding, type Quote } from "./quote";
import { findOpenSweep } from "./repository";
import { sumSweepingCommittedMicro } from "./send-repository";
import { sweeperWalletIdFor } from "./sweeper";

/**
 * Reads the user's balances and Circle's prices and asks the quote module what
 * a send would take. The only impure step between "send 40" and a plan.
 *
 * Returns null when sweeps are off or the user has nothing elsewhere to draw
 * on; the caller then behaves exactly as it did before sweeps existed.
 *
 * Throws on a failure to read the Arc side. A chain that cannot be read or
 * priced is merely left out (and reported as route_unavailable if that is what
 * made the difference); an unreadable Arc balance means nothing here can be
 * trusted, and the caller already fails closed on that.
 */
export async function planSweepSend(args: {
  user: tellaUser;
  amount: string;
}): Promise<Quote | null> {
  if (!sweepSendsEnabled()) return null;
  const { user } = args;
  if (!user.circle_wallet_id) return null;

  const sendMicro = parseMicro(args.amount);
  if (sendMicro === null || sendMicro <= BigInt(0)) return null;

  const wallets = await listUserChainWallets(user.id);
  if (wallets.length === 0) return null;

  const [usdc, held, parked] = await Promise.all([
    resolveSpendableUsdc(user.circle_wallet_id),
    sumHeldUsdc(user.id),
    sumSweepingCommittedMicro(user.id),
  ]);

  // What Arc can really give this send: spendable, less what queued holds and
  // parked sends have already claimed. Floored: quoting a micro-unit more than
  // exists is a send that fails after money has moved.
  const arcSpendable = usdc ? BigInt(Math.floor(usdc.available * 1_000_000 + 1e-6)) : BigInt(0);
  const heldMicro = BigInt(Math.ceil(held * 1_000_000 - 1e-6));
  const committed = heldMicro + parked;
  const arcMicro = arcSpendable > committed ? arcSpendable - committed : BigInt(0);

  const results = await Promise.allSettled(
    wallets.map(async ({ wallet, chain }): Promise<ChainHolding | null> => {
      // Not sweepable at all: no sweeper wallet, or no known EVM chain id.
      if (!sweeperWalletIdFor(chain.blockchain) || evmChainIdFor(chain.blockchain) === null) return null;
      // One sweep in flight per chain. Another would only be refused by the
      // database after a quote promised it.
      if (await findOpenSweep(user.id, chain.id)) return null;

      const balance = parseMicroTruncating(await getChainUsdcBalance(wallet.circle_wallet_id, chain.usdc_address));
      if (balance === null || balance <= BigInt(0)) return null;

      const fees = await fetchRouteFees(chain.cctp_domain, FINALITY_FAST);
      return {
        chainId: chain.id,
        blockchain: chain.blockchain,
        displayName: chain.display_name,
        balanceMicro: balance,
        route: fees.ok ? fees.fees : null,
        finality: FINALITY_FAST,
      };
    }),
  );

  const holdings: ChainHolding[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) holdings.push(r.value);
    if (r.status === "rejected") console.error("[sweeps] could not read a chain for a quote", { userId: user.id, err: r.reason });
  }
  if (holdings.length === 0) return null;

  return quoteSend({ sendMicro, arcMicro, holdings, config: loadFeeConfig() });
}
