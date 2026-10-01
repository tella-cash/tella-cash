import { loadLinkContext } from "@/lib/security/reset-tokens";
import { listFactors } from "@/lib/auth/factors";
import { ConfirmShell } from "@/app/confirm/[token]/confirm-shell";
import { InvalidLinkCard } from "@/app/security/[token]/invalid-link-card";
import { LinkClient } from "./link-client";

export const dynamic = "force-dynamic";

const title = "Confirm it's you · tella";

export const metadata = {
  title,
  description: "Confirm it's you before connecting another account to your tella wallet.",
  other: { referrer: "no-referrer" },
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The factor step in front of linking a Telegram or Google account.
 *
 * Holding the chat that asked for the link used to be enough, which let
 * anyone with the phone for five minutes attach a channel that outlived their
 * access to it. The link token does nothing until the account's own PIN or
 * passkey is proven here (app/api/security/link/authorize).
 */
export default async function LinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await loadLinkContext(token);

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
      <LinkClient
        token={token}
        kind={
          ctx.token.kind === "link_google"
            ? "google"
            : ctx.token.kind === "link_whatsapp"
              ? "whatsapp"
              : "telegram"
        }
        hasPin={factors.pin}
        hasPasskey={factors.passkey}
      />
    </ConfirmShell>
  );
}
