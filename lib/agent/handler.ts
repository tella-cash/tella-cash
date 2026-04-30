import type { UpayUser } from "@/lib/supabase/types";
import { completeOnboarding } from "@/lib/users/repository";

interface IncomingMessage {
  user: UpayUser;
  text: string;
  isNew: boolean;
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

export async function handleIncomingMessage(
  message: IncomingMessage,
): Promise<string> {
  const { user, text, isNew } = message;

  if (isNew) {
    return [
      "👋 Welcome to UPay!",
      "",
      "I'm your AI money companion. Before we get started, what should I call you?",
      "",
      "(Just reply with your name)",
    ].join("\n");
  }

  // Returning user, still mid-onboarding — parse this message as their name.
  if (user.onboarding_step === "awaiting_name") {
    const candidate = extractName(text);

    if (!isValidName(candidate)) {
      return [
        "Hmm, that doesn't look like a name 🤔",
        "",
        "Could you reply with just your first name? Something like *Evan* or *Adaeze*.",
      ].join("\n");
    }

    const updated = await completeOnboarding({
      userId: user.id,
      name: candidate,
    });

    const firstName = updated.profile_name?.split(" ")[0] ?? candidate;
    return [
      `Nice to meet you, ${firstName}! 🎉`,
      "",
      "Your account is all set. Try one of these to get started:",
      '• "send 5k to chuks"',
      '• "what\'s my balance?"',
      "",
      "I'll always confirm before moving any money.",
    ].join("\n");
  }

  // Onboarded user — placeholder responses until the LLM is wired up.
  return handleOnboardedUser({ user, text });
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
    return `Hi ${name}! Send me a message like "send 5k to chuks" to get started.`;
  }

  if (trimmed === "ping") return "pong ✓";

  if (trimmed.includes("help") || trimmed === "hi" || trimmed === "hello") {
    return [
      `Hey ${name} 👋`,
      "",
      "Try one of these:",
      '• "send 5k to chuks"',
      '• "what\'s my balance?"',
    ].join("\n");
  }

  return `I got your message: "${text}". (LLM not wired up yet.)`;
}