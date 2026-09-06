import { NextResponse, after } from "next/server";
import twilio from "twilio";
import { handleInbound } from "@/lib/messaging/inbound";
import { allowUnsignedWebhooks, redactNumber } from "@/lib/whatsapp/signature-policy";

// The reply is composed inside after(), past the 200 the provider already
// has. Without an explicit ceiling that background work runs on the platform
// default and a slow call can be killed mid-flight, which is exactly how a
// turn goes missing with no reply and no error. The per-call timeouts in the
// decoder are sized to fit inside this.
export const maxDuration = 60;

/**
 * Twilio WhatsApp webhook.
 *
 * Everything past the signature check is lib/messaging/inbound.ts — claiming,
 * user resolution, the agent, rendering, side effects and the fallback
 * message are identical on every channel, and having three copies of them is
 * how the Telegram route ended up running a different handler entirely.
 */

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
  const search = new URLSearchParams(rawBody);
  const params = Object.fromEntries(search);

  // Object.fromEntries keeps the LAST value for a repeated key, so a body
  // carrying one would be validated against a different parameter set than
  // Twilio signed — the signature would not match and the message would 403
  // with nothing to explain it. twilio.validateRequest takes a flat object, so
  // it cannot represent repeats either; there is no fix, only the difference
  // between a silent drop and a diagnosable one.
  if (search.size !== Object.keys(params).length) {
    console.warn("[whatsapp] repeated form parameters — signature check may fail", {
      sid: search.get("MessageSid"),
    });
  }

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
  // A tapped button/row arrives as ButtonText; fall back to it when Body
  // is empty so menu taps route through the same classifier as typed text.
  const userMessage = payload.Body || payload.ButtonText || "";

  // No full phone number, no profile name, no message text. MessageSid is
  // enough to correlate a log line with a specific message in Twilio's
  // console when something actually needs investigating; the rest was
  // personal data sitting in stdout for every message ever sent.
  console.log("[whatsapp] incoming", {
    sid: payload.MessageSid,
    from: redactNumber(payload.From),
    chars: userMessage.length,
  });

  // Deferred until after the response is sent. On Vercel, after() keeps the
  // function alive past the response so async work isn't frozen mid-flight.
  after(async () => {
    try {
      await handleInbound({
        provider: "twilio",
        externalId: payload.From,
        text: userMessage,
        messageId: payload.MessageSid,
        profileName: payload.ProfileName,
      });
    } catch (err) {
      // handleInbound has already logged and released the claim. This is the
      // last-resort net so a throw cannot escape into the runtime.
      console.error("[whatsapp] inbound failed", err);
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
