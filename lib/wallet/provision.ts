import { createWalletForUser } from "@/lib/wallet/circle";
import { ensureChainWalletsForUser } from "@/lib/chains/wallets";
import {
  markWalletPending,
  setWalletActive,
  markWalletFailed,
} from "@/lib/users/repository";

/**
 * Provision an Arc wallet for a user end-to-end.
 *
 * Status flow:
 *   none → pending → active   (happy path)
 *   none → pending → failed   (Circle errored)
 *
 * 'failed' users are picked up by app/api/cron/retry-wallets, which also
 * sweeps up anyone left stranded in 'pending' by a crash mid-flight. That
 * job did not exist when this comment first claimed it did, so users who
 * were told "I'll retry automatically" were stuck forever; it exists now.
 *
 * Designed to be called from a fire-and-forget context (e.g. inside
 * `after()` in a webhook). Errors are caught and logged here rather than
 * propagated, because there's no useful response path for the caller —
 * the user already got their onboarding-complete message.
 *
 * The `pending` status is set BEFORE the network call so that a process
 * crash mid-flight leaves a clear trail: any user stuck in 'pending' for
 * longer than ~60s is recoverable by re-running this function (Circle's
 * idempotencyKey ensures no duplicate wallet is created).
 *
 * Returns true on success, false on failure. Callers can use the return
 * value to decide whether to send an extra "your wallet is ready" message
 * or wait silently for the retry job.
 */
export async function provisionWalletForUser(
  userId: string,
): Promise<boolean> {
  try {
    await markWalletPending(userId);

    const { walletId, address, network } = await createWalletForUser(userId);

    await setWalletActive({ userId, walletId, address, network });

    // Their address on every other chain tella watches. After the Arc wallet
    // is recorded, and outside its try, because the Arc wallet is what makes
    // the account usable and a Base hiccup must not undo it. Anything missed
    // is picked up by /api/cron/chain-wallets.
    try {
      await ensureChainWalletsForUser({
        id: userId,
        circle_wallet_id: walletId,
        wallet_address: address,
      });
    } catch (err) {
      console.error("[wallet] chain wallets deferred to the backfill job", {
        userId,
        err,
      });
    }

    return true;
  } catch (err) {
    console.error("[wallet] provisioning failed", { userId, err });
    try {
      await markWalletFailed(userId);
    } catch (markErr) {
      console.error("[wallet] markWalletFailed also failed", {
        userId,
        markErr,
      });
    }
    return false;
  }
}