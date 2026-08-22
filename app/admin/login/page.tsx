import { ConfirmShell } from "@/app/confirm/[token]/confirm-shell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "tella admin",
  robots: { index: false, follow: false, nocache: true },
  other: { referrer: "no-referrer" },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; m?: string }>;
}) {
  const { m } = await searchParams;

  return (
    <ConfirmShell>
      <div className="overflow-hidden rounded-[28px] border border-ink-200/70 bg-surface-0 shadow-card">
        <div className="px-7 pt-8 pb-7">
          <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink-400">
            Internal
          </div>
          <h1 className="mt-4 font-display text-3xl text-ink-900">Dashboard</h1>

          {m && (
            <p className="mt-4 text-sm text-red-600" role="alert">
              {m}
            </p>
          )}

          <a
            href="/api/auth/google/start?purpose=admin"
            className="mt-6 block w-full rounded-2xl bg-accent-500 px-6 py-4 text-center text-base font-medium text-white transition-all hover:bg-accent-600 active:scale-[0.98]"
          >
            Sign in with Google
          </a>

          <p className="mt-4 text-xs leading-relaxed text-ink-400">
            Access is by allowlist. Signing in with an account that isn&apos;t on
            it does nothing.
          </p>
        </div>
      </div>
    </ConfirmShell>
  );
}
