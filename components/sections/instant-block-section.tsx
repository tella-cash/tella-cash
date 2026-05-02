import { CtaButton } from "@/components/ui/cta-button";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { Spark } from "@/components/ui/spark";

/**
 * InstantBlockSection
 *
 * Closing "lost your phone? freeze it now" CTA. This sits on a deep-green
 * slab so it acts as a visual stopper before the footer. Two CTAs:
 *
 *   - Block account (primary, accent-yellow filled to draw urgency)
 *   - Unblock account (ghost / outline)
 *
 * The corner spark + concentric arcs in the background give it the same
 * "watchtower / ring" feel used in the security illustration upstream, so
 * the reassurance theme reads visually consistent.
 */
export function InstantBlockSection() {
  return (
    <section className="relative overflow-hidden bg-upay-900 text-cream-50">
      {/* Concentric rings backdrop */}
      <svg
        viewBox="0 0 600 600"
        aria-hidden="true"
        className="pointer-events-none absolute -right-48 top-1/2 h-[600px] w-[600px] -translate-y-1/2 opacity-15"
      >
        {[100, 160, 220, 280, 340].map((r) => (
          <circle
            key={r}
            cx="300"
            cy="300"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="text-cream-50"
          />
        ))}
      </svg>

      <div className="relative mx-auto max-w-7xl px-6 py-24 lg:py-32">
        <div className="max-w-3xl">
          <SectionEyebrow className="text-accent-300">
            Instant Block
          </SectionEyebrow>
          <h2 className="mt-4 font-display text-4xl font-medium leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Lost your phone?
            <br />
            <span className="inline-flex items-center gap-3">
              Freeze UPAY in seconds.
              <Spark className="h-7 w-7" tone="accent" />
            </span>
          </h2>
          <p className="mt-6 max-w-xl text-lg text-cream-50/75">
            If your device goes missing, sign in from any other WhatsApp and
            freeze all offramp activity immediately. We'll guide you through
            secure recovery from there.
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <CtaButton
              href="/auth/block-account"
              className="bg-accent-400 text-ink-900 hover:bg-accent-300"
            >
              Block account now
            </CtaButton>
            <CtaButton
              href="/auth/unblock-account"
              variant="ghost"
              className="text-cream-50 ring-cream-50/30 hover:bg-cream-50/10"
            >
              Unblock account
            </CtaButton>
          </div>
        </div>
      </div>
    </section>
  );
}
