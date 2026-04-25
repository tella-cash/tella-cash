import { FaqItem } from "@/components/ui/faq-item";
import { FAQS } from "@/lib/data/faqs";

/**
 * FaqSection
 *
 * Centered FAQ block. Uses native `<details>` accordions via FaqItem so the
 * page works with JS disabled and supports deep-linking by anchor.
 *
 * Layout: max-w-3xl single column. The first FAQ is open by default to give
 * users an immediate sense of what answers look like.
 */
export function FaqSection() {
  return (
    <section id="faqs" className="bg-cream-50 py-24 lg:py-32">
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <h2 className="font-display text-4xl font-medium leading-tight tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
            Questions, answered.
          </h2>
          <p className="mt-4 text-ink-700">
            Anything we missed? Send us a message — Pago itself can usually
            help.
          </p>
        </div>

        <div className="mt-12">
          {FAQS.map((faq, idx) => (
            <FaqItem key={faq.id} faq={faq} defaultOpen={idx === 0} />
          ))}
        </div>
      </div>
    </section>
  );
}
