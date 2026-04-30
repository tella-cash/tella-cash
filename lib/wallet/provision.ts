import { createWalletForUser } from "@/lib/wallet/circle";
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
 *   none → pending → failed   (Circle errored; retry job will pick up)
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

    const { walletId, address } = await createWalletForUser(userId);

    await setWalletActive({ userId, walletId, address });

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