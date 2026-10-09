"use client";

import { useLinkStatus } from "next/link";

/**
 * A line under a period link while its page is on the way.
 *
 * The dashboard is rendered on the server for each period, so a click takes
 * a moment and would otherwise look like nothing happened. Always rendered at
 * a fixed size and only faded in, so it cannot shift the layout.
 */
export function PendingHint() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={`absolute inset-x-3 bottom-0.5 h-0.5 rounded-full bg-accent-500 transition-opacity duration-200 ${
        pending ? "animate-pulse opacity-100" : "opacity-0"
      }`}
    />
  );
}
