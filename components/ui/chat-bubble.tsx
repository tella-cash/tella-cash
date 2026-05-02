import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface ChatBubbleProps {
  /** Whose message this is — controls bubble color and alignment. */
  side: "incoming" | "outgoing";
  /** Bubble content — text or small composed nodes (icons, amounts). */
  children: ReactNode;
  /** Optional timestamp shown bottom-right of bubble. */
  time?: string;
  className?: string;
}

/**
 * ChatBubble
 *
 * WhatsApp-style speech bubble with a subtle tail. Outgoing bubbles use a
 * pale upay-green tint reminiscent of a banking chat; incoming use white.
 *
 * Bubble width is bounded so longer text wraps nicely inside the phone frame.
 */
export function ChatBubble({ side, children, time, className }: ChatBubbleProps) {
  const isOutgoing = side === "outgoing";

  return (
    <div
      className={cn(
        "flex w-full",
        isOutgoing ? "justify-end" : "justify-start",
        className,
      )}
    >
      <div
        className={cn(
          "relative max-w-[78%] rounded-2xl px-3 py-2 text-[11px] leading-snug",
          "shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
          isOutgoing
            ? "rounded-br-md bg-upay-100 text-ink-900"
            : "rounded-bl-md bg-white text-ink-900",
        )}
      >
        <div>{children}</div>
        {time && (
          <span className="mt-0.5 block text-right text-[9px] text-ink-500">
            {time}
            {isOutgoing && <span className="ml-1 text-upay-500">✓✓</span>}
          </span>
        )}
      </div>
    </div>
  );
}
