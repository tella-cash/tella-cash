import { loadConfirmContext } from "@/lib/confirm/context";
import { userHasCredential } from "@/lib/webauthn/repository";
import { ConfirmClient } from "./confirm-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Confirm send · tella",
  // Don't leak the token to third parties via Referer.
  other: { referrer: "no-referrer" },
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
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-16 text-center">
        <h1 className="font-display text-3xl text-ink-900">Link expired</h1>
        <p className="mt-3 text-ink-500">
          This confirmation link is no longer valid. Head back to WhatsApp and
          try the send again.
        </p>
      </main>
    );
  }

  const hasPin = Boolean(ctx.user.pin_hash);
  const hasPasskey = await userHasCredential(ctx.user.id);

  return (
    <ConfirmClient
      token={token}
      summary={{
        amount: ctx.pending.payload.amount,
        token: ctx.pending.payload.token,
        recipientLabel:
          ctx.pending.payload.recipientName ??
          formatAddress(ctx.pending.payload.recipientAddress),
      }}
      hasPin={hasPin}
      hasPasskey={hasPasskey}
      returnUrl={whatsappReturnUrl()}
    />
  );
}

/**
 * Deep link back to the bot's WhatsApp chat, used to auto-return the user
 * after a successful confirm. Derived from the Twilio sender number; falls
 * back to a bare wa.me which still reopens WhatsApp.
 */
function whatsappReturnUrl(): string {
  const digits = (process.env.TWILIO_WHATSAPP_FROM ?? "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "https://wa.me/";
}

function formatAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}