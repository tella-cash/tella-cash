import { NextResponse, after } from "next/server";
import { findUserByCircleWalletId } from "@/lib/users/repository";
import { sendWhatsAppMessage } from "@/lib/twilio/client";

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
 * Today only inbound transactions are subscribed; switching on
 * notificationType keeps room to add outbound and failed handlers later
 * without restructuring the route.
 */
async function processNotification(payload: CircleNotification) {
  switch (payload.notificationType) {
    case "transactions.inbound":
      return handleInboundTransaction(payload.notification);
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
  const sourceLabel = formatSourceAddress(notification.sourceAddress);

  const message = [
    `💰 Received ${amount} ${token}`,
    "",
    `From: ${sourceLabel}`,
    "",
    `Ask me "what's my balance?" to see your updated total.`,
  ].join("\n");

  await sendWhatsAppMessage({
    to: user.whatsapp_number,
    body: message,
  });

  console.log("[circle-webhook] notified user of inbound", {
    userId: user.id,
    amount,
    token,
  });
}

/**
 * Format a 0x sender address into something readable in chat.
 * "0x1234567890abcdef..." → "0x1234…cdef"
 *
 * For now the source is always an address — eventually we could resolve
 * it back to a UPay user name if the sender is also on UPay.
 */
function formatSourceAddress(address: string | undefined): string {
  if (!address) return "an external wallet";
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}