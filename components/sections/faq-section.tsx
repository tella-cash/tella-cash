import { Reveal } from "@/components/interactive/reveal";
import { FAQS } from "@/lib/data/faqs";
import type { FaqItem } from "@/lib/data/faqs";

export function FaqSection() {
  return (
    <section id="faqs" className="bg-surface-50 py-12 lg:py-20">
      <div className="mx-auto max-w-3xl px-6">
        <Reveal>
          <div className="text-center">
            <span className="uppercase text-[24px] text-ink-900">FAQS?</span>
          </div>
        </Reveal>

        <div className="mt-2">
          {FAQS.map((faq, idx) => (
            <Reveal key={faq.id} delay={idx * 0.05}>
              <FaqRow faq={faq} defaultOpen={idx === 0} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqRow({
  faq,
  defaultOpen = false,
}: {
  faq: FaqItem;
  defaultOpen?: boolean;
}) {
  return (
    <details
      id={`faq-${faq.id}`}
      open={defaultOpen}
      className="group border-b border-ink-200/70 py-6 [&[open]_.faq-chevron]:rotate-45"
    >
      <summary
        data-cursor="grow"
        className="flex cursor-pointer list-none items-center justify-between gap-6 text-left"
      >
        <h3 className="font-sans text-lg font-medium tracking-tight text-ink-900 sm:text-xl">
          {faq.question}
        </h3>
        <span
          aria-hidden="true"
          className="faq-chevron flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink-200 text-ink-700 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </summary>
      <p className="mt-4 max-w-2xl pr-12 leading-relaxed text-ink-500">
        {faq.answer}
      </p>
    </details>
  );
}
