import { Reveal } from "@/components/interactive/reveal";

/**
 * Security pillars data — kept inline here since it's only used in this
 * file. Each pillar pairs a short headline with a paragraph and a small
 * geometric illustration component.
 */
const PILLARS = [
  {
    id: "encryption",
    title: "End-to-end encrypted",
    body:
      "Every message between you and UPay rides WhatsApp's encrypted channel. Nobody in the middle — not us, not your carrier — can read what you send.",
    illustration: <EncryptionGlyph />,
  },
  {
    id: "confirmation",
    title: "Confirmation on every send",
    body:
      "No payment moves without an explicit yes. Misheard, mistyped, or accidental sends never become real transactions.",
    illustration: <ConfirmationGlyph />,
  },
  {
    id: "custody",
    title: "Institutional custody",
    body:
      "Wallet keys are managed by Circle — the issuer of USDC. The same infrastructure trusted by banks and exchanges secures your account.",
    illustration: <CustodyGlyph />,
  },
];

/**
 * SecuritySection
 *
 * Three-pillar grid with a centered editorial heading. Background switches
 * to ink-900 for this one section so it acts as a visual stopper between
 * the lighter feature sections — a Mercury-style trick where one section
 * inverts to draw weight to a serious topic.
 */
export function SecuritySection() {
  return (
    <section
      id="security"
      className="relative overflow-hidden bg-ink-900 py-32 text-surface-50 lg:py-40"
    >
      {/* Subtle grid overlay so the dark slab has texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-3 text-xs font-mono text-surface-50/40">
              <span className="h-px w-8 bg-surface-50/30" />
              <span className="uppercase tracking-[0.2em]">Security</span>
              <span className="h-px w-8 bg-surface-50/30" />
            </div>
            <h2 className="mt-8 text-[clamp(2.25rem,5vw,4.5rem)] font-normal leading-[1.02] tracking-[-0.03em]">
              Built on rails you{" "}
              <span className="italic text-accent-300">already trust.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-surface-50/60">
              Two billion people use WhatsApp every day. UPay layers payment
              logic on top — without changing what makes that channel feel
              safe.
            </p>
          </div>
        </Reveal>

        <div className="mt-20 grid gap-8 md:grid-cols-3">
          {PILLARS.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.1}>
              <article className="flex h-full flex-col gap-6 rounded-3xl border border-surface-50/10 bg-surface-50/[0.02] p-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-50/[0.04] text-accent-300">
                  {p.illustration}
                </div>
                <div>
                  <h3 className="font-sans text-xl font-medium tracking-tight text-surface-50">
                    {p.title}
                  </h3>
                  <p className="mt-3 leading-relaxed text-surface-50/60">
                    {p.body}
                  </p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Small geometric glyphs — used only inside this section. */

function EncryptionGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
      <path
        d="M10 14V10a6 6 0 1 1 12 0v4M7 14h18v12H7V14Z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="20" r="1.5" fill="currentColor" />
    </svg>
  );
}

function ConfirmationGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
      <path
        d="m8 17 5 5 11-12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function CustodyGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
      <path
        d="M16 4 5 8v8c0 6 4 10 11 12 7-2 11-6 11-12V8L16 4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}
