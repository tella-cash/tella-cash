import { loadResetContext } from "@/lib/security/reset-tokens";
import { userHasCredential } from "@/lib/webauthn/repository";
import { returnTarget, asProvider } from "@/lib/messaging/return-link";
import { ConfirmShell } from "@/app/confirm/[token]/confirm-shell";
import { SecurityClient } from "./security-client";
import { InvalidLinkCard } from "./invalid-link-card";

export const dynamic = "force-dynamic";

// Same reasoning as the confirm page: generic, token-independent metadata so
// a link-preview crawler learns nothing about the account behind the link.
const title = "Reset your PIN · tella";
const description = "Set a new PIN for your tella wallet.";

export const metadata = {
  title,
  description,
  other: { referrer: "no-referrer" },
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title,
    description,
    type: "website" as const,
    siteName: "tella",
  },
  twitter: { card: "summary" as const, title, description },
};

export default async function SecurityPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await loadResetContext(token);

  if (!ctx) {
    return (
      <ConfirmShell>
        <InvalidLinkCard />
      </ConfirmShell>
    );
  }

  const hasPasskey = await userHasCredential(ctx.user.id);

  return (
    <ConfirmShell>
      <SecurityClient
        token={token}
        hasPasskey={hasPasskey}
        returnTo={returnTarget(ctx.user, asProvider(ctx.token.payload?.origin))}
      />
    </ConfirmShell>
  );
}


