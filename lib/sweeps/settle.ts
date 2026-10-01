import type { tellaSweep, tellaSweepSend, tellaUser } from "@/lib/supabase/types";
import type { LimitResult } from "@/lib/sends/limits";
import type { TransferOutcome } from "@/lib/sends/execute";
import { sweepSendReadiness } from "./readiness";

/**
 * Finishing a parked send once its sweep has landed (or given up).
 *
 * THIS IS THE SECOND ACTOR THAT MOVES MONEY ON ITS OWN, after release-holds,
 * and it follows the same rule for the same reason: it does not trust a
 * decision made minutes ago. Permission is re-derived from scratch: the
 * network, the freeze, the limits (including the balance, which is the point
 * of waiting), then an atomic claim and the authoritative daily reservation,
 * and only then the transfer, keyed on the parked send's own id so Circle
 * dedupes a retry.
 *
 * Every dependency is passed in so the whole decision tree runs against fakes
 * (settle.test.ts); the real ones are in settle-deps.ts.
 */

export interface SettleDeps {
  listSweeping(limit: number): Promise<tellaSweepSend[]>;
  sweepsFor(sweepSendId: string): Promise<tellaSweep[]>;
  transition(
    id: string,
    from: tellaSweepSend["state"],
    to: tellaSweepSend["state"],
    patch?: { detail?: string; circleTransactionId?: string },
  ): Promise<tellaSweepSend | null>;
  findUser(userId: string): Promise<tellaUser | null>;
  /** Network this deployment runs on, as stamped on payloads. */
  network(): string;
  gate(user: tellaUser): { ok: true; walletId: string } | { ok: false; reason: "frozen" | "wallet_inactive" };
  checkLimits(user: tellaUser, amount: string): Promise<LimitResult>;
  reserve(args: {
    user: tellaUser;
    send: tellaSweepSend;
    dailyCap: number;
  }): Promise<{ ok: true; transactionId: string } | { ok: false; reason: "over_cap" | "unavailable"; already?: number }>;
  releaseReservation(transactionId: string): Promise<void>;
  attachCircleTransaction(transactionId: string, circleTransactionId: string): Promise<void>;
  transfer(args: { user: tellaUser; send: tellaSweepSend; walletId: string; tokenId: string }): Promise<TransferOutcome>;
  tell(user: tellaUser, lines: string[]): Promise<void>;
  afterSent(user: tellaUser, send: tellaSweepSend): Promise<void>;
}

export type SettleOutcome = "sent" | "cancelled" | "failed" | "unknown" | "waiting" | "skipped";

export interface SettleSummary {
  open: number;
  sent: number;
  cancelled: number;
  failed: number;
  unknown: number;
  waiting: number;
  skipped: number;
}

const BATCH_LIMIT = 25;

export async function settleSweepSends(deps: SettleDeps): Promise<SettleSummary> {
  const rows = await deps.listSweeping(BATCH_LIMIT);
  const summary: SettleSummary = { open: rows.length, sent: 0, cancelled: 0, failed: 0, unknown: 0, waiting: 0, skipped: 0 };
  for (const row of rows) {
    try {
      summary[await settleOne(row, deps)]++;
    } catch (err) {
      // Left as it is: the row is still 'sweeping' (or 'executing', for a
      // person to look at) and the next run sees it again.
      summary.failed++;
      console.error("[sweeps] settling a parked send threw", { sweepSendId: row.id, err });
    }
  }
  return summary;
}

function label(p: tellaSweepSend["payload"]): string {
  return p.recipientName ?? `${p.recipientAddress.slice(0, 6)}…${p.recipientAddress.slice(-4)}`;
}

export async function settleOne(send: tellaSweepSend, deps: SettleDeps): Promise<SettleOutcome> {
  const readiness = sweepSendReadiness(await deps.sweepsFor(send.id));
  if (readiness.kind === "waiting") return "waiting";

  const user = await deps.findUser(send.user_id);
  if (!user) {
    await deps.transition(send.id, "sweeping", "cancelled", { detail: "user not found" });
    return "cancelled";
  }

  const p = send.payload;
  const to = label(p);

  if (readiness.kind === "abandon") {
    const moved = await deps.transition(send.id, "sweeping", "cancelled", {
      detail: readiness.stuck ? "a sweep leg is stuck" : "a sweep leg failed",
    });
    if (!moved) return "skipped";
    await deps.tell(
      user,
      readiness.moved === "nothing"
        ? [
            `I couldn't move your USDC over to send ${p.amount} USDC to ${to}.`,
            "",
            "Nothing left your wallet and nothing was sent. Try again in a few minutes.",
          ]
        : [
            `I couldn't finish sending ${p.amount} USDC to ${to}, so I didn't send it.`,
            "",
            "Part of your money was already being moved. It's still yours and we're making sure it lands safely in your wallet. Check your balance in a bit, and reply *help* if it isn't there.",
          ],
    );
    return "cancelled";
  }

  // ---- ready: every leg has minted. Re-derive permission from scratch. ----

  if ((p.network ?? "ARC-TESTNET") !== deps.network()) {
    await deps.transition(send.id, "sweeping", "cancelled", { detail: "network changed" });
    await deps.tell(user, [`I didn't send the ${p.amount} USDC to ${to}.`, "", "tella moved networks in the meantime, so nothing was sent."]);
    return "cancelled";
  }

  const gate = deps.gate(user);
  if (!gate.ok) {
    await deps.transition(send.id, "sweeping", "cancelled", { detail: gate.reason });
    await deps.tell(user, [
      `I didn't send the ${p.amount} USDC to ${to}.`,
      "",
      gate.reason === "frozen"
        ? "Your account is frozen, so nothing was sent. The money I moved is on your Arc balance."
        : "Your wallet isn't ready to send right now, so nothing was sent. The money I moved is on your Arc balance.",
    ]);
    return "cancelled";
  }

  // Claim before the checks that can fail, so two overlapping runs cannot
  // both get as far as a transfer. Everything below is terminal for this row.
  const claimed = await deps.transition(send.id, "sweeping", "executing");
  if (!claimed) return "skipped";

  const limits = await deps.checkLimits(user, p.amount);
  if (!limits.ok) {
    await deps.transition(send.id, "executing", "cancelled", { detail: `limits: ${limits.failure.kind}` });
    await deps.tell(user, [
      `I moved your USDC over but couldn't send ${p.amount} USDC to ${to}.`,
      "",
      "It's on your Arc balance. Try the send again.",
    ]);
    return "cancelled";
  }

  const reservation = await deps.reserve({ user, send: claimed, dailyCap: limits.limits.daily });
  if (!reservation.ok) {
    await deps.transition(send.id, "executing", "cancelled", { detail: `reservation: ${reservation.reason}` });
    await deps.tell(user, [
      `I moved your USDC over but couldn't send ${p.amount} USDC to ${to}.`,
      "",
      reservation.reason === "over_cap"
        ? "That would put you over your daily limit. The money is on your Arc balance."
        : "I couldn't check your daily limit just now. The money is on your Arc balance.",
    ]);
    return "cancelled";
  }

  const transfer = await deps.transfer({ user, send: claimed, walletId: gate.walletId, tokenId: limits.usdc.tokenId });

  if (!transfer.ok) {
    // Same rule as every other send: a definite rejection releases the
    // reservation, an ambiguous one keeps it, because money that may have
    // moved must keep consuming the allowance.
    if (transfer.reason === "failed") await deps.releaseReservation(reservation.transactionId);
    await deps.transition(send.id, "executing", transfer.reason, { detail: "transfer" });
    await deps.tell(
      user,
      transfer.reason === "failed"
        ? [`The ${p.amount} USDC to ${to} didn't go through.`, "", "Your money is on your Arc balance. Try the send again when you're ready."]
        : [
            `Something went wrong sending the ${p.amount} USDC to ${to}, and I can't tell whether it went through.`,
            "",
            'Check with "balance" before trying again — I don\'t want you sending twice.',
          ],
    );
    return transfer.reason;
  }

  await deps.transition(send.id, "executing", "sent", { circleTransactionId: transfer.transactionId });
  await deps.attachCircleTransaction(reservation.transactionId, transfer.transactionId);
  await deps.tell(user, [`✓ Sent ${p.amount} USDC to ${to}.`]);
  await deps.afterSent(user, claimed);
  return "sent";
}
