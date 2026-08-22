import Link from "next/link";
import { ConfirmShell } from "@/app/confirm/[token]/confirm-shell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "tella",
  other: { referrer: "no-referrer" },
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Where every Google round trip lands.
 *
 * One page for all outcomes rather than a redirect per case, because the
 * alternative is leaking what happened into the URL of a page someone may be
 * viewing on a borrowed device. The only thing in the query string is a short
 * result code and, for errors, a message we wrote ourselves.
 */
export default async function ResultPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; n?: string; m?: string }>;
}) {
  const { r, n, m } = await searchParams;
  const stopped = Number.parseInt(n ?? "0", 10) || 0;

  const content = describe(r, stopped, m);

  return (
    <ConfirmShell>
      <div className="overflow-hidden rounded-[28px] border border-ink-200/70 bg-surface-0 shadow-card">
        <div className="px-7 pt-8 pb-7">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{content.icon}</span>
            <h1 className="font-display text-2xl text-ink-900">{content.title}</h1>
          </div>

          <div className="mt-4 space-y-3">
            {content.body.map((line) => (
              <p key={line} className="text-sm leading-relaxed text-ink-500">
                {line}
              </p>
            ))}
          </div>

          {content.retry && (
            <Link
              href="/security/freeze"
              className="mt-6 block w-full rounded-2xl border border-ink-200 px-6 py-3.5 text-center text-sm font-medium text-ink-900 transition-colors hover:bg-surface-50"
            >
              Try again
            </Link>
          )}
        </div>
      </div>
    </ConfirmShell>
  );
}

function describe(result: string | undefined, stopped: number, message: string | undefined) {
  switch (result) {
    case "frozen":
      return {
        icon: "🔒",
        title: "Frozen",
        body: [
          "Nothing can leave your wallet. You can still receive money, and your balance is untouched.",
          ...(stopped > 0
            ? [
                stopped === 1
                  ? "One transfer that was waiting has been stopped."
                  : `${stopped} transfers that were waiting have been stopped.`,
              ]
            : []),
          "When you have your phone back, message tella on WhatsApp to lift the freeze.",
        ],
        retry: false,
      };
    case "unfrozen":
      return {
        icon: "✅",
        title: "Unfrozen",
        body: ["Your account is active again. You can send money as normal."],
        retry: false,
      };
    case "not-frozen":
      return {
        icon: "✅",
        title: "Already active",
        body: ["This account isn't frozen, so there was nothing to lift."],
        retry: false,
      };
    case "linked":
      return {
        icon: "🔗",
        title: "Connected",
        body: [
          "Your Google account is now connected to your tella wallet.",
          "If your phone is ever lost or stolen, you can freeze the wallet from here without it.",
        ],
        retry: false,
      };
    default:
      return {
        icon: "⚠️",
        title: "That didn't work",
        body: [message ?? "Something went wrong. Try again."],
        retry: true,
      };
  }
}
