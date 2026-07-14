import { NextResponse, after } from "next/server";
import crypto from "node:crypto";
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

  if (!verifyMetaSignature(rawBody, signature)) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
    console.warn("[meta] invalid signature (allowed in non-production)");
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
    for (const msg of messages) {
      try {
        await processIncoming(msg);
      } catch (err) {
        console.error("[meta] processing error", err);
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

async function processIncoming(msg: IncomingMessage) {
  // Existing users are stored with Twilio-style `whatsapp:+E164`. Normalize
  // here so the same user row matches whether they came in via Twilio or Meta.
  const normalizedNumber = `whatsapp:+${msg.fromE164}`;

  console.log("[meta] incoming", {
    id: msg.messageId,
    from: normalizedNumber,
    profile: msg.profileName,
    preview: msg.text.slice(0, 80),
  });

  const { user, isNew } = await findOrCreateUser({
    whatsappNumber: normalizedNumber,
  });

  const { reply, interactive, confirm, sideEffect } = await handleIncomingMessage({
    user,
    text: msg.text,
    isNew,
  });

  if (confirm) {
    await sendWhatsAppConfirm({ to: normalizedNumber, body: reply, token: confirm.token });
  } else if (interactive === "buttons") {
    await sendWhatsAppButtons({ to: normalizedNumber, body: reply });
  } else if (interactive === "list") {
    await sendWhatsAppList({ to: normalizedNumber, body: reply });
  } else {
    await sendWhatsAppMessage({ to: normalizedNumber, body: reply });
  }

  if (sideEffect?.kind === "provision_wallet") {
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
  }
}
