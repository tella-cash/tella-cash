import { Reveal } from "@/components/interactive/reveal";

interface UseCase {
  id: string;
  context: string;
  scenario: string;
  amount: string;
}

const USE_CASES: UseCase[] = [
  {
    id: "freelance",
    context: "For freelancers",
    scenario: "Invoice a client overseas and get paid in seconds, not weeks. No wires, no FX surprises.",
    amount: "$1,200",
  },
  {
    id: "split",
    context: "For nights out",
    scenario: "Settle the dinner bill before you leave the table. Everyone sends their share to the host.",
    amount: "$32",
  },
  {
    id: "remit",
    context: "For families",
    scenario: "Send money to a sibling abroad without a 4-day wait or a 7% margin lost to spreads.",
    amount: "$300",
  },
  {
    id: "small-biz",
    context: "For small businesses",
    scenario: "Pay vendors, contractors, and suppliers from your phone. Receipts logged, balances clear.",
    amount: "$450",
  },
];

export function UseCasesSection() {
  return (
    <section id="use-cases" className="relative py-10">
      <div className="mx-auto max-w-[1200px] px-6">
        <Reveal>
          <div className="flex flex-col items-center justify-between gap-2">
            <h2 className="text-[36px] font-normal leading-[1.02] tracking-[-0.03em] text-ink-900">
              Move money directly from chat
            </h2>
            <p className="max-w-sm text-ink-500">
              How Tellecash becomes part of everyday life
            </p>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {USE_CASES.map((c, i) => (
            <Reveal key={c.id} delay={i * 0.08}>
              <article className="group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-ink-200/60 bg-surface-0 p-8 transition-all duration-500 hover:border-ink-900 hover:shadow-card">
                <div>
                  <p className="text-xs font-mono uppercase tracking-[0.18em] text-ink-400">
                    {c.context}
                  </p>
                  <p className="mt-6 text-lg leading-relaxed text-ink-700">
                    {c.scenario}
                  </p>
                </div>
                <div className="mt-12 flex items-baseline gap-2">
                  <span className="font-display text-4xl text-ink-900">
                    {c.amount}
                  </span>
                  <span className="text-xs uppercase tracking-wider text-accent-500">
                    sent
                  </span>
                </div>
                {/* Hover accent — a subtle ink line that draws across on hover */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-8 bottom-0 h-px origin-left scale-x-0 bg-accent-500 transition-transform duration-700 group-hover:scale-x-100"
                />
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
