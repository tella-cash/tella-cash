import { NextResponse, after } from "next/server";
import { claimMessage, releaseMessage } from "@/lib/messaging/processed-messages";
import twilio from "twilio";
import {
  sendWhatsAppMessage,
  sendWhatsAppButtons,
  sendWhatsAppList,
  sendWhatsAppConfirm,
} from "@/lib/twilio/client";
import { handleIncomingMessage } from "@/lib/agent/handler";
import { findOrCreateUser } from "@/lib/users/repository";
import { provisionWalletForUser } from "@/lib/wallet/provision";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { allowUnsignedWebhooks, redactNumber } from "@/lib/whatsapp/signature-policy";

// The reply is composed inside after(), past the 200 the provider already
// has. Without an explicit ceiling that background work runs on the platform
// default and a slow call can be killed mid-flight, which is exactly how a
// turn goes missing with no reply and no error. The per-call timeouts in the
// decoder are sized to fit inside this.
export const maxDuration = 60;


interface TwilioWebhookPayload {
  From: string;
  To: string;
  Body: string;
  MessageSid: string;
  NumMedia: string;
  ProfileName?: string;
  // Present when the user taps a quick-reply button or list row; carries
  // the button/row title so we can route it like typed text.
  ButtonText?: string;
}

export async function POST(request: Request) {
  const signature = request.headers.get("x-twilio-signature") ?? "";
  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  // Twilio signs the exact URL it posts to, so we validate against the live
  // request URL (host + proto from headers) and the configured
  // TWILIO_WEBHOOK_URL, passing if either matches. Deriving from the live
  // request makes this resilient to domain changes (e.g. moving to a custom
  // domain) that would otherwise silently break a stale env URL and 403
  // every inbound message.
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  const candidateUrls = buildCandidateUrls(request);
  const isValid = candidateUrls.some((candidate) =>
    twilio.validateRequest(authToken, signature, candidate, params),
  );

  // Enforced everywhere, not just when NODE_ENV happens to be "production".
  // A misconfigured environment shouldn't be the only thing holding this
  // door shut. The bypass is an explicit opt-in for local dev only.
  if (!isValid && !allowUnsignedWebhooks()) {
    console.warn("[whatsapp] signature validation failed", {
      candidateUrls,
      hasSignature: Boolean(signature),
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const payload = params as unknown as TwilioWebhookPayload;
  const fromNumber = payload.From;
  // A tapped button/row arrives as ButtonText; fall back to it when Body
  // is empty so menu taps route through the same classifier as typed text.
  const userMessage = payload.Body || payload.ButtonText || "";

  // No full phone number, no profile name, no message text. MessageSid is
  // enough to correlate a log line with a specific message in Twilio's
  // console when something actually needs investigating; the rest was
  // personal data sitting in stdout for every message ever sent.
  console.log("[whatsapp] incoming", {
    sid: payload.MessageSid,
    from: redactNumber(fromNumber),
    chars: userMessage.length,
  });

  // Defer processing until after the response is sent. On Vercel, `after()`
  // keeps the function alive past the response so async work doesn't get
  // frozen mid-flight.
  after(async () => {
    // Twilio redelivers on a slow response or a non-2xx, and every
    // redelivery used to re-run the whole handler: a second reply, and a
    // second confirm link for a send the user asked for once. Claim first,
    // release if the work fails so a genuine retry can still do it.
    const claimed = await claimMessage({
      provider: "twilio",
      messageId: payload.MessageSid,
    });
    if (!claimed) {
      console.log("[whatsapp] duplicate delivery ignored", {
        sid: payload.MessageSid,
      });
      return;
    }

    try {
      await processMessageAsync(fromNumber, userMessage);
    } catch (err) {
      // Last-resort net: processMessageAsync handles its own errors, so
      // reaching here means something unexpected slipped through.
      logProcessingError("unexpected", err);
      await releaseMessage({ provider: "twilio", messageId: payload.MessageSid });
    }
  });

  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    { status: 200, headers: { "Content-Type": "text/xml" } },
  );
}

/**
 * Build the list of URLs to validate the Twilio signature against.
 *
 * Twilio signs the exact public URL it POSTs to, but behind Vercel's proxy
 * `request.url` can carry an internal host that won't match that signature
 * and 403s every inbound message. We reconstruct the public URL from the
 * forwarding headers and also include the configured TWILIO_WEBHOOK_URL, so
 * validation passes if either one matches.
 */
function buildCandidateUrls(request: Request): string[] {
  const urls = new Set<string>();
  const { pathname, search } = new URL(request.url);

  // The raw request URL as Next.js sees it.
  urls.add(request.url);

  // The public-facing URL reconstructed from proxy headers — this is what
  // Twilio actually signed.
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    urls.add(`${proto}://${host}${pathname}${search}`);
  }

  // The configured webhook URL — stable even if the live host changes.
  const configured = process.env.TWILIO_WEBHOOK_URL;
  if (configured) {
    urls.add(configured);
  }

  return [...urls];
}

const FALLBACK_MESSAGE =
  "⚠️ I'm having a bit of trouble on my end right now. Please try again in a moment — your funds are safe.";

/**
 * Run the agent and send the reply back through Twilio's REST API.
 *
 * Errors are handled per stage so an outage (e.g. the database being
 * unreachable) results in a friendly "try again" message instead of silent
 * failure — and so the user never sees a dead bot with no response. Twilio
 * is independent of the database, so the fallback can still be delivered
 * even when the data layer is down.
 *
 * If the handler flags a wallet-provisioning side effect, fire it after the
 * primary reply is sent and follow up with a separate message containing
 * the address (or a failure note) once it resolves.
 */
async function processMessageAsync(fromNumber: string, userMessage: string) {
  let lookup: Awaited<ReturnType<typeof findOrCreateUser>>;
  try {
    lookup = await findOrCreateUser({ whatsappNumber: fromNumber });
  } catch (err) {
    logProcessingError("findOrCreateUser", err);
    await sendFallbackMessage(fromNumber);
    return;
  }

  let result: Awaited<ReturnType<typeof handleIncomingMessage>>;
  try {
    result = await handleIncomingMessage({
      user: lookup.user,
      text: userMessage,
      isNew: lookup.isNew,
    });
  } catch (err) {
    logProcessingError("handleIncomingMessage", err);
    await sendFallbackMessage(fromNumber);
    return;
  }

  const { reply, interactive, confirm, followUp, sideEffect } = result;

  try {
    if (confirm) {
      await sendWhatsAppConfirm({
        to: fromNumber,
        body: reply,
        token: confirm.token,
      });
    } else if (interactive === "buttons") {
      await sendWhatsAppButtons({ to: fromNumber, body: reply });
    } else if (interactive === "list") {
      await sendWhatsAppList({ to: fromNumber, body: reply });
    } else {
      await sendWhatsAppMessage({ to: fromNumber, body: reply });
    }

    // Sent as its own plain message — nothing else in the bubble — so a
    // long-press → Copy on WhatsApp grabs exactly this and nothing mixed
    // in from the reply above (e.g. a wallet address).
    if (followUp) {
      await sendWhatsAppMessage({ to: fromNumber, body: followUp });
    }
  } catch (err) {
    // Twilio send failed — we can't reach the user at all, so just log.
    logProcessingError("sendReply", err);
    return;
  }

  // Post-reply side effects are best-effort: the user already has their
  // reply, so a failure here is logged but not surfaced again.
  if (sideEffect?.kind === "provision_wallet") {
    try {
      await handleProvisionSideEffect(fromNumber, sideEffect.userId);
    } catch (err) {
      logProcessingError("provisionWallet", err);
    }
  }
}

/**
 * Provision the user's wallet, then follow up with the address (or a retry
 * note). We send the primary reply first so the user sees acknowledgement
 * immediately, then deliver the address as a separate message.
 */
async function handleProvisionSideEffect(fromNumber: string, userId: string) {
  const success = await provisionWalletForUser(userId);

  if (!success) {
    await sendWhatsAppMessage({
      to: fromNumber,
      body: "I couldn't set up your wallet just now — I'll retry automatically. You can keep using tella in the meantime.",
    });
    return;
  }

  // Re-fetch the user so we have the freshly-saved wallet_address.
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("tella_users")
    .select("wallet_address")
    .eq("id", userId)
    .single();

  const address = (data as { wallet_address: string } | null)?.wallet_address;
  if (address) {
    // First message a new user gets after onboarding — surface the quick-reply
    // menu so they have a one-tap next step instead of a dead end.
    await sendWhatsAppButtons({
      to: fromNumber,
      body: [
        "✅ Your wallet is ready!",
        "",
        `Address: \`${address}\``,
        "",
        "Send USDC to this address on Arc to fund your account, then tap below to get started.",
      ].join("\n"),
    });
  }
}

/** Best-effort "something's wrong" reply. Independent of the data layer. */
async function sendFallbackMessage(to: string) {
  try {
    await sendWhatsAppMessage({ to, body: FALLBACK_MESSAGE });
  } catch (err) {
    // Twilio itself is unreachable — nothing left to do but log.
    logProcessingError("sendFallback", err);
  }
}

/**
 * Log a processing error with the underlying cause unwrapped. A bare
 * "fetch failed" hides the real reason (DNS, connection refused, timeout);
 * the `cause` chain surfaces it so outages are diagnosable from logs.
 */
function logProcessingError(stage: string, err: unknown) {
  const e = err as { message?: string; cause?: unknown; stack?: string };
  const cause = e?.cause;
  const causeMessage =
    cause instanceof Error ? cause.message : cause ? String(cause) : undefined;

  console.error("[whatsapp] processing error", {
    stage,
    message: e?.message ?? String(err),
    cause: causeMessage,
    stack: e?.stack,
  });
}