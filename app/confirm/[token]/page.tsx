import { loadConfirmContext } from "@/lib/confirm/context";
import { userHasCredential } from "@/lib/webauthn/repository";
import type { WhatsAppChannel } from "@/lib/supabase/types";
import { ConfirmClient } from "./confirm-client";
import { ConfirmShell } from "./confirm-shell";
import { ExpiredCard } from "./expired-card";

export const dynamic = "force-dynamic";

// Deliberately generic — no amount/recipient here, since this metadata is
// static (not derived from the token) and link-preview crawlers shouldn't
// see anything about the pending send before the user opens it themselves.
const title = "Confirm send · tella";
const description = "Authorize your tella transfer with Face ID, your fingerprint, or your PIN.";

export const metadata = {
  title,
  description,
  // Don't leak the token to third parties via Referer.
  other: { referrer: "no-referrer" },
  openGraph: {
    title,
    description,
    type: "website" as const,
    siteName: "tella",
  },
  twitter: {
    card: "summary" as const,
    title,
    description,
  },
};

export default async function ConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await loadConfirmContext(token);

  if (!ctx) {
    return (
      <ConfirmShell>
        <ExpiredCard />
      </ConfirmShell>
    );
  }

  const hasPin = Boolean(ctx.user.pin_hash);
  const hasPasskey = await userHasCredential(ctx.user.id);

  return (
    <ConfirmShell>
      <ConfirmClient
        token={token}
        summary={{
          amount: ctx.pending.payload.amount,
          token: "USDC",
          recipientLabel:
            ctx.pending.payload.recipientName ??
            formatAddress(ctx.pending.payload.recipientAddress),
        }}
        hasPin={hasPin}
        hasPasskey={hasPasskey}
        returnUrl={whatsappReturnUrl(ctx.user.whatsapp_channel)}
      />
    </ConfirmShell>
  );
}

/**
 * Deep link back to the bot's WhatsApp chat, used to auto-return the user
 * after a successful confirm. Points at whichever number the user actually
 * messages tella on — Meta's Cloud API number for `meta` users, the Twilio
 * sender for `twilio` users — so the "back to chat" link doesn't dead-end
 * on a different provider's number. Falls back to a bare wa.me which still
 * reopens WhatsApp.
 */
function whatsappReturnUrl(channel: WhatsAppChannel): string {
  const raw =
    channel === "meta"
      ? (process.env.META_WHATSAPP_DISPLAY_NUMBER ?? "+2349043580863")
      : (process.env.TWILIO_WHATSAPP_FROM ?? "");
  const digits = raw.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "https://wa.me/";
}

function formatAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}