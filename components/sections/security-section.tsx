import { SECURITY_CARDS } from "@/lib/data/security";
import {
  PasscodeIllustration,
  CertifiedIllustration,
  BiometricIllustration,
} from "@/components/illustrations/security-illustrations";

/**
 * Lookup table mapping a security card's `illustration` enum value to the
 * matching component. Centralizing this keeps the data file (`security.ts`)
 * pure data — no JSX imports — while still allowing per-card visuals.
 */
const ILLUSTRATIONS = {
  passcode: PasscodeIllustration,
  certified: CertifiedIllustration,
  biometric: BiometricIllustration,
} as const;

/**
 * SecuritySection
 *
 * Three-up grid of security pillars under a centered heading. The heading
 * intentionally spans across two lines with a max-width to feel editorial
 * rather than wall-to-wall.
 */
export function SecuritySection() {
  return (
    <section id="security" className="relative bg-cream-100 py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-4xl font-medium leading-[1.1] tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
            Built on security you can verify.
          </h2>
          <p className="mt-6 text-lg text-ink-700">
            WhatsApp for the interface. ARC for the settlement layer. Both are
            independently battle-tested — and we've added our own protections
            on top.
          </p>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {SECURITY_CARDS.map((card) => {
            const Illustration = ILLUSTRATIONS[card.illustration];
            return (
              <article
                key={card.id}
                className="flex flex-col gap-5 rounded-3xl bg-cream-50 p-6 ring-1 ring-pago-900/5"
              >
                <Illustration />
                <div>
                  <h3 className="font-display text-xl font-medium text-ink-900">
                    {card.title}
                  </h3>
                  <p className="mt-2 text-ink-700">{card.body}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
