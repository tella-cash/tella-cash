import { cn } from "@/lib/utils/cn";

interface SparkProps {
  className?: string;
  /** Color preset — most uses are tella-700 or accent-500. */
  tone?: "primary" | "accent" | "ink";
}

/**
 * Spark
 *
 * Four-pointed star/burst flourish used near section headings and inside
 * floating cards on the hero. Inspired by classic 90s product-launch
 * stickers — adds a little visual energy without being too on-the-nose.
 *
 * Pure decoration: rendered with `aria-hidden` so screen readers skip it.
 */
export function Spark({ className, tone = "primary" }: SparkProps) {
  const fill =
    tone === "primary"
      ? "fill-tella-700"
      : tone === "accent"
        ? "fill-accent-500"
        : "fill-ink-900";

  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("inline-block", className)}
    >
      <path
        d="M16 0c0 8 0 16 16 16-16 0-16 0-16 16 0-16 0-16-16-16 16 0 16 0 16-16Z"
        className={fill}
      />
    </svg>
  );
}
