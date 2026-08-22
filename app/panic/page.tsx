import { ConfirmShell } from "@/app/confirm/[token]/confirm-shell";
import { PanicClient } from "./panic-client";

export const dynamic = "force-dynamic";

// Indexable, unlike the confirm and security pages, and that is deliberate.
// Those are per-account token links that should never be crawled. This one is
// a fixed public address that has to be findable by someone searching
// "tella freeze account" on a borrowed phone, possibly having never seen the
// URL before. It reveals nothing: without a phone number and a panic code it
// does nothing at all.
const title = "Freeze your tella account";
const description =
  "Lost your phone or think someone else has access? Freeze your tella wallet so nothing can leave it.";

export const metadata = {
  title,
  description,
  other: { referrer: "no-referrer" },
  openGraph: {
    title,
    description,
    type: "website" as const,
    siteName: "tella",
  },
  twitter: { card: "summary" as const, title, description },
};

export default function PanicPage() {
  return (
    <ConfirmShell>
      <PanicClient />
    </ConfirmShell>
  );
}
