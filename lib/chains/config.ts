import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isMainnet } from "@/lib/wallet/network";
import type { tellaChain } from "@/lib/supabase/types";
import type { ChainNetwork, NewChainInput } from "./validate";

/**
 * The chains tella accepts deposits on besides Arc, read from tella_chains.
 *
 * Arc itself is not in this table. It is the home chain — the one wallets are
 * created on, sends leave from, and ARC_NETWORK selects — and every existing
 * code path already treats it as such. This is the list of everywhere ELSE a
 * user's address is watched.
 *
 * ONLY THIS DEPLOYMENT'S NETWORK. A row is filtered on mainnet/testnet against
 * ARC_NETWORK, so a database that somehow holds both never hands a testnet
 * chain to a mainnet deployment.
 *
 * CACHED FOR A MINUTE. The webhook asks "is this a chain I watch" on every
 * notification, and the balance reply asks it on every request; neither
 * deserves a database round trip. The table only ever grows, so a stale cache
 * can only be missing a chain added in the last minute — never holding one
 * that has gone, which is the dangerous direction and cannot happen here.
 */

const TTL_MS = 60_000;

let cache: { at: number; chains: tellaChain[] } | null = null;

export function currentChainNetwork(): ChainNetwork {
  return isMainnet() ? "mainnet" : "testnet";
}

/** Forget the cache. For after a chain has just been added. */
export function invalidateChainCache(): void {
  cache = null;
}

export async function listActiveChains(): Promise<tellaChain[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.chains;

  const { data, error } = await getSupabaseAdmin()
    .from("tella_chains")
    .select("*")
    .eq("network", currentChainNetwork())
    .order("created_at", { ascending: true });

  if (error) throw new Error(`listActiveChains failed: ${error.message}`);

  const chains = (data as tellaChain[]) ?? [];
  cache = { at: Date.now(), chains };
  return chains;
}

export async function findChainByBlockchain(
  blockchain: string,
): Promise<tellaChain | null> {
  return (await listActiveChains()).find((c) => c.blockchain === blockchain) ?? null;
}

export async function findChainById(id: string): Promise<tellaChain | null> {
  return (await listActiveChains()).find((c) => c.id === id) ?? null;
}

/**
 * Write a chain. There is no update and no delete, here or in the database.
 *
 * A unique-violation is reported as `duplicate` rather than thrown: two admins
 * pressing the button together is an ordinary race, and the loser should be
 * told "already added", not shown a server error.
 */
export async function insertChain(
  input: NewChainInput,
  addedBy: string,
): Promise<{ ok: true; chain: tellaChain } | { ok: false; reason: "duplicate" }> {
  const { data, error } = await getSupabaseAdmin()
    .from("tella_chains")
    .insert({
      slug: input.slug,
      display_name: input.displayName,
      network: currentChainNetwork(),
      blockchain: input.blockchain,
      usdc_address: input.usdcAddress,
      cctp_domain: input.cctpDomain,
      explorer_tx_url: input.explorerTxUrl,
      added_by: addedBy,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, reason: "duplicate" };
    throw new Error(`insertChain failed: ${error.message}`);
  }

  invalidateChainCache();
  return { ok: true, chain: data as tellaChain };
}

/** Every chain row, for the admin screen. Unlike the above, not network-filtered. */
export async function listAllChains(): Promise<tellaChain[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("tella_chains")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listAllChains failed: ${error.message}`);
  return (data as tellaChain[]) ?? [];
}
