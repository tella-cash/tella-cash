import { NextResponse, after } from "next/server";
import crypto from "node:crypto";
import { claimMessage, releaseMessage } from "@/lib/messaging/processed-messages";
import {
  sendWhatsAppMessage,
  sendWhatsAppButtons,
  sendWhatsAppList,
  sendWhatsAppConfirm,
} from "@/lib/meta/client";
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


/**
 * Meta WhatsApp Cloud API webhook.
 *
 * GET  — handshake. Meta sends `hub.mode`, `hub.verify_token`, `hub.challenge`.
 *        We echo back the challenge if the token matches.
 * POST — message events. Verified via X-Hub-Signature-256 (HMAC-SHA256 over
 *        the raw request body with the app secret).
 *
 * This runs in parallel to the Twilio webhook at /api/whatsapp during the
 * migration. Downstream agent + side-effect handling is shared.
 */

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = process.env.META_WHATSAPP_VERIFY_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "Server is missing META_WHATSAPP_VERIFY_TOKEN" },
      { status: 500 },
    );
  }

  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256") ?? "";

  // Enforced everywhere — see lib/whatsapp/signature-policy for why this is
  // no longer conditional on NODE_ENV.
  if (!verifyMetaSignature(rawBody, signature)) {
    if (!allowUnsignedWebhooks()) {
      console.warn("[meta] signature validation failed", {
        hasSignature: Boolean(signature),
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
    console.warn("[meta] invalid signature (allowed by WHATSAPP_ALLOW_UNSIGNED)");
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Meta sends many event types (status updates, deliveries, etc.).
  // We only act on inbound text messages here; status events are 200'd silently.
  const messages = extractTextMessages(payload);

  if (messages.length === 0) {
    return new NextResponse(null, { status: 200 });
  }

  after(async () => {
    // Claimed per message, not per request: one delivery can carry several,
    // and a redelivery can carry a different subset of the same ones.
    for (const msg of messages) {
      const claimed = await claimMessage({
        provider: "meta",
        messageId: msg.messageId,
      });
      if (!claimed) {
        console.log("[meta] duplicate delivery ignored", { id: msg.messageId });
        continue;
      }

      try {
        await processIncoming(msg);
      } catch (err) {
        console.error("[meta] processing error", err);
        await releaseMessage({ provider: "meta", messageId: msg.messageId });
      }
    }
  });

  return new NextResponse(null, { status: 200 });
}

function verifyMetaSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.META_WHATSAPP_APP_SECRET;
  if (!secret || !signature.startsWith("sha256=")) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const received = signature.slice("sha256=".length);

  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(received, "hex");
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

interface IncomingMessage {
  fromE164: string;
  text: string;
  messageId: string;
  profileName?: string;
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
          interactive?: {
            type?: string;
            button_reply?: { id?: string; title?: string };
            list_reply?: { id?: string; title?: string };
          };
        }>;
      };
    }>;
  }>;
}

function extractTextMessages(payload: MetaWebhookPayload): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const profile = value?.contacts?.[0]?.profile?.name;
      for (const m of value?.messages ?? []) {
        if (!m.from || !m.id) continue;

        if (m.type === "text" && m.text?.body) {
          out.push({
            fromE164: m.from,
            text: m.text.body,
            messageId: m.id,
            profileName: profile,
          });
          continue;
        }

        // Tapped quick-reply button or list row — route its title through
        // the same classifier as typed text (mirrors Twilio's ButtonText).
        if (m.type === "interactive") {
          const title =
            m.interactive?.button_reply?.title ??
            m.interactive?.list_reply?.title;
          if (title) {
            out.push({
              fromE164: m.from,
              text: title,
              messageId: m.id,
              profileName: profile,
            });
          }
        }
      }
    }
  }
  return out;
}

const FALLBACK_MESSAGE =
  "⚠️ I'm having a bit of trouble on my end right now. Please try again in a moment — your funds are safe.";

async function processIncoming(msg: IncomingMessage) {
  // Existing users are stored with Twilio-style `whatsapp:+E164`. Normalize
  // here so the same user row matches whether they came in via Twilio or Meta.
  const normalizedNumber = `whatsapp:+${msg.fromE164}`;

  // Same redaction as the Twilio route: the message ID is enough to find
  // this message in Meta's console, and the phone number, profile name and
  // message text are not things that belong in stdout.
  console.log("[meta] incoming", {
    id: msg.messageId,
    from: redactNumber(normalizedNumber),
    chars: msg.text.length,
  });

  // Unlike the Twilio webhook (app/api/whatsapp/route.ts), this handler had
  // no fallback-message path: an exception anywhere below used to be
  // swallowed by the caller's bare `console.error` with nothing sent back
  // to the user — total silence from their side. Mirror Twilio's pattern:
  // any failure up through getting a reply back sends a "something's
  // wrong" message instead of nothing.
  let result: Awaited<ReturnType<typeof handleIncomingMessage>>;
  try {
    const { user, isNew } = await findOrCreateUser({
      whatsappNumber: normalizedNumber,
      channel: "meta",
    });

    result = await handleIncomingMessage({ user, text: msg.text, isNew });
  } catch (err) {
    console.error("[meta] processing error", err);
    try {
      await sendWhatsAppMessage({ to: normalizedNumber, body: FALLBACK_MESSAGE });
    } catch (sendErr) {
      console.error("[meta] fallback send failed", sendErr);
    }
    return;
  }

  const { reply, interactive, confirm, followUp, sideEffect } = result;

  try {
    if (confirm) {
      await sendWhatsAppConfirm({ to: normalizedNumber, body: reply, token: confirm.token });
    } else if (interactive === "buttons") {
      await sendWhatsAppButtons({ to: normalizedNumber, body: reply });
    } else if (interactive === "list") {
      await sendWhatsAppList({ to: normalizedNumber, body: reply });
    } else {
      await sendWhatsAppMessage({ to: normalizedNumber, body: reply });
    }

    // Sent as its own plain message — nothing else in the bubble — so a
    // long-press → Copy on WhatsApp grabs exactly this and nothing mixed in
    // from the reply above (e.g. a wallet address).
    if (followUp) {
      await sendWhatsAppMessage({ to: normalizedNumber, body: followUp });
    }
  } catch (err) {
    // Meta itself is unreachable — nothing left to do but log.
    console.error("[meta] send reply failed", err);
    return;
  }

  // Post-reply side effects are best-effort: the user already has their
  // reply, so a failure here is logged but not surfaced again.
  if (sideEffect?.kind === "provision_wallet") {
    try {
      const success = await provisionWalletForUser(sideEffect.userId);

      if (success) {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase
          .from("tella_users")
          .select("wallet_address")
          .eq("id", sideEffect.userId)
          .single();

        const address = (data as { wallet_address: string } | null)
          ?.wallet_address;
        if (address) {
          await sendWhatsAppButtons({
            to: normalizedNumber,
            body: [
              "✅ Your wallet is ready!",
              "",
              `Address: \`${address}\``,
              "",
              "Send USDC to this address on Arc to fund your account, then tap below to get started.",
            ].join("\n"),
          });
        }
      } else {
        await sendWhatsAppMessage({
          to: normalizedNumber,
          body: "I couldn't set up your wallet just now — I'll retry automatically. You can keep using tella in the meantime.",
        });
      }
    } catch (err) {
      console.error("[meta] provisionWallet failed", err);
    }
  }
}
