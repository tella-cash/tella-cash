import { NextResponse, after } from "next/server";
import { findUserByCircleWalletId, findUserByWalletAddress } from "@/lib/users/repository";
import { notifyUser, notifyUserWithImage } from "@/lib/whatsapp/notify";
import { recordTransaction, markOutboundComplete } from "@/lib/transactions/repository";
import { getUsdToNgnRate, usdToNgn } from "@/lib/fx/naira";
import { getTokenSymbol, getFormattedBalanceLines } from "@/lib/wallet/circle";

/**
 * Subset of the Circle notification payload we care about. Circle sends
 * many more fields (subscriptionId, timestamps, version), but the inbound
 * payment flow only needs these.
 *
 * NOTE: Circle's webhook body carries `tokenId` (a UUID) — there is no
 * `tokenSymbol` field. Resolve the real symbol via `getTokenSymbol`
 * (lib/wallet/circle.ts) before showing it to anyone.
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
    tokenId?: string;
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
  const token = notification.tokenId
    ? await getTokenSymbol(notification.tokenId)
    : "UNKNOWN";
  console.log("[circle-webhook] resolved inbound token", {
    tokenId: notification.tokenId,
    resolvedSymbol: token,
  });

  const senderUser = notification.sourceAddress
    ? await findUserByWalletAddress(notification.sourceAddress)
    : null;
  const sourceLabel = senderUser?.profile_name ?? shortenAddress(notification.sourceAddress);

  let balanceLines: string[] = [];
  try {
    if (user.circle_wallet_id) {
      balanceLines = await getFormattedBalanceLines(user.circle_wallet_id);
    }
  } catch (err) {
    console.error("[circle-webhook] balance fetch for notification image failed", {
      userId: user.id,
      err,
    });
  }

  const explorerLink = notification.txHash
    ? buildExplorerTxUrl(notification.txHash)
    : null;

  const fallbackText = [
    `💰 Received ${amount} ${token}`,
    "",
    `From: ${sourceLabel}`,
    ...(explorerLink ? ["", explorerLink] : []),
    "",
    `Ask me "what's my balance?" to see your updated total.`,
  ].join("\n");

  try {
    const imageUrl = buildReceivedImageUrl({
      amount,
      token,
      sender: sourceLabel,
      balanceLines,
    });
    const caption = [
      `💰 Received ${amount} ${token} from ${sourceLabel}`,
      ...(explorerLink ? [explorerLink] : []),
    ].join("\n");
    await notifyUserWithImage({
      user,
      imageUrl,
      caption,
    });
  } catch (err) {
    console.error("[circle-webhook] image notify failed, falling back to text", {
      userId: user.id,
      err,
    });
    await notifyUser({ user, body: fallbackText });
  }

  // tella's money-tracking (history, Naira conversion) is USDC-only by
  // design — a EURC/cirBTC receipt still gets the WhatsApp notification
  // above (accurately labeled), just not a transaction-history row shaped
  // for a currency it isn't.
  if (token === "USDC") {
    try {
      const rate = await getUsdToNgnRate();
      await recordTransaction({
        userId: user.id,
        direction: "received",
        amountUsdc: amount,
        amountNgn: String(usdToNgn(parseFloat(amount), rate)),
        token,
        counterpartyLabel: sourceLabel,
        counterpartyAddress: notification.sourceAddress ?? null,
        txHash: notification.txHash ?? null,
        status: "complete",
      });
    } catch (err) {
      console.error("[circle-webhook] transaction record failed", { userId: user.id, err });
    }
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
  // tella only ever sends USDC (sendUsdc), so this is always USDC in
  // practice — resolved properly anyway rather than hardcoded, for the
  // same reason the inbound side is: consistency beats assumption.
  const token = notification.tokenId
    ? await getTokenSymbol(notification.tokenId)
    : "USDC";
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
 * Used as the sender/recipient label whenever the address doesn't resolve
 * to a known tella user's name.
 */
function shortenAddress(address: string | undefined): string {
  if (!address) return "an external wallet";
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Builds the absolute URL for the "money received" notification image
 * (app/api/notifications/received-image), which Twilio/Meta fetch directly
 * over HTTPS to deliver as WhatsApp media.
 */
function buildReceivedImageUrl(params: {
  amount: string;
  token: string;
  sender: string;
  balanceLines: string[];
}): string {
  const base = process.env.APP_BASE_URL;
  if (!base) {
    throw new Error("Missing APP_BASE_URL environment variable");
  }
  const qs = new URLSearchParams({
    amount: params.amount,
    token: params.token,
    sender: params.sender,
    balances: params.balanceLines.join(","),
  });
  return `${base.replace(/\/$/, "")}/api/notifications/received-image?${qs}`;
}