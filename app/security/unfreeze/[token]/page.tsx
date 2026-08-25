import { loadResetContext } from "@/lib/security/reset-tokens";
import { listFactors } from "@/lib/auth/factors";
import { ConfirmShell } from "@/app/confirm/[token]/confirm-shell";
import { InvalidLinkCard } from "@/app/security/[token]/invalid-link-card";
import { UnfreezeClient } from "./unfreeze-client";
import { returnTarget, asProvider } from "@/lib/messaging/return-link";

export const dynamic = "force-dynamic";

const title = "Unfreeze your tella account";

export const metadata = {
  title,
  description: "Confirm it's you to lift the freeze on your wallet.",
  other: { referrer: "no-referrer" },
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The second half of unfreezing, and the half that does the work.
 *
 * Google got the user here, which established WHO they are. It did not
 * establish that they should get the account back — so this page demands a
 * factor as well. The reasoning is in
 * migrations/0018_google_identity.sql: once Google alone can unfreeze, a
 * compromised Google account is a compromised wallet, and Google's own
 * recovery is frequently phone-based, which is the very thing the freeze
 * exists to survive.
 *
 * Freeze is Google-only. Unfreeze is Google-plus-one. That asymmetry is the
 * design.
 */
export default async function UnfreezePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await loadResetContext(token, "unfreeze");

  if (!ctx) {
    return (
      <ConfirmShell>
        <InvalidLinkCard />
      </ConfirmShell>
    );
  }

  const factors = await listFactors(ctx.user);

  return (
    <ConfirmShell>
      <UnfreezeClient
        token={token}
        hasPin={factors.pin}
        hasPasskey={factors.passkey}
        returnTo={returnTarget(ctx.user, asProvider(ctx.token.payload?.origin))}
      />
    </ConfirmShell>
  );
}
