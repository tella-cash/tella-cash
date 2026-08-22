import { ConfirmShell } from "@/app/confirm/[token]/confirm-shell";

export const dynamic = "force-dynamic";

const title = "Freeze your tella account";
const description =
  "Lost your phone or think someone else has access? Sign in with Google to freeze your wallet.";

// Indexable, like /panic and unlike the token pages. Someone on a borrowed
// device needs to be able to find this by searching for it, and it reveals
// nothing: without a linked Google account it does nothing at all.
export const metadata = {
  title,
  description,
  other: { referrer: "no-referrer" },
  openGraph: { title, description, type: "website" as const, siteName: "tella" },
};

/**
 * The Google freeze door.
 *
 * Sibling to /panic, which does the same job with a phone number and a panic
 * code. Two doors because the failure modes differ: a panic code can be left
 * at home, and a Google account can be signed out of. Someone who has lost
 * their phone should not also have to have guessed right about which backup
 * they would need.
 */
export default function GoogleFreezePage() {
  return (
    <ConfirmShell>
      <div className="overflow-hidden rounded-[28px] border border-ink-200/70 bg-surface-0 shadow-card">
        <div className="px-7 pt-8 pb-2">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-ink-400">
            Emergency
          </div>
          <h1 className="mt-4 font-display text-3xl text-ink-900">
            Freeze your account
          </h1>
        </div>

        <div className="space-y-4 px-7 pb-7 pt-4">
          <p className="text-sm leading-relaxed text-ink-500">
            This stops anything leaving your wallet. You can still receive
            money, and nothing you already have is lost.
          </p>

          <a
            href="/api/auth/google/start?purpose=freeze"
            className="block w-full rounded-2xl bg-red-600 px-6 py-4 text-center text-base font-medium text-white transition-all hover:bg-red-700 active:scale-[0.98]"
          >
            Sign in with Google and freeze
          </a>

          <p className="text-xs leading-relaxed text-ink-400">
            You&apos;ll need the Google account you connected to tella. Don&apos;t
            have one connected? Use your panic code instead.
          </p>

          <a
            href="/panic"
            className="block w-full rounded-2xl px-6 py-3 text-center text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
          >
            I have a panic code
          </a>
        </div>
      </div>
    </ConfirmShell>
  );
}
