import { cn } from "@/lib/utils/cn";

interface BrandMarkProps {
  variant?: "dark" | "light";
  className?: string;
}

/**
 * BrandMark
 *
 * Wordmark + glyph lockup for UPay. Glyph is a small geometric "U" cut
 * from a rounded square, sized to match cap-height of the wordmark beside
 * it. The serif wordmark gives the brand more editorial weight than a
 * sans alone — a small detail that signals "premium" without trying.
 */
export function BrandMark({ variant = "dark", className }: BrandMarkProps) {
  const text = variant === "dark" ? "text-ink-900" : "text-surface-50";
  const glyphFill = variant === "dark" ? "fill-ink-900" : "fill-surface-50";
  const glyphCutout = variant === "dark" ? "fill-surface-50" : "fill-ink-900";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg viewBox="0 0 28 28" aria-hidden="true" className="h-6 w-6 shrink-0">
        <rect x="2" y="2" width="24" height="24" rx="6" className={glyphFill} />
        <path
          d="M9 9v8a5 5 0 0 0 10 0V9h-3v8a2 2 0 0 1-4 0V9H9Z"
          className={glyphCutout}
        />
      </svg>
      <span
        className={cn(
          "font-display text-2xl leading-none tracking-tight",
          text,
        )}
      >
        UPay
      </span>
    </div>
  );
}
