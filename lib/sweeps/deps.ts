import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { tellaSweep, tellaUserChainWallet } from "@/lib/supabase/types";
import { findChainById } from "@/lib/chains/config";
import {
  executeContractCall,
  getCircleTransaction,
  getWalletInfo,
  signTypedDataWith,
} from "@/lib/wallet/circle";
import { raiseAlert } from "@/lib/observability/alerts";
import type { SweepContext, SweepDeps } from "./advance";
import { fetchDelivery } from "./iris";
import { transition } from "./repository";
import { sweeperEnvName, sweeperWalletIdFor } from "./sweeper";

/**
 * The real dependencies of the sweep saga.
 *
 * THE SWEEPER WALLET. Each source chain needs one smart-contract wallet that
 * belongs to tella: it receives the user's signed authorisation, approves, and
 * burns. Smart-contract because Circle's Gas Station only sponsors gas for
 * those, which is what lets the user hold no ETH and tella hold none either.
 *
 * Its id comes from an env var (see sweeper.ts, which also lets the circle
 * webhook recognise it and skip it: its inbound pull would otherwise be
 * announced as a deposit).
 */

export { sweeperEnvName, sweeperWalletIdFor };

// The address of a wallet never changes; asking Circle once per instance is enough.
const sweeperAddressCache = new Map<string, string>();

async function loadContext(sweep: tellaSweep): Promise<SweepContext> {
  const chain = await findChainById(sweep.chain_id);
  if (!chain) throw new Error(`Sweep ${sweep.id}: chain ${sweep.chain_id} is not active on this deployment`);

  const sweeperWalletId = sweeperWalletIdFor(chain.blockchain);
  if (!sweeperWalletId) {
    throw new Error(`${sweeperEnvName(chain.blockchain)} is not set; cannot sweep ${chain.blockchain}`);
  }

  let sweeperAddress = sweeperAddressCache.get(sweeperWalletId);
  if (!sweeperAddress) {
    const info = await getWalletInfo(sweeperWalletId);
    // A sweeper on the wrong chain would take the user's signature (valid for
    // one chain id) and fail — or worse, exist on a chain where it is valid
    // for something else.
    if (info.blockchain !== chain.blockchain) {
      throw new Error(
        `${sweeperEnvName(chain.blockchain)} points at a wallet on ${info.blockchain}, expected ${chain.blockchain}`,
      );
    }
    sweeperAddress = info.address;
    sweeperAddressCache.set(sweeperWalletId, sweeperAddress);
  }

  const { data, error } = await getSupabaseAdmin()
    .from("tella_user_chain_wallets")
    .select("*")
    .eq("user_id", sweep.user_id)
    .eq("chain_id", sweep.chain_id)
    .maybeSingle();
  if (error) throw new Error(`Sweep ${sweep.id}: user chain wallet lookup failed: ${error.message}`);
  const userWallet = data as tellaUserChainWallet | null;
  if (!userWallet) throw new Error(`Sweep ${sweep.id}: the user has no wallet record on ${chain.blockchain}`);

  // The row's address is what the authorisation names as `from` and what the
  // mint goes to. It must be the wallet that will do the signing.
  if (userWallet.address.toLowerCase() !== sweep.address.toLowerCase()) {
    throw new Error(`Sweep ${sweep.id}: address on the sweep differs from the user's wallet on ${chain.blockchain}`);
  }

  return {
    chain,
    userWalletId: userWallet.circle_wallet_id,
    sweeperWalletId,
    sweeperAddress,
    network: chain.network,
  };
}

export function realSweepDeps(): SweepDeps {
  return {
    now: () => Date.now(),
    context: loadContext,
    sign: signTypedDataWith,
    submit: executeContractCall,
    txStatus: getCircleTransaction,
    delivery: fetchDelivery,
    transition,
    alert: (kind, message, sweep) =>
      raiseAlert({
        kind,
        message: `${message} Sweep ${sweep.id}.`,
        // No addresses, no user id: this goes to a chat channel.
        context: { sweepId: sweep.id, status: sweep.status, amountMicro: sweep.amount_micro },
        // Money in limbo is never the second-of-a-flood alert.
        force: kind === "sweep_stuck",
      }),
  };
}
