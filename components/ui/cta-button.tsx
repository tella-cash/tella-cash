import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

type CtaButtonProps = ComponentProps<"a"> & {
  /** Visual variant — `primary` is filled green, `ghost` is outlined. */
  variant?: "primary" | "ghost";
};

/**
 * CtaButton
 *
 * The "Try Pago" / "Try It Out" pill that recurs throughout the page.
 * Renders as an anchor (these always link to the WhatsApp deep link), so
 * we extend native `a` props directly instead of wrapping a Button shim.
 *
 * The trailing arrow is part of the component because every primary CTA
 * on this page uses the same affordance — keeping it here avoids drift.
 */
export function CtaButton({
  variant = "primary",
  className,
  children,
  ...props
}: CtaButtonProps) {
  const variantClass =
    variant === "primary"
      ? "bg-pago-800 text-cream-50 hover:bg-pago-900"
      : "bg-transparent text-pago-900 ring-1 ring-pago-900/15 hover:bg-pago-900/5";

  return (
    <a
      {...props}
      className={cn(
        "group inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition-colors",
        variantClass,
        className,
      )}
    >
      <span>{children}</span>
      <span
        aria-hidden="true"
        className="grid h-6 w-6 place-items-center rounded-full bg-cream-50/15 transition-transform group-hover:translate-x-0.5"
      >
        <svg viewBox="0 0 12 12" className="h-3 w-3">
          <path
            d="M2 6h8m0 0L6 2m4 4L6 10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </span>
    </a>
  );
}
