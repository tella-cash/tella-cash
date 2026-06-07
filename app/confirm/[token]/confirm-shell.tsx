import { BrandMark } from "@/components/ui/brand-mark";

/**
 * The framing around the confirm card — warm surface, drifting accent
 * glows, brand lockup, and a trust line. Shared by the live confirm flow
 * and the expired-link state so both feel like part of the product, not a
 * bare utility page.
 */
export function ConfirmShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-surface-50 font-works">
      {/* Ambient accent glows. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="animate-drift-slow absolute -right-28 -top-32 h-80 w-80 rounded-full bg-accent-300/25 blur-3xl" />
        <div className="animate-drift-slow absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-accent-500/10 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink-200/70 to-transparent" />
      </div>

      <header className="relative z-10 flex justify-center pt-10">
        <BrandMark />
      </header>

      <div className="relative z-10 flex flex-1 items-center justify-center px-5 py-8">
        <div className="w-full max-w-md">{children}</div>
      </div>

      <footer className="relative z-10 flex items-center justify-center gap-2 pb-8 text-center">
        <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
        <p className="text-xs text-ink-400">
          Secured by tella · you approve every send
        </p>
      </footer>
    </main>
  );
}
