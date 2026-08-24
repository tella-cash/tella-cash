import { NextResponse, after } from "next/server";
import { findUserByCircleWalletId, findUserByWalletAddress } from "@/lib/users/repository";
import { notifyUser, notifyUserWithImage } from "@/lib/messaging/notify";
import { recordTransaction, markOutboundComplete } from "@/lib/transactions/repository";
import { getUsdToNgnRate, usdToNgn } from "@/lib/fx/naira";
import { getTokenSymbol, getFormattedBalanceLines } from "@/lib/wallet/circle";
import { verifyCircleWebhook } from "@/lib/circle/verify-webhook";
import {
  claimNotification,
  notificationKey,
  releaseNotification,
} from "@/lib/circle/processed-notifications";
import { raiseAlert } from "@/lib/observability/alerts";
import { factorCount } from "@/lib/auth/factors";
import { hasPanicCode, issuePanicCode } from "@/lib/security/panic-code";
import type { tellaUser } from "@/lib/supabase/types";

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
 * verify, ack 200 fast, process async via after().
 *
 * Verification happens before anything else and fails closed — an
 * unauthenticated POST here would otherwise let anyone tell a real user
 * that money they never received has arrived.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  const verification = await verifyCircleWebhook(rawBody, request.headers);
  if (!verification.ok) {
    // Worth waking someone for: a forged notification is an attempt to make
    // the bot tell a user that money arrived when it didn't.
    raiseAlert({
      kind: "webhook_signature_failed",
      message: `Rejected an unverified Circle notification (${verification.reason}).`,
      context: { source: "circle" },
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

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

// The unauthenticated GET health check was removed. It confirmed nothing the
// POST path doesn't: an unsigned POST now returns 401, which is itself proof
// the route is deployed and verifying. One less endpoint to enumerate.

/**
 * Dispatch a verified Circle notification to the right handler, once.
 *
 * Inbound notifies the recipient of received funds; outbound follows up a
 * completed send with its on-chain explorer link (the txHash isn't known
 * at submit time, so the immediate "✓ Sent" receipt can't include it).
 *
 * Two gates sit in front of the handlers, and their order is the whole
 * point.
 *
 * The state gate is first. Circle's `state` walks a sequence (INITIATED,
 * PENDING_RISK_SCREENING, SENT, COMPLETE, …) and every step arrives as its
 * own delivery carrying the SAME notification id. We only act on COMPLETE —
 * users should see funds as actually spendable, not "almost there", and an
 * outbound has no txHash before then.
 *
 * The claim is second, for that same reason: claiming on INITIATED would
 * burn the key on an event we ignore and silently swallow the COMPLETE one.
 *
 * The claim is what makes redelivery harmless. Circle's webhooks are
 * at-least-once, and this route used to run the full handler on every one of
 * them — a second "💰 Received" message and a second history row for a
 * single transfer, which reads as double the money that actually moved.
 */
async function processNotification(payload: CircleNotification) {
  const { notificationType, notification } = payload;

  const handler =
    notificationType === "transactions.inbound"
      ? handleInboundTransaction
      : notificationType === "transactions.outbound"
        ? handleOutboundTransaction
        : null;

  if (!handler) {
    console.log("[circle-webhook] unhandled type", notificationType);
    return;
  }

  if (notification.state !== "COMPLETE") {
    console.log("[circle-webhook] not yet complete, skipping", {
      type: notificationType,
      state: notification.state,
      walletId: notification.walletId,
    });
    return;
  }

  const key = notificationKey(notificationType, notification.id);
  const claimed = await claimNotification({
    key,
    notificationId: notification.id,
    notificationType,
  });
  if (!claimed) {
    console.log("[circle-webhook] duplicate delivery ignored", { key });
    return;
  }

  try {
    await handler(notification);
  } catch (err) {
    // Hand the claim back: a transient failure here must not be the reason
    // a user never learns their money arrived. Circle's next retry redoes it.
    await releaseNotification(key);
    throw err;
  }
}

/**
 * Handle a completed inbound USDC transaction.
 *
 *   1. Find the recipient user by walletId.
 *   2. Send a friendly "you received X from Y" message via WhatsApp.
 *   3. Record it in history.
 *
 * Reached only for COMPLETE notifications, and only once per notification —
 * both gates live in processNotification.
 */
async function handleInboundTransaction(
  notification: CircleNotification["notification"],
) {
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
        // notification.id is Circle's transaction id. Stored so the unique
        // index from migration 0011 can refuse a second row for this same
        // transfer even if the claim above is somehow lost — a receipt
        // written twice is a balance that reads double.
        circleTransactionId: notification.id,
        status: "complete",
      });
    } catch (err) {
      console.error("[circle-webhook] transaction record failed", { userId: user.id, err });
    }
  }

  await maybeOfferAccountSecurity(user);

  console.log("[circle-webhook] notified user of inbound", {
    userId: user.id,
    amount,
    token,
  });
}

