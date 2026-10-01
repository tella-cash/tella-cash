import { createHash, randomBytes } from "node:crypto";
import { feeCeil, toMilliBps } from "./micro";

/**
 * CCTP V2 facts and the pure builders around them: everything a sweep needs
 * that does not touch a network.
 *
 * Kept free of I/O so the parts that decide where money goes — the mint
 * recipient, the hook, the fee ceiling, the typed data the user's wallet signs
 * — are tested against fixed input rather than a live chain.
 */

/** Arc's CCTP domain. Every sweep ends here. */
export const ARC_CCTP_DOMAIN = 26;

/**
 * Circle's CCTP V2 contracts. The same address on every EVM chain within a
 * network, which is by design — not a value that varies per chain.
 * Arc mainnet was verified on chain (by the xebra project); both testnet
 * addresses were verified against Base Sepolia and Arc testnet.
 */
const CONTRACTS = {
  mainnet: {
    tokenMessenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
  },
  testnet: {
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  },
} as const;

export function tokenMessengerFor(network: "mainnet" | "testnet"): string {
  return CONTRACTS[network].tokenMessenger;
}

/**
 * The EVM chain id of each source chain a sweep may start on, keyed by
 * Circle's blockchain code.
 *
 * WHY THIS IS A TABLE IN CODE AND NOT A COLUMN ON tella_chains. The user's
 * wallet signs a message that is only valid on one chain id, and a wrong one
 * signs an authorisation the token contract will reject — at best. tella_chains
 * is add-only and cannot be corrected once a row is wrong, so a value like this
 * belongs somewhere a mistake can be fixed with a deploy.
 *
 * It also makes "may this chain be swept" an explicit decision. A chain an
 * admin adds to tella_chains can receive deposits immediately; it can be swept
 * only once it is listed here, and a chain that is not is refused rather than
 * guessed at.
 */
const EVM_CHAIN_ID: Record<string, number> = {
  BASE: 8453,
  "BASE-SEPOLIA": 84532,
};

export function evmChainIdFor(blockchain: string): number | null {
  return EVM_CHAIN_ID[blockchain] ?? null;
}

export const FINALITY_FAST = 1000;
export const FINALITY_STANDARD = 2000;

/**
 * hookData that asks Circle's Forwarding Service to submit receiveMessage on
 * the destination itself: the 24-byte tag "cctp-forward", then version 0 and
 * data length 0 as two uint32s. Circle mints on Arc, so tella needs no
 * Arc-side submitter and no Arc gas.
 *
 * The destination caller must be zero for this to work, which is also what
 * keeps every burn permissionlessly mintable if the forwarder is ever down.
 */
export function forwardHookData(): string {
  const tag = Buffer.from("cctp-forward", "utf8");
  const padded = Buffer.alloc(24);
  tag.copy(padded);
  return "0x" + padded.toString("hex") + "00000000" + "00000000";
}

export const ZERO_BYTES32 = "0x" + "00".repeat(32);

/** 0xabc… (20 bytes) → left-padded 32-byte hex, lowercase. */
export function addressToBytes32(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error("addressToBytes32: not an EVM address");
  }
  return "0x" + "00".repeat(12) + address.slice(2).toLowerCase();
}

/** A fresh EIP-3009 nonce: 32 random bytes, as the contract expects. */
export function newAuthNonce(): string {
  return "0x" + randomBytes(32).toString("hex");
}

/**
 * Circle's idempotency keys must be UUIDs. One per (sweep, step), derived from
 * the sweep id rather than generated, so re-running a step after a crash is a
 * replay Circle dedupes and not a second transaction.
 */
export function stepIdempotencyKey(sweepId: string, step: "pull" | "approve" | "burn"): string {
  const h = createHash("sha256").update(`tella-sweep:${sweepId}:${step}`).digest();
  // Shaped as a v4 UUID: version and variant bits set so a strict validator
  // accepts it. Entropy is irrelevant here; determinism is the point.
  h[6] = (h[6] & 0x0f) | 0x40;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/**
 * The EIP-712 payload the USER's wallet signs to let the sweeper pull USDC.
 *
 * ReceiveWithAuthorization rather than TransferWithAuthorization on purpose:
 * the contract requires the caller to BE `to`, so a signature observed in a
 * mempool cannot be front-run by someone who sends it to themselves. `to` is
 * the sweeper wallet and nothing else.
 *
 * Domain name and version are FiatToken v2's ("USD Coin", "2"); the caller
 * has verified the contract at `usdc` is Circle's, because it comes from
 * tella_chains.
 */
export function receiveAuthorizationTypedData(args: {
  usdc: string;
  chainId: number;
  from: string;
  to: string;
  value: bigint;
  validAfter: number;
  validBefore: number;
  nonce: string;
}): string {
  return JSON.stringify({
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ReceiveWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    domain: {
      name: "USD Coin",
      version: "2",
      chainId: args.chainId,
      verifyingContract: args.usdc,
    },
    primaryType: "ReceiveWithAuthorization",
    message: {
      from: args.from,
      to: args.to,
      // Strings: a uint256 does not survive being a JS number.
      value: args.value.toString(),
      validAfter: String(args.validAfter),
      validBefore: String(args.validBefore),
      nonce: args.nonce,
    },
  });
}

/** A 65-byte r||s||v signature split for receiveWithAuthorization(v, r, s). */
export function splitSignature(signature: string): { v: number; r: string; s: string } {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error("splitSignature: expected a 65-byte hex signature");
  }
  const r = "0x" + signature.slice(2, 66);
  const s = "0x" + signature.slice(66, 130);
  let v = parseInt(signature.slice(130, 132), 16);
  // Some signers return the recovery id (0/1) instead of 27/28.
  if (v < 27) v += 27;
  if (v !== 27 && v !== 28) throw new Error("splitSignature: unexpected recovery byte");
  return { v, r, s };
}

/** A route's price, as Circle quotes it for one finality tier. */
export interface RouteFees {
  /** Thousandths of a basis point, the fast-transfer fee. 0 for standard. */
  milliBps: bigint;
  /** micro-USDC, what Circle charges to submit the mint on the destination. */
  forwardHigh: bigint;
  forwardMed: bigint;
  forwardLow: bigint;
}

/** Highest forward fee believed: 2 USDC. Above it, Circle's quote is refused as wrong. */
export const MAX_SANE_FORWARD_FEE_MICRO = BigInt(2_000_000);

export type FeeParse = { ok: true; fees: RouteFees } | { ok: false; reason: string };

/**
 * Reads `GET /v2/burn/USDC/fees/{src}/{dst}?forward=true` for one finality
 * tier. Strict: a missing or non-numeric field is a refusal, never a default,
 * because the number this produces is a ceiling on money Circle keeps.
 *
 * The live API calls the middle forward tier `med`; Circle's spec says
 * `medium`. Both are read.
 */
export function parseRouteFees(body: unknown, finality: number): FeeParse {
  if (!Array.isArray(body)) return { ok: false, reason: "unexpected fee response" };
  const row = body.find(
    (r): r is Record<string, unknown> =>
      typeof r === "object" && r !== null && (r as { finalityThreshold?: unknown }).finalityThreshold === finality,
  );
  if (!row) return { ok: false, reason: `no quote for finality ${finality}` };

  const bps = typeof row.minimumFee === "number" ? toMilliBps(row.minimumFee) : null;
  if (bps === null) return { ok: false, reason: "minimumFee missing or out of range" };

  const fwd = row.forwardFee as Record<string, unknown> | undefined;
  if (!fwd || typeof fwd !== "object") return { ok: false, reason: "forwarding is not offered on this route" };

  const tier = (v: unknown): bigint | null =>
    typeof v === "number" && Number.isInteger(v) && v > 0 ? BigInt(v) : null;
  const low = tier(fwd.low);
  const med = tier(fwd.med ?? fwd.medium);
  const high = tier(fwd.high);
  if (low === null || med === null || high === null) return { ok: false, reason: "forward fee tiers missing" };
  if (high < low) return { ok: false, reason: "forward fee tiers inconsistent" };
  if (high > MAX_SANE_FORWARD_FEE_MICRO) return { ok: false, reason: "forward fee implausibly high" };

  return { ok: true, fees: { milliBps: bps, forwardLow: low, forwardMed: med, forwardHigh: high } };
}

export type MaxFeeResult =
  | { ok: true; maxFee: bigint; net: bigint }
  | { ok: false; reason: "too_small" };

/**
 * The most Circle may keep from a burn of `amount`: the transfer fee for the
 * chosen tier plus the forwarding fee, at the `high` tier.
 *
 * `high` and not `med` because a forward fee below what Circle needs at that
 * moment leaves the burn attested and UNMINTED — money in limbo that only a
 * manual claim recovers, which is the outcome this whole design exists to
 * avoid. The extra fraction of a cent is the cheaper failure.
 *
 * Refused when the fee would exceed `maxShareBps` of the amount (default
 * 10%): a sweep of a dollar that costs seventeen cents is not a favour to
 * the user, and the send flow should say the balance is too small to move.
 */
export function computeMaxFee(
  amount: bigint,
  fees: RouteFees,
  maxShareBps = BigInt(1000),
): MaxFeeResult {
  const maxFee = feeCeil(amount, fees.milliBps) + fees.forwardHigh;
  if (maxFee >= amount) return { ok: false, reason: "too_small" };
  if (maxFee * BigInt(10_000) > amount * maxShareBps) return { ok: false, reason: "too_small" };
  return { ok: true, maxFee, net: amount - maxFee };
}
