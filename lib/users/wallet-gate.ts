import type { tellaUser } from "@/lib/supabase/types";

/**
 * The two questions the codebase asks about a wallet before doing anything
 * with it. They were the same question until accounts could be frozen.
 *
 * Seven call sites checked `wallet_status` independently, each spelling the
 * condition out inline, and it was tempting to collapse them into one
 * `assertUsable(user)` while adding the freeze check. That would be wrong,
 * and wrong in the direction that hurts:
 *
 *   - "can this wallet SPEND?" must fail when frozen. That is the point.
 *   - "is this wallet READY?" must NOT. A frozen user still needs to read
 *     their balance and their receiving address, and they need them most at
 *     exactly the moment they have just frozen the account and are trying to
 *     work out what happened. Blinding them then would be a strange reward
 *     for doing the right thing.
 *
 * There is a third case hiding in the seven, and it is the one most likely
 * to be got wrong by someone adding a check later: lib/agent/handler.ts
 * checks the RECIPIENT's wallet before composing a send. That row belongs to
 * a different person. Freezing is about outbound only, so a frozen recipient
 * can still be paid — and refusing there would leak one user's security
 * state to another user, which is worse than useless.
 */

export type WalletGateFailure =
  /** No wallet yet, or provisioning failed outright. */
  | "not_provisioned"
  /** Wallet is being created; try again shortly. */
  | "provisioning"
  /** Account is frozen. Only ever returned by gateSpend. */
  | "frozen";

export type WalletGate =
  | { ok: true; walletId: string; address: string | null }
  | { ok: false; reason: WalletGateFailure };

/** Shared shape check, without any opinion about freezing. */
function gateProvisioned(user: tellaUser): WalletGate {
  if (user.wallet_status === "pending") {
    return { ok: false, reason: "provisioning" };
  }
  if (user.wallet_status !== "active" || !user.circle_wallet_id) {
    return { ok: false, reason: "not_provisioned" };
  }
  return { ok: true, walletId: user.circle_wallet_id, address: user.wallet_address };
}

/**
 * May this wallet send money right now?
 *
 * Use for anything that moves value out: composing a send, executing one,
 * requesting faucet tokens. `executePendingSend` is the authoritative call;
 * everything earlier is there so the user gets a useful message instead of a
 * link that dies when they tap it.
 */
export function gateSpend(user: tellaUser): WalletGate {
  if (isFrozen(user)) return { ok: false, reason: "frozen" };
  return gateProvisioned(user);
}

/**
 * Is this wallet provisioned and usable for reads?
 *
 * Use for balance, receiving address, history, and for checking a
 * RECIPIENT's wallet. Deliberately indifferent to freezing.
 */
export function gateWalletReady(user: tellaUser): WalletGate {
  return gateProvisioned(user);
}

/** The single definition of frozen, so no call site invents its own. */
export function isFrozen(user: tellaUser): boolean {
  return user.frozen_at !== null && user.frozen_at !== undefined;
}
