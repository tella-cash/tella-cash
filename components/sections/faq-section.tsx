import { Reveal } from "@/components/interactive/reveal";
import { FAQS } from "@/lib/data/faqs";
import type { FaqItem } from "@/lib/data/faqs";

/**
 * FaqSection
 *
 * Single-column FAQ block. Uses native <details> for accessibility and
 * deep-link support. The chevron rotates 45° to form a × when expanded —
 * a small detail that mirrors the design's preference for geometric
 * transformation over icon swaps.
 */
export function FaqSection() {
  return (
    <section id="faqs" className="bg-surface-50 py-32 lg:py-40">
      <div className="mx-auto max-w-3xl px-6">
        <Reveal>
          <div className="text-center">
            <div className="inline-flex items-center gap-3 text-xs font-mono text-ink-400">
              <span className="h-px w-8 bg-ink-300" />
              <span className="uppercase tracking-[0.2em]">FAQ</span>
              <span className="h-px w-8 bg-ink-300" />
            </div>
            <h2 className="mt-8 text-[clamp(2.25rem,5vw,4.5rem)] font-normal leading-[1.02] tracking-[-0.03em] text-ink-900">
              Questions, <span className="italic text-accent-500">answered.</span>
            </h2>
          </div>
        </Reveal>

        <div className="mt-16">
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
