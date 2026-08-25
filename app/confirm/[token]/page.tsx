import { loadConfirmContext } from "@/lib/confirm/context";
import { userHasCredential } from "@/lib/webauthn/repository";
import { returnTarget } from "@/lib/messaging/return-link";
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
  // A confirm URL is a bearer token. Indexed, it becomes a searchable list
  // of live authorizations — and crawlers reach these links because they
  // travel through chat clients that prefetch them.
  robots: { index: false, follow: false, nocache: true },
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
        returnTo={returnTarget(ctx.user, ctx.pending.payload.origin)}
      />
    </ConfirmShell>
  );
}

function formatAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}