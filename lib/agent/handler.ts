import type { UpayUser } from "@/lib/supabase/types";
import { completeOnboarding } from "@/lib/users/repository";
import { getWalletBalances } from "../wallet/circle";

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
  return { reply: await handleOnboardedUser({ user, text }) };
}

async function handleOnboardedUser({
  user,
  text,
}: {
  user: UpayUser;
  text: string;
}): Promise<string> {
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

    // Balance lookup
  if (trimmed.includes("balance")) {
    return await getBalanceReply(user);
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


async function getBalanceReply(user: UpayUser): Promise<string> {
  if (user.wallet_status !== "active" || !user.circle_wallet_id) {
    return "Your wallet isn't ready yet. Once it's set up I'll be able to show your balance.";
  }

  let balances;
  try {
    balances = await getWalletBalances(user.circle_wallet_id);
  } catch (err) {
    console.error("[balance] fetch failed", { userId: user.id, err });
    return "I couldn't fetch your balance right now. Try again in a moment.";
  }

  // Filter out zero balances — Circle sometimes returns historical tokens
  // with a 0 amount. Showing them is just noise.
  const nonZero = balances.filter((b) => parseFloat(b.amount) > 0);

  if (nonZero.length === 0) {
    return [
      "Your wallet is empty 👀",
      "",
      `Send USDC to this address to fund up:`,
      `\`${user.wallet_address}\``,
    ].join("\n");
  }

  const lines = nonZero.map((b) => `• ${b.amount} ${b.symbol}`);
  return ["Here's what you've got:", "", ...lines].join("\n");
}