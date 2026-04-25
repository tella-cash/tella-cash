/**
 * Tiny className concatenator. Drops falsy values so we can write
 * `cn("base", isActive && "ring-2")` without importing `clsx`.
 *
 * @param inputs - Mixed list of strings, undefined, false, etc.
 * @returns Space-joined non-empty class string.
 */
export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(" ");
}
