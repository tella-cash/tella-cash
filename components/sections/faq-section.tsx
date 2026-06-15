"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Reveal } from "@/components/interactive/reveal";
import { MaskReveal } from "@/components/interactive/mask-reveal";
import { EASE } from "@/lib/animation/variants";
import { FAQS } from "@/lib/data/faqs";
import type { FaqItem } from "@/lib/data/faqs";

export function FaqSection() {
  // Track the open row by id — accordion behaviour, one open at a time.
  const [openId, setOpenId] = useState<string>(FAQS[0]?.id ?? "");

  return (
    <section id="faqs" className="bg-surface-50 py-16 lg:py-28">
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <Reveal>
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
              FAQ
            </span>
          </Reveal>
          <MaskReveal
            as="h2"
            text="Questions, answered."
            accent="answered."
            className="mt-5 justify-center text-[32px] md:text-[52px] lg:text-[60px] font-medium leading-[1.04] tracking-[-0.02em] text-ink-900"
          />
        </div>

        <div className="mt-10 md:mt-14">
          {FAQS.map((faq, idx) => (
            <Reveal key={faq.id} delay={idx * 0.05}>
              <FaqRow
                faq={faq}
                open={openId === faq.id}
                onToggle={() =>
                  setOpenId((current) => (current === faq.id ? "" : faq.id))
                }
              />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqRow({
  faq,
  open,
  onToggle,
}: {
  faq: FaqItem;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-ink-200/70">
      <button
        type="button"
        data-cursor="grow"
        aria-expanded={open}
        aria-controls={`faq-panel-${faq.id}`}
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center justify-between gap-6 py-6 text-left"
      >
        <h3 className="font-sans text-xl font-medium tracking-tight text-ink-900 sm:text-2xl">
          {faq.question}
        </h3>
        <span
          aria-hidden="true"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-ink-700 transition-[transform,background-color,border-color,color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            open
              ? "rotate-45 border-accent-500 bg-accent-500 text-white"
              : "border-ink-200"
          }`}
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4">
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`faq-panel-${faq.id}`}
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="overflow-hidden"
          >
            <p className="max-w-2xl pb-7 pr-12 text-base leading-relaxed text-ink-500 md:text-lg">
              {faq.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
