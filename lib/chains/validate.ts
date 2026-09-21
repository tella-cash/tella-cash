/**
 * Checking a new chain before it is written down forever.
 *
 * Kept free of the database and of Circle so it can be tested with plain
 * values and so the admin form and the API route apply exactly the same rules.
 * The route adds the one check this file cannot make — that Circle itself
 * accepts the blockchain code — because nothing here can answer that.
 *
 * WHY SO STRICT
 *
 * tella_chains is add-only (migrations/0028_chains.sql). Everything accepted
 * here is permanent, so a value that is merely "probably fine" is refused. The
 * cost of a false rejection is one more attempt at a form; the cost of a false
 * acceptance is a row nobody can edit.
 *
 * WHAT IS DELIBERATELY NOT A RULE
 *
 * There is no cap on how many chains, no list of approved chains and no limit
 * on which USDC address may be used. Those are decisions for whoever is
 * looking at the dashboard, not for this file; what it enforces is only that
 * the values are well-formed, consistent with this deployment's network, and
 * do not collide with a chain already added.
 */

import type { tellaChain } from "@/lib/supabase/types";

export type ChainNetwork = "mainnet" | "testnet";

export interface NewChainInput {
  slug: string;
  displayName: string;
  blockchain: string;
  usdcAddress: string;
  cctpDomain: number;
  explorerTxUrl: string;
}

export type ChainFieldErrors = Partial<Record<keyof NewChainInput, string>>;

export type ChainValidation =
  | { ok: true; value: NewChainInput }
  | { ok: false; errors: ChainFieldErrors };

/**
 * Circle's own names for chains tella already runs on. Adding one of these
 * would create a second wallet on the chain every user already has a wallet
 * on, and a second answer to "which contract is USDC here".
 *
 * EVM / EVM-TESTNET are Circle's generic "any EVM chain" wallets, which exist
 * to sign for chains Circle does not index — no balances, no webhooks — so a
 * deposit watcher on them would silently watch nothing.
 */
const RESERVED = new Set(["ARC", "ARC-TESTNET", "EVM", "EVM-TESTNET"]);

/** CCTP's domain for Arc. A chain cannot share it. */
const ARC_CCTP_DOMAIN = 26;

const TESTNET_SUFFIX = /-(SEPOLIA|AMOY|FUJI|TESTNET|DEVNET|HOLESKY|GOERLI)$/;

/** Does this Circle blockchain code name a testnet? */
export function isTestnetCode(blockchain: string): boolean {
  return TESTNET_SUFFIX.test(blockchain);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function validateNewChain(
  raw: unknown,
  network: ChainNetwork,
  existing: Pick<tellaChain, "slug" | "blockchain" | "cctp_domain">[],
): ChainValidation {
  const errors: ChainFieldErrors = {};
  const r = (raw ?? {}) as Record<string, unknown>;

  const slug = str(r.slug).toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,23}$/.test(slug)) {
    errors.slug =
      "2–24 characters: lowercase letters, digits and hyphens, starting with a letter.";
  } else if (existing.some((c) => c.slug === slug)) {
    errors.slug = "A network with this name already exists.";
  }

  const displayName = str(r.displayName);
  if (displayName.length < 1 || displayName.length > 40 || /[\u0000-\u001f]/.test(displayName)) {
    errors.displayName = "1–40 characters. This is what users are shown.";
  }

  const blockchain = str(r.blockchain).toUpperCase();
  if (!/^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$/.test(blockchain) || blockchain.length > 24) {
    errors.blockchain = "Circle's code for the network, e.g. BASE or ARB.";
  } else if (RESERVED.has(blockchain)) {
    errors.blockchain = `${blockchain} cannot be added: it is not a separate deposit network.`;
  } else if (isTestnetCode(blockchain) !== (network === "testnet")) {
    errors.blockchain =
      network === "testnet"
        ? "This deployment is on testnet, so the code must be a testnet one (e.g. BASE-SEPOLIA)."
        : "This deployment is on mainnet, so the code must be a mainnet one (e.g. BASE).";
  } else if (existing.some((c) => c.blockchain === blockchain)) {
    errors.blockchain = "This network has already been added.";
  }

  const usdcRaw = str(r.usdcAddress);
  const usdcAddress = usdcRaw.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(usdcAddress)) {
    errors.usdcAddress = "A 0x address, 42 characters.";
  } else if (/^0x0{40}$/.test(usdcAddress)) {
    errors.usdcAddress = "That is the zero address.";
  }

  const domainRaw = r.cctpDomain;
  const cctpDomain =
    typeof domainRaw === "number"
      ? domainRaw
      : /^\d{1,4}$/.test(str(domainRaw))
        ? Number(str(domainRaw))
        : NaN;
  if (!Number.isInteger(cctpDomain) || cctpDomain < 0 || cctpDomain > 1000) {
    errors.cctpDomain = "A whole number, from Circle's CCTP chain table.";
  } else if (cctpDomain === ARC_CCTP_DOMAIN) {
    errors.cctpDomain = "26 is Arc's own domain.";
  } else if (existing.some((c) => c.cctp_domain === cctpDomain)) {
    errors.cctpDomain = "Another network already uses this domain.";
  }

  let explorerTxUrl = str(r.explorerTxUrl);
  try {
    const u = new URL(explorerTxUrl);
    if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash) {
      throw new Error("shape");
    }
    explorerTxUrl = `${u.origin}${u.pathname}`.replace(/\/+$/, "");
  } catch {
    errors.explorerTxUrl =
      "An https:// link up to where the transaction hash goes, e.g. https://basescan.org/tx";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: { slug, displayName, blockchain, usdcAddress, cctpDomain, explorerTxUrl },
  };
}
