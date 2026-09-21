import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { deriveWalletOnChain } from "@/lib/wallet/circle";
import { arcNetwork } from "@/lib/wallet/network";
import type {
  tellaChain,
  tellaUser,
  tellaUserChainWallet,
} from "@/lib/supabase/types";
import { findUserById } from "@/lib/users/repository";
import { findChainById, listActiveChains } from "./config";

/**
 * A user's wallet records on chains other than Arc.
 *
 * The address is the user's existing one; what these rows hold is Circle's
 * per-chain wallet id for it, which is what balances and webhooks are keyed
 * on. See migrations/0028_chains.sql.
 */

export interface UserChainWallet {
  wallet: tellaUserChainWallet;
  chain: tellaChain;
}

/** This user's chain wallets, for chains still active on this deployment. */
export async function listUserChainWallets(userId: string): Promise<UserChainWallet[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("tella_user_chain_wallets")
    .select("*")
    .eq("user_id", userId);
  if (error) throw new Error(`listUserChainWallets failed: ${error.message}`);

  const chains = await listActiveChains();
  const byId = new Map(chains.map((c) => [c.id, c]));

  const out: UserChainWallet[] = [];
  for (const wallet of (data as tellaUserChainWallet[]) ?? []) {
    const chain = byId.get(wallet.chain_id);
    // A wallet on a chain of the other network is not this deployment's.
    if (chain) out.push({ wallet, chain });
  }
  return out;
}

/** The owner and chain for a Circle wallet id, or null if it is not a chain wallet. */
export async function findChainWalletOwner(
  circleWalletId: string,
): Promise<{ user: tellaUser; chain: tellaChain; wallet: tellaUserChainWallet } | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("tella_user_chain_wallets")
    .select("*")
    .eq("circle_wallet_id", circleWalletId)
    .maybeSingle();
  if (error) throw new Error(`findChainWalletOwner failed: ${error.message}`);
  if (!data) return null;

  const wallet = data as tellaUserChainWallet;
  const chain = await findChainById(wallet.chain_id);
  if (!chain) return null;

  const user = await findUserById(wallet.user_id);
  if (!user) return null;

  return { user, chain, wallet };
}

export async function recordChainWallet(
  userId: string,
  chain: tellaChain,
  walletId: string,
  address: string,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("tella_user_chain_wallets")
    .upsert(
      {
        user_id: userId,
        chain_id: chain.id,
        circle_wallet_id: walletId,
        address,
      },
      { onConflict: "user_id,chain_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(`recordChainWallet failed: ${error.message}`);
}

/**
 * Give one user a wallet record on one chain.
 *
 * Safe to repeat: Circle returns the existing record for a wallet that is
 * already derived, and the row is written with ignoreDuplicates.
 */
export async function deriveChainWalletForUser(
  user: Pick<tellaUser, "id" | "circle_wallet_id" | "wallet_address">,
  chain: tellaChain,
): Promise<void> {
  if (!user.circle_wallet_id || !user.wallet_address) {
    throw new Error("user has no Arc wallet to derive from");
  }
  const derived = await deriveWalletOnChain(
    user.circle_wallet_id,
    chain.blockchain,
    user.wallet_address,
  );
  await recordChainWallet(user.id, chain, derived.walletId, derived.address);
}

/**
 * Bring one user up to date with every active chain.
 *
 * Called when their Arc wallet is created. Failures are counted, not thrown:
 * the Arc wallet is what makes the account usable and must not be undone by a
 * Base hiccup, and the backfill job will pick up whatever was missed.
 */
export async function ensureChainWalletsForUser(
  user: Pick<tellaUser, "id" | "circle_wallet_id" | "wallet_address">,
): Promise<{ created: number; failed: number }> {
  let created = 0;
  let failed = 0;

  const chains = await listActiveChains();
  if (chains.length === 0) return { created, failed };

  const have = new Set((await listUserChainWallets(user.id)).map((w) => w.chain.id));

  for (const chain of chains) {
    if (have.has(chain.id)) continue;
    try {
      await deriveChainWalletForUser(user, chain);
      created++;
    } catch (err) {
      failed++;
      console.error("[chains] derive failed", {
        userId: user.id,
        blockchain: chain.blockchain,
        err,
      });
    }
  }
  return { created, failed };
}

/**
 * One batch of users who have an Arc wallet but no record on this chain.
 *
 * Sequential, like the retry-wallets job, for the same reason: a burst of
 * calls at Circle is not a way to recover from Circle having a bad moment.
 * The caller decides how many batches to run.
 */
export async function backfillChain(
  chain: tellaChain,
  limit = 25,
): Promise<{ checked: number; created: number; failed: number }> {
  const { data, error } = await getSupabaseAdmin().rpc("tella_users_missing_chain_wallet", {
    p_chain_id: chain.id,
    p_wallet_network: arcNetwork(),
    p_limit: limit,
  });
  if (error) throw new Error(`backfillChain lookup failed: ${error.message}`);

  const rows = (data as { user_id: string; circle_wallet_id: string }[]) ?? [];

  let created = 0;
  let failed = 0;
  for (const row of rows) {
    const user = await findUserById(row.user_id);
    if (!user) continue;
    try {
      await deriveChainWalletForUser(user, chain);
      created++;
    } catch (err) {
      failed++;
      console.error("[chains] backfill derive failed", {
        userId: row.user_id,
        blockchain: chain.blockchain,
        err,
      });
    }
  }
  return { checked: rows.length, created, failed };
}

/**
 * Any user with an active Arc wallet on this deployment's network, or null.
 *
 * Used to prove to Circle that a blockchain code is real before it is written
 * into tella_chains for good: deriving from a real wallet is the one check
 * that asks Circle itself. The user is arbitrary and nothing about them is
 * read.
 */
export async function findProvisionedUserForProbe(): Promise<Pick<
  tellaUser,
  "id" | "circle_wallet_id" | "wallet_address"
> | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("tella_users")
    .select("id, circle_wallet_id, wallet_address")
    .eq("wallet_status", "active")
    .eq("wallet_network", arcNetwork())
    .not("circle_wallet_id", "is", null)
    .not("wallet_address", "is", null)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findProvisionedUserForProbe failed: ${error.message}`);
  return data as Pick<tellaUser, "id" | "circle_wallet_id" | "wallet_address"> | null;
}
