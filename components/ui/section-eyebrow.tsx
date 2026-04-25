import { cn } from "@/lib/utils/cn";

interface SectionEyebrowProps {
  children: string;
  className?: string;
}

/**
 * SectionEyebrow
 *
 * The small uppercase label that sits above each feature section's heading
 * (e.g. "TRANSFER", "SPENDING ANALYSIS"). Letter-spaced and small to feel
 * editorial — pairs with the larger display heading below it.
 */
export function SectionEyebrow({ children, className }: SectionEyebrowProps) {
  return (
    <span
      className={cn(
        "inline-block text-xs font-semibold uppercase tracking-[0.22em] text-pago-700",
        className,
      )}
    >
      {children}
    </span>
  );
}
