import { Reveal } from "@/components/interactive/reveal";
import { MaskReveal } from "@/components/interactive/mask-reveal";

const PILLARS = [
  {
    id: "encryption",
    title: "End-to-end encrypted",
    body:
      "Every message between you and tella rides WhatsApp's encrypted channel. Nobody in the middle - not us, not your carrier - can read what you send.",
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
      "Wallet keys are managed by Circle - the issuer of USDC. The same infrastructure trusted by banks and global fintechs secures your account.",
    illustration: <CustodyGlyph />,
  },
];

export function SecuritySection() {
  return (
    <section
      id="security"
      className="relative overflow-hidden bg-ink-900 py-[40px] md:py-[60px] text-surface-50"
    >
      <div className="relative mx-auto max-w-7xl px-[10px] sm:px[72px]">
        <div className="mx-auto max-w-[820px] text-center">
          <Reveal>
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-surface-50/40">
              Security
            </div>
          </Reveal>
          <MaskReveal
            as="h2"
            text="Built on rails you already trust."
            accent="already trust."
            className="mt-8 justify-center text-[34px] md:text-[56px] lg:text-[76px] font-normal leading-[1.02] tracking-[-0.03em]"
          />
          <Reveal delay={0.15}>
            <p className="mx-auto mt-6 max-w-2xl text-base md:text-xl leading-relaxed text-surface-50/60">
              Two billion people use WhatsApp every day. tella layers payment
              logic on top — without changing what makes that channel feel safe.
            </p>
          </Reveal>
        </div>

        <div className="mt-16 grid gap-6 md:mt-24 md:grid-cols-3 md:gap-8">
          {PILLARS.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.15}>
              <article className="flex h-full flex-col gap-6 rounded-3xl border border-surface-50/10 bg-surface-50/[0.02] p-8 transition-colors duration-300 hover:border-surface-50/20 hover:bg-surface-50/[0.04] md:p-10">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-50/[0.04] text-[#0057FF]">
                  {p.illustration}
                </div>
                <div>
                  <h3 className="font-sans text-2xl font-medium tracking-tight text-surface-50">
                    {p.title}
                  </h3>
                  <p className="mt-3 text-base md:text-lg leading-relaxed text-surface-50/60">
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
