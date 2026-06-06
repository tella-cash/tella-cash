import type { tellaUser, PendingAction } from "@/lib/supabase/types";
import {
  completeOnboarding,
  findUserByWhatsApp,
} from "@/lib/users/repository";
import {
  createPendingSend,
  getActivePending,
  deletePending,
} from "@/lib/pending_actions/repository";
import { getWalletBalances } from "@/lib/wallet/circle";
import { parseSendIntent, parseConfirmation } from "@/lib/agent/parse-send";
import { classifyIntent } from "@/lib/agent/intents";
import { REPLIES, pickReply } from "@/lib/agent/replies";
import { buildConfirmUrl } from "@/lib/confirm/url";

interface IncomingMessage {
  user: tellaUser;
  text: string;
  isNew: boolean;
}

export interface HandlerResult {
  reply: string;
  /**
   * When set, the reply is delivered as a WhatsApp interactive message
   * (the `reply` text becomes the message body). Falls back to plain text
   * if the matching Content Template isn't provisioned.
   */
  interactive?: "buttons" | "list";
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
        "👋 Welcome to tella!",
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
    return { reply: await handlePendingResponse({ pending, text }) };
  }

  return handleOnboardedUser({ user, text });
}

async function handleNameEntry({
  user,
  text,
}: {
  user: tellaUser;
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
      "I'm setting up your tella wallet now — give me a few seconds. I'll send your address as soon as it's ready.",
    ].join("\n"),
    sideEffect: { kind: "provision_wallet", userId: user.id },
  };
}

async function handlePendingResponse({
  pending,
  text,
}: {
  pending: PendingAction;
  text: string;
}): Promise<string> {
  const decision = parseConfirmation(text);

  if (decision === "no") {
    await deletePending(pending.id);
    return "Cancelled. Let me know if you want to try again.";
  }

  // "yes" no longer confirms in chat — sends require biometric/PIN in
  // the browser. Re-send the link for any unrecognized reply (and for
  // "yes" too) so the user always has a fresh tap-to-confirm.
  return buildPendingPrompt(pending);
}

function buildPendingPrompt(pending: PendingAction): string {
  const p = pending.payload;
  const recipientLabel = p.recipientName ?? p.recipientAddress;
  return [
    `Confirm send: *${p.amount} ${p.token}* to ${recipientLabel}`,
    "",
    `Tap to authorize with Face ID / Touch ID:`,
    buildConfirmUrl(pending.id),
    "",
    "Reply *no* to cancel.",
  ].join("\n");
}

function firstName(user: tellaUser): string {
  return user.profile_name?.split(" ")[0] ?? "there";
}

async function handleOnboardedUser({
  user,
  text,
}: {
  user: tellaUser;
  text: string;
}): Promise<HandlerResult> {
  const name = firstName(user);
  const trimmed = text.trim();

  if (!trimmed)
    return { reply: pickReply(REPLIES.empty, { name }), interactive: "buttons" };

  // Debug health-check stays deterministic.
  if (trimmed.toLowerCase() === "ping") return { reply: "pong ✓" };

  // A structured send carries real parameters (amount + recipient), so it
  // always wins over keyword classification.
  const intent = parseSendIntent(text);
  if (intent) return { reply: await startSendFlow({ user, intent }) };

  switch (classifyIntent(text)) {
    case "balance":
      return { reply: await getBalanceReply(user), interactive: "buttons" };
    case "address":
      return { reply: addressReply(user), interactive: "buttons" };
    case "send":
      // Send-ish but not parseable — show them the format plus quick taps.
      return { reply: pickReply(REPLIES.sendHelp, { name }), interactive: "buttons" };
    case "greeting":
      // Quick triage with tappable buttons.
      return { reply: pickReply(REPLIES.greeting, { name }), interactive: "buttons" };
    case "help":
      // Fuller menu with descriptions.
      return { reply: pickReply(REPLIES.help, { name }), interactive: "list" };
    case "about":
      return { reply: pickReply(REPLIES.about, { name }), interactive: "buttons" };
    case "how_it_works":
      return { reply: pickReply(REPLIES.howItWorks, { name }), interactive: "buttons" };
    case "fees":
      return { reply: pickReply(REPLIES.fees, { name }), interactive: "buttons" };
    case "security":
      return { reply: pickReply(REPLIES.security, { name }), interactive: "buttons" };
    case "thanks":
      return { reply: pickReply(REPLIES.thanks, { name }), interactive: "buttons" };
    case "goodbye":
      // No menu on a sign-off — let the conversation rest.
      return { reply: pickReply(REPLIES.goodbye, { name }) };
    case "affirm":
      return { reply: pickReply(REPLIES.affirm, { name }), interactive: "buttons" };
    case "cancel":
      return { reply: pickReply(REPLIES.cancelNothing, { name }), interactive: "buttons" };
    default:
      // Help them recover with the quick menu.
      return { reply: pickReply(REPLIES.unknown, { name }), interactive: "buttons" };
  }
}

function addressReply(user: tellaUser): string {
  const name = firstName(user);
  if (user.wallet_status === "active" && user.wallet_address) {
    return pickReply(REPLIES.address, { name, address: user.wallet_address });
  }
  if (user.wallet_status === "pending") {
    return pickReply(REPLIES.walletPending, { name });
  }
  return pickReply(REPLIES.walletNotReady, { name });
}

async function startSendFlow({
  user,
  intent,
}: {
  user: tellaUser;
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
        "That number isn't on tella yet 👀",
        "",
        "I can only send to tella users by phone number for now. If you have their wallet address, you can send to that directly:",
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

  const pending = await createPendingSend({
    userId: user.id,
    payload: {
      amount: intent.amount,
      token: intent.token,
      recipientUserId,
      recipientName,
      recipientAddress,
    },
  });

  return buildPendingPrompt(pending);
}

async function getBalanceReply(user: tellaUser): Promise<string> {
  const name = firstName(user);

  if (user.wallet_status !== "active" || !user.circle_wallet_id) {
    return pickReply(REPLIES.walletNotReady, { name });
  }

  let balances;
  try {
    balances = await getWalletBalances(user.circle_wallet_id);
  } catch (err) {
    console.error("[balance] fetch failed", { userId: user.id, err });
    return pickReply(REPLIES.balanceError, { name });
  }

  const nonZero = balances.filter((b) => parseFloat(b.amount) > 0);
  if (nonZero.length === 0) {
    return pickReply(REPLIES.balanceEmpty, {
      name,
      address: user.wallet_address ?? "",
    });
  }

  const lines = nonZero.map((b) => `• ${b.amount} ${b.symbol}`);
  return [pickReply(REPLIES.balanceIntro, { name }), "", ...lines].join("\n");
}