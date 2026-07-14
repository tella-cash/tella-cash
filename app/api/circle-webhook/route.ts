import { NextResponse, after } from "next/server";
import { findUserByCircleWalletId } from "@/lib/users/repository";
import { notifyUser } from "@/lib/whatsapp/notify";
import { recordTransaction, markOutboundComplete } from "@/lib/transactions/repository";
import { getUsdToNgnRate, usdToNgn } from "@/lib/fx/naira";

/**
 * Subset of the Circle notification payload we care about. Circle sends
 * many more fields (subscriptionId, timestamps, version), but the inbound
 * payment flow only needs these.
 */
interface CircleNotification {
  notificationType: string;
  notification: {
    id: string;
    walletId: string;
    blockchain: string;
    transactionType: "INBOUND" | "OUTBOUND";
    state: string;
    amounts?: string[];
    tokenSymbol?: string;
    sourceAddress?: string;
    destinationAddress?: string;
    txHash?: string;
    createDate?: string;
  };
}

/**
 * POST /api/circle-webhook
 *
 * Receives webhook events from Circle. Pattern mirrors the Twilio webhook:
 * parse, ack 200 fast, process async via after().
 *
 * NOTE: Signature verification is currently bypassed because we don't have
 * CIRCLE_NOTIFICATION_PUBLIC_KEY yet. This MUST be re-enabled before any
 * real users — anyone who finds this URL can otherwise POST fake "you
 * received $X" events. See verify-webhook.ts for the verification helper
 * that's ready to plug back in once we have the key.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  // TODO(security): re-enable signature verification once we have the
  // public key from Circle's /v2/notifications/publicKey endpoint.
  console.warn("[circle-webhook] signature verification SKIPPED");

  let payload: CircleNotification;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("[circle-webhook] received", {
    type: payload.notificationType,
    state: payload.notification?.state,
    walletId: payload.notification?.walletId,
  });

  after(async () => {
    try {
      await processNotification(payload);
    } catch (err) {
      console.error("[circle-webhook] processing error", err);
    }
  });

  return NextResponse.json({ received: true }, { status: 200 });
}

/**
 * GET /api/circle-webhook
 *
 * Health-check endpoint. Hitting this in a browser confirms the route is
 * deployed without going through the signed POST path.
 */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}

/**
 * Dispatch a verified Circle notification to the right handler.
 *
 * Inbound notifies the recipient of received funds; outbound follows up a
 * completed send with its on-chain explorer link (the txHash isn't known
 * at submit time, so the immediate "✓ Sent" receipt can't include it).
 * Switching on notificationType keeps room to add failed handlers later
 * without restructuring the route.
 */
async function processNotification(payload: CircleNotification) {
  switch (payload.notificationType) {
    case "transactions.inbound":
      return handleInboundTransaction(payload.notification);
    case "transactions.outbound":
      return handleOutboundTransaction(payload.notification);
    default:
      console.log("[circle-webhook] unhandled type", payload.notificationType);
  }
}

/**
 * Handle an inbound USDC transaction.
 *
 *   1. Skip if the transaction is still pending — we'll get another event
 *      when it confirms. Notifying twice is worse than late.
 *   2. Find the recipient user by walletId.
 *   3. Send a friendly "you received X from Y" message via WhatsApp.
 *
 * Circle's `state` goes through a sequence (INITIATED, PENDING_RISK_SCREENING,
 * SENT, COMPLETE, …). We only fire the user-facing notification on COMPLETE
 * so users see funds as actually spendable, not "almost there."
 */
async function handleInboundTransaction(
  notification: CircleNotification["notification"],
) {
  if (notification.state !== "COMPLETE") {
    console.log("[circle-webhook] inbound not yet complete, skipping", {
      state: notification.state,
      walletId: notification.walletId,
    });
    return;
  }

  const user = await findUserByCircleWalletId(notification.walletId);
  if (!user) {
    console.warn("[circle-webhook] no user for walletId", {
      walletId: notification.walletId,
    });
    return;
  }

  const amount = notification.amounts?.[0] ?? "0";
  const token = notification.tokenSymbol ?? "USDC";
  const sourceLabel = shortenAddress(notification.sourceAddress);

  const rate = await getUsdToNgnRate();

  const message = [
    `💰 Received ${amount} ${token}`,
    "",
    `From: ${sourceLabel}`,
    "",
    `Ask me "what's my balance?" to see your updated total.`,
  ].join("\n");

  await notifyUser({ user, body: message });

  try {
    await recordTransaction({
      userId: user.id,
      direction: "received",
      amountUsdc: amount,
      amountNgn: token === "USDC" ? String(usdToNgn(parseFloat(amount), rate)) : "0",
      token,
      counterpartyLabel: sourceLabel,
      counterpartyAddress: notification.sourceAddress ?? null,
      txHash: notification.txHash ?? null,
      status: "complete",
    });
  } catch (err) {
    console.error("[circle-webhook] transaction record failed", { userId: user.id, err });
  }

  console.log("[circle-webhook] notified user of inbound", {
    userId: user.id,
    amount,
    token,
  });
}

/**
 * Handle a completed outbound USDC transaction.
 *
 *   1. Skip until COMPLETE — earlier states have no txHash yet, and we
 *      only want to surface a link to a transaction that actually landed.
 *   2. Bail if there's still no txHash (shouldn't happen on COMPLETE, but
 *      a link to nothing is worse than no link).
 *   3. Find the sender by walletId (outbound walletId is the source).
 *   4. Follow up the immediate "✓ Sent" receipt with the explorer link.
 *
 * This is the second of two messages a sender sees: the PIN-verify route
 * sends the instant receipt (with a Circle reference), this adds the live
 * on-chain link once the chain confirms a few seconds later.
 */
async function handleOutboundTransaction(
  notification: CircleNotification["notification"],
) {
  if (notification.state !== "COMPLETE") {
    console.log("[circle-webhook] outbound not yet complete, skipping", {
      state: notification.state,
      walletId: notification.walletId,
    });
    return;
  }

  if (!notification.txHash) {
    console.warn("[circle-webhook] outbound complete but no txHash", {
      walletId: notification.walletId,
    });
    return;
  }

  const user = await findUserByCircleWalletId(notification.walletId);
  if (!user) {
    console.warn("[circle-webhook] no user for walletId", {
      walletId: notification.walletId,
    });
    return;
  }

  const amount = notification.amounts?.[0];
  const token = notification.tokenSymbol ?? "USDC";
  const destLabel = shortenAddress(notification.destinationAddress);

  const message = [
    "🔗 Confirmed on-chain",
    "",
    amount
      ? `Sent ${amount} ${token} to ${destLabel}`
      : `Sent to ${destLabel}`,
    "",
    buildExplorerTxUrl(notification.txHash),
  ].join("\n");

  await notifyUser({ user, body: message });

  try {
    await markOutboundComplete(user.id, notification.txHash);
  } catch (err) {
    console.error("[circle-webhook] transaction complete-mark failed", { userId: user.id, err });
  }

  console.log("[circle-webhook] notified user of outbound", {
    userId: user.id,
    txHash: notification.txHash,
  });
}

/**
 * Build an Arc block-explorer link for a transaction hash. Defaults to the
 * testnet explorer; override with ARC_EXPLORER_TX_URL (no trailing slash)
 * when pointing at mainnet.
 */
function buildExplorerTxUrl(txHash: string): string {
  const base =
    process.env.ARC_EXPLORER_TX_URL ?? "https://testnet.arcscan.app/tx";
  return `${base.replace(/\/$/, "")}/${txHash}`;
}

/**
 * Format a 0x address into something readable in chat.
 * "0x1234567890abcdef..." → "0x1234…cdef"
 *
 * Used for both inbound senders and outbound recipients — eventually we
 * could resolve an address back to a tella user name if they're on tella.
 */
function shortenAddress(address: string | undefined): string {
  if (!address) return "an external wallet";
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}