import { Reveal } from "@/components/interactive/reveal";

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
      "Wallet keys are managed by Circle - the issuer of USDC. The same infrastructure trusted by banks and exchanges secures your account.",
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
        <Reveal>
          <div className="mx-auto max-w-[600px] text-center">
            <div className="text-xs font-mono text-surface-50/40">
              <span className="uppercase tracking-[0.2em]">Security</span>
            </div>
            <h2 className="mt-8 text-[24px] lg:text-[72px] text-center font-normal leading-[1.02] tracking-[-0.03em]">
              Built on rails you{" "}
              <span className="text-[#0057FF]">already trust.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-[14px] lg:text-lg leading-relaxed text-surface-50/60">
              Two billion people use WhatsApp every day. tella layers payment
              logic on top - without changing what makes that channel feel
              safe.
            </p>
          </div>
        </Reveal>

        <div className="mt-20 grid gap-8 md:grid-cols-3">
          {PILLARS.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.2}>
              <article className="flex h-full flex-col gap-6 rounded-3xl border border-surface-50/10 bg-surface-50/[0.02] p-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-50/[0.04] text-[#0057FF]">
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
