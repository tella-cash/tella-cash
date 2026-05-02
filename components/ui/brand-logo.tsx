import { cn } from "@/lib/utils/cn";

interface BrandLogoProps {
  /** Whether to render in dark-on-cream (default) or light variant for footer. */
  variant?: "dark" | "light";
  className?: string;
}

/**
 * BrandLogo
 *
 * A simple wordmark + chat-bubble glyph, intentionally generic so it can be
 * swapped for a real brand asset by replacing this single component.
 *
 * The glyph is a rounded square chat bubble with a stylized "P" cutout to
 * suggest both messaging and the brand initial.
 */
export function BrandLogo({ variant = "dark", className }: BrandLogoProps) {
  const wordmarkColor = variant === "dark" ? "text-upay-900" : "text-cream-50";
  const glyphFill = variant === "dark" ? "fill-upay-700" : "fill-cream-50";
  const glyphCutout = variant === "dark" ? "fill-cream-50" : "fill-upay-900";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 36 36"
        aria-hidden="true"
        className="h-8 w-8 shrink-0"
      >
        <path
          d="M6 14C6 8.477 10.477 4 16 4h4c5.523 0 10 4.477 10 10v6c0 5.523-4.477 10-10 10h-2.5L11 34v-5.2A10 10 0 0 1 6 20v-6Z"
          className={glyphFill}
        />
        <path
          d="M13 10h3v12a2.5 2.5 0 005 0V10h3v12a5.5 5.5 0 01-11 0V10z"
          className={glyphCutout}
        />
      </svg>
      <span
        className={cn(
          "font-display text-xl font-semibold tracking-tight",
          wordmarkColor,
        )}
      >
        UPAY
      </span>
    </div>
  );
}
