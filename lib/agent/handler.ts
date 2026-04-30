import type { UpayUser } from "@/lib/supabase/types";
import { completeOnboarding } from "@/lib/users/repository";

interface IncomingMessage {
  user: UpayUser;
  text: string;
  isNew: boolean;
}

export interface HandlerResult {
  reply: string;
  sideEffect?: { kind: "provision_wallet"; userId: string };
}

function isValidName(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.length < 2 || trimmed.length > 40) return false;
  return /^[\p{L}][\p{L}\s'-]*[\p{L}]$/u.test(trimmed);
}

function extractName(input: string): string {
  return input
    .trim()
    .replace(/^(my name is|i am|i'm|im|its|it's|call me)\s+/i, "")
    .replace(/[.!]+$/, "")
    .trim();
}

/**
 * Single entry point for inbound WhatsApp messages.
 *
 * Returns a HandlerResult so callers can know not just what to reply but
 * also whether any post-reply side effects should run. This keeps the
 * handler pure(ish) — it doesn't fire-and-forget directly, the route does.
 */
export async function handleIncomingMessage(
  message: IncomingMessage,
): Promise<HandlerResult> {
  const { user, text, isNew } = message;

  // First-ever message — greet and ask for name.
  if (isNew) {
    return {
      reply: [
        "👋 Welcome to UPay!",
        "",
        "I'm your AI money companion. Before we get started, what should I call you?",
        "",
        "(Just reply with your name)",
      ].join("\n"),
    };
  }

  // Returning user, still mid-onboarding — parse this message as their name.
  if (user.onboarding_step === "awaiting_name") {
    const candidate = extractName(text);

    if (!isValidName(candidate)) {
      return {
        reply: [
          "Hmm, that doesn't look like a name 🤔",
          "",
          "Could you reply with just your first name? Something like *Evan* or *Adaeze*.",
        ].join("\n"),
      };
    }

    const updated = await completeOnboarding({
      userId: user.id,
      name: candidate,
    });

    const firstName = updated.profile_name?.split(" ")[0] ?? candidate;

    return {
      reply: [
        `Nice to meet you, ${firstName}! 🎉`,
        "",
        "I'm setting up your UPay wallet now — give me a few seconds. I'll send your address as soon as it's ready.",
      ].join("\n"),
      sideEffect: { kind: "provision_wallet", userId: user.id },
    };
  }

  // Onboarded user — placeholder responses.
  return { reply: handleOnboardedUser({ user, text }) };
}

function handleOnboardedUser({
  user,
  text,
}: {
  user: UpayUser;
  text: string;
}): string {
  const trimmed = text.trim().toLowerCase();
  const name = user.profile_name?.split(" ")[0] ?? "there";

  if (!trimmed) {
    return `Hi ${name}! Send me a message like "send 5 usdc to +234..." to get started.`;
  }

  if (trimmed === "ping") return "pong ✓";

  if (trimmed.includes("address") || trimmed.includes("my wallet")) {
    if (user.wallet_status === "active" && user.wallet_address) {
      return [
        `Your UPay wallet address:`,
        "",
        `\`${user.wallet_address}\``,
        "",
        "You can receive USDC at this address on Arc.",
      ].join("\n");
    }
    if (user.wallet_status === "pending") {
      return "Your wallet is still being set up — give it a moment and ask again.";
    }
    return "Your wallet isn't ready yet. I'll have another go at setting it up shortly.";
  }

  if (trimmed.includes("help") || trimmed === "hi" || trimmed === "hello") {
    return [
      `Hey ${name} 👋`,
      "",
      "Try one of these:",
      '• "what\'s my address?"',
      '• "what\'s my balance?"',
      '• "send 5 usdc to <address>"',
    ].join("\n");
  }

  return `I got your message: "${text}". (LLM not wired up yet.)`;
}