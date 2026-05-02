import type { UpayUser, PendingAction } from "@/lib/supabase/types";
import {
  completeOnboarding,
  findUserByWhatsApp,
} from "@/lib/users/repository";
import {
  createPendingSend,
  getActivePending,
  deletePending,
} from "@/lib/pending_actions/repository";
import { getWalletBalances, sendUsdc } from "@/lib/wallet/circle";
import { parseSendIntent, parseConfirmation } from "@/lib/agent/parse-send";

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

  if (user.onboarding_step === "awaiting_name") {
    return handleNameEntry({ user, text });
  }

  const pending = await getActivePending(user.id);
  if (pending) {
    return { reply: await handlePendingResponse({ user, pending, text }) };
  }

  return { reply: await handleOnboardedUser({ user, text }) };
}

async function handleNameEntry({
  user,
  text,
}: {
  user: UpayUser;
  text: string;
}): Promise<HandlerResult> {
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

async function handlePendingResponse({
  user,
  pending,
  text,
}: {
  user: UpayUser;
  pending: PendingAction;
  text: string;
}): Promise<string> {
  const decision = parseConfirmation(text);

  if (decision === "no") {
    await deletePending(pending.id);
    return "Cancelled. Let me know if you want to try again.";
  }

  if (decision === "yes") {
    return executePendingSend({ user, pending });
  }

  // Neither yes nor no — nudge them back.
  const p = pending.payload;
  const recipientLabel = p.recipientName ?? p.recipientAddress;
  return [
    `You still have a pending send: ${p.amount} ${p.token} to ${recipientLabel}.`,
    "",
    "Reply *yes* to confirm or *no* to cancel.",
  ].join("\n");
}

async function executePendingSend({
  user,
  pending,
}: {
  user: UpayUser;
  pending: PendingAction;
}): Promise<string> {
  if (user.wallet_status !== "active" || !user.circle_wallet_id) {
    await deletePending(pending.id);
    return "Your wallet isn't ready to send right now. Try again in a moment.";
  }

  // Delete BEFORE the transfer so a duplicate "yes" can't double-send.
  await deletePending(pending.id);

  const p = pending.payload;
  try {
    const result = await sendUsdc({
      fromWalletId: user.circle_wallet_id,
      toAddress: p.recipientAddress,
      amount: p.amount,
    });

    const recipientLabel = p.recipientName ?? p.recipientAddress;
    return [
      `✓ Sent ${p.amount} ${p.token} to ${recipientLabel}.`,
      "",
      `Reference: \`${result.transactionId.slice(0, 8)}\``,
    ].join("\n");
  } catch (err) {
    console.error("[send] transfer failed", { userId: user.id, err });
    return "I couldn't complete that transfer. Your balance is unchanged. Want to try again?";
  }
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

  const intent = parseSendIntent(text);
  if (intent) {
    return startSendFlow({ user, intent });
  }

  if (trimmed.includes("address") || trimmed.includes("my wallet")) {
    if (user.wallet_status === "active" && user.wallet_address) {
      return [
        "Your UPay wallet address:",
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

  if (trimmed.includes("balance")) {
    return getBalanceReply(user);
  }

  if (trimmed.includes("help") || trimmed === "hi" || trimmed === "hello") {
    return [
      `Hey ${name} 👋`,
      "",
      "Try one of these:",
      '• "what\'s my address?"',
      '• "what\'s my balance?"',
      '• "send 5 usdc to +234..."',
      '• "send 5 usdc to 0x..."',
    ].join("\n");
  }

  return `I got your message: "${text}". (LLM not wired up yet.)`;
}

async function startSendFlow({
  user,
  intent,
}: {
  user: UpayUser;
  intent: ReturnType<typeof parseSendIntent>;
}): Promise<string> {
  if (!intent) return "I couldn't understand that send instruction. Try \"send 5 usdc to +234...\".";

  if (user.wallet_status !== "active" || !user.circle_wallet_id) {
    return "Your wallet isn't ready yet. Once it's set up you'll be able to send.";
  }

  let recipientAddress: string;
  let recipientName: string | null = null;
  let recipientUserId: string | null = null;

  if (intent.recipient.kind === "address") {
    if (
      user.wallet_address &&
      intent.recipient.address.toLowerCase() === user.wallet_address.toLowerCase()
    ) {
      return "That's your own address — can't send to yourself.";
    }
    recipientAddress = intent.recipient.address;
  } else {
    const recipient = await findUserByWhatsApp(intent.recipient.whatsappNumber);

    if (!recipient) {
      return [
        "That number isn't on UPay yet 👀",
        "",
        "I can only send to UPay users by phone number for now. If you have their wallet address, you can send to that directly:",
        '• "send 5 usdc to 0x..."',
      ].join("\n");
    }

    if (recipient.id === user.id) {
      return "That's your own number — can't send to yourself.";
    }

    if (
      recipient.wallet_status !== "active" ||
      !recipient.wallet_address
    ) {
      return `${recipient.profile_name ?? "That user"} hasn't finished setting up their wallet yet. Try again in a moment.`;
    }

    recipientAddress = recipient.wallet_address;
    recipientName = recipient.profile_name;
    recipientUserId = recipient.id;
  }

  await createPendingSend({
    userId: user.id,
    payload: {
      amount: intent.amount,
      token: intent.token,
      recipientUserId,
      recipientName,
      recipientAddress,
    },
  });

  const recipientLabel = recipientName ?? `\`${recipientAddress.slice(0, 6)}…${recipientAddress.slice(-4)}\``;
  return [
    `Send *${intent.amount} ${intent.token}* to ${recipientLabel}?`,
    "",
    "Reply *yes* to confirm or *no* to cancel.",
  ].join("\n");
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

  const nonZero = balances.filter((b) => parseFloat(b.amount) > 0);
  if (nonZero.length === 0) {
    return [
      "Your wallet is empty 👀",
      "",
      "Send USDC to this address to fund up:",
      `\`${user.wallet_address}\``,
    ].join("\n");
  }

  const lines = nonZero.map((b) => `• ${b.amount} ${b.symbol}`);
  return ["Here's what you've got:", "", ...lines].join("\n");
}