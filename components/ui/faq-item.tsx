import type { FaqItem as FaqItemData } from "@/lib/data/faqs";

interface FaqItemProps {
  faq: FaqItemData;
  /** Whether this item should be open by default — used for the first one. */
  defaultOpen?: boolean;
}

/**
 * FaqItem
 *
 * Single expandable FAQ entry. Uses the native `<details>` element rather
 * than custom state so that:
 *
 * 1. Items are accessible by default (keyboard, screen readers, search-in-page).
 * 2. The accordion works with JS disabled.
 * 3. Direct anchor links (#faq-security) work without rewiring state.
 *
 * The chevron is animated with a CSS transform driven by the `[open]` selector.
 */
export function FaqItem({ faq, defaultOpen = false }: FaqItemProps) {
  return (
    <details
      id={`faq-${faq.id}`}
      open={defaultOpen}
      className="group border-b border-pago-900/10 py-5 [&[open]_.faq-chevron]:rotate-45"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-left">
        <h3 className="font-display text-lg font-medium text-ink-900 sm:text-xl">
          {faq.question}
        </h3>
        <span
          aria-hidden="true"
          className="faq-chevron flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pago-50 text-pago-700 transition-transform duration-300"
        >
          {/* Plus icon — rotates 45deg into × when open */}
          <svg viewBox="0 0 16 16" className="h-4 w-4">
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </summary>
      <p className="mt-3 max-w-3xl pr-12 text-ink-700 leading-relaxed">
        {faq.answer}
      </p>
    </details>
  );
}