/**
 * Offer to secure the account, once, at the first moment the user has
 * something to lose.
 *
 * This is the highest-value thing in the whole security effort and it is
 * easy to mistake for a nicety. Every rule elsewhere — the freeze, recovery,
 * step-up — is of the form "prove yourself with a factor you enrolled
 * earlier", and none of them protect an account that never enrolled one.
 * Most accounts have not: they were created by sending a WhatsApp message
 * and have had no reason to care since.
 *
 * Fired on receipt rather than at signup because that is when caring starts.
 * A brand new user asked to set up a PIN before they hold any money will
 * skip it, and they are right to.
 *
 * Sent once. The panic code doubles as the marker: issuing one is the only
 * thing that sets panic_code_hash, so an account that has one has already
 * been asked. Re-asking periodically would need a column of its own and is
 * the obvious next step, not something to fake with this.
 */
async function maybeOfferAccountSecurity(user: tellaUser): Promise<void> {
  try {
    if (hasPanicCode(user)) return;
    if ((await factorCount(user)) > 0) return;

    const code = await issuePanicCode(user.id);

    await notifyUser({
      user,
      body: [
        "🔐 One thing worth doing now you're holding money.",
        "",
        "Right now anyone with access to your chat can send from your wallet. Next time you send, I'll ask you to set up Face ID or a PIN — that takes about ten seconds and it's worth doing.",
        "",
        "In the meantime, here's your panic code:",
        "",
        `*${code}*`,
        "",
        "Save it somewhere that isn't this phone. If your phone is ever lost or stolen, go to " +
          `${(process.env.APP_BASE_URL ?? "").replace(/\/$/, "")}/panic` +
          " from any device, enter your number and this code, and everything stops leaving your wallet.",
        "",
        "It can only freeze. It can't spend, and it can't unfreeze — so it's safe to write down.",
      ].join("\n"),
    });

    console.log("[circle-webhook] offered account security", { userId: user.id });
  } catch (err) {
    // Never let this break a receipt notification. The money arriving is the
    // important message; this is the useful one that can wait for next time.
    console.error("[circle-webhook] security offer failed", {
      userId: user.id,
      err,
    });
  }
}

/**
 * Handle a completed outbound USDC transaction.
 *
 *   1. Bail if there's no txHash (shouldn't happen on COMPLETE, but a link
 *      to nothing is worse than no link).
 *   2. Find the sender by walletId (outbound walletId is the source).
 *   3. Follow up the immediate "✓ Sent" receipt with the explorer link.
 *
 * This is the second of two messages a sender sees: the PIN-verify route
 * sends the instant receipt (with a Circle reference), this adds the live
 * on-chain link once the chain confirms a few seconds later.
 *
 * Reached only for COMPLETE notifications, and only once per notification —
 * both gates live in processNotification.
 */
async function handleOutboundTransaction(
  notification: CircleNotification["notification"],
) {
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
    // notification.id is Circle's transaction id — the same value
    // createTransaction returned and follow-up.ts stored on the row, so this
    // resolves to exactly one send instead of guessing at the newest.
    await markOutboundComplete(user.id, notification.txHash, notification.id);
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