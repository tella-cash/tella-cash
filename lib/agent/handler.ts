import type { tellaUser, PendingAction, PendingSend } from "@/lib/supabase/types";
import {
  completeOnboarding,
  findUserByWhatsApp,
} from "@/lib/users/repository";
import {
  createPending,
  getActivePending,
  deletePending,
} from "@/lib/pending_actions/repository";
import {
  createPendingSend,
  listActivePendingSends,
  deletePendingSend,
} from "@/lib/pending_sends/repository";
import {
  findBeneficiaryByLabel,
  createBeneficiary,
} from "@/lib/beneficiaries/repository";
import { listRecentTransactions } from "@/lib/transactions/repository";
import { getWalletBalances } from "@/lib/wallet/circle";
import { getUsdToNgnRate, usdToNgn } from "@/lib/fx/naira";
import { parseSendIntent, parseConfirmation } from "@/lib/agent/parse-send";
import { classifyIntent } from "@/lib/agent/intents";
import { REPLIES, pickReply } from "@/lib/agent/replies";

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
  /**
   * When set, the reply is a confirm-send prompt and is delivered with a
   * tap-to-open "Confirm send" URL button (the token points at the confirm
   * page). Falls back to plain text + link if the CTA template isn't
   * provisioned.
   */
  confirm?: { token: string };
  /**
   * A second plain-text message sent immediately after `reply`, for
   * content that should stand alone in its own bubble — a wallet address,
   * so a long-press → Copy on WhatsApp grabs exactly that and nothing
   * else mixed in from surrounding sentence text.
   */
  followUp?: string;
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

/** Beneficiary labels are looser than user names — "Mum", "Landlord 2" etc. */
function isValidBeneficiaryLabel(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.length < 2 || trimmed.length > 30) return false;
  return /^[\p{L}\p{N}][\p{L}\p{N}\s'-]*[\p{L}\p{N}]$/u.test(trimmed);
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

  // Beneficiary-save is a short, mandatory back-and-forth (yes/no, then a
  // name) — every message must be captured until it resolves. Pending
  // *sends* are deliberately NOT intercepted here: a user can have several
  // at once, and typing a new "send X to Y" while one is outstanding must
  // start a fresh one rather than being swallowed by an old prompt (see
  // handleOnboardedUser, which checks parseSendIntent before anything
  // pending-send-related).
  const beneficiaryPending = await getActivePending(user.id);
  if (beneficiaryPending) {
    return handleBeneficiaryPendingResponse({ user, pending: beneficiaryPending, text });
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

async function handleBeneficiaryPendingResponse({
  user,
  pending,
  text,
}: {
  user: tellaUser;
  pending: PendingAction;
  text: string;
}): Promise<HandlerResult> {
  switch (pending.kind) {
    case "beneficiary_confirm":
      return handleBeneficiaryConfirmResponse({ user, pending, text });
    case "beneficiary_name":
      return handleBeneficiaryNameResponse({ user, pending, text });
  }
}

async function handleBeneficiaryConfirmResponse({
  user,
  pending,
  text,
}: {
  user: tellaUser;
  pending: PendingAction;
  text: string;
}): Promise<HandlerResult> {
  const decision = parseConfirmation(text);

  if (decision === "no") {
    await deletePending(pending.id);
    return { reply: "No problem, skipped. Let me know if you change your mind." };
  }

  if (decision === "yes") {
    await createPending({
      userId: user.id,
      kind: "beneficiary_name",
      payload: pending.payload,
      ttlMinutes: 10,
    });
    return { reply: "Nice — what would you like to save them as?" };
  }

  const label = pending.payload.suggestedLabel ?? "this recipient";
  return {
    reply: `Want to save ${label} as a beneficiary? Reply *yes* or *no*.`,
  };
}

async function handleBeneficiaryNameResponse({
  user,
  pending,
  text,
}: {
  user: tellaUser;
  pending: PendingAction;
  text: string;
}): Promise<HandlerResult> {
  const label = text.trim();

  if (!isValidBeneficiaryLabel(label)) {
    return {
      reply: "That doesn't look like a name I can save. Try something like *Chidi* or *Mum*.",
    };
  }

  const existing = await findBeneficiaryByLabel(user.id, label);
  if (existing) {
    return {
      reply: `You already have a beneficiary called *${existing.label}*. Try a different name.`,
    };
  }

  const result = await createBeneficiary({
    userId: user.id,
    label,
    recipientUserId: pending.payload.recipientUserId,
    recipientAddress: pending.payload.recipientAddress,
    recipientWhatsappNumber: pending.payload.recipientWhatsappNumber,
  });

  if (!result.ok) {
    return {
      reply: `You already have a beneficiary called *${label}*. Try a different name.`,
    };
  }

  await deletePending(pending.id);

  return {
    reply: [
      `✓ Saved as *${label}*.`,
      "",
      `Next time just say "send 5 usdc to ${label}".`,
    ].join("\n"),
  };
}

/** A confirm-send prompt + the CTA token that opens the confirm page. */
function confirmResult(pending: PendingSend): HandlerResult {
  return { reply: buildConfirmBody(pending), confirm: { token: pending.id } };
}

function buildConfirmBody(pending: PendingSend): string {
  const p = pending.payload;
  const recipientLabel = p.recipientName ?? p.recipientAddress;
  return [
    `Confirm send: *${p.amount} USDC* to ${recipientLabel}`,
    "",
    "Tap *Confirm send* below to authorize with Face ID, your fingerprint, or your PIN.",
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
  if (intent) return startSendFlow({ user, intent });

  switch (classifyIntent(text)) {
    case "balance":
      return { ...(await getBalanceReply(user)), interactive: "buttons" };
    case "address":
      return { ...addressReply(user), interactive: "buttons" };
    case "history":
      return { reply: await getHistoryReply(user), interactive: "buttons" };
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
      return cancelMostRecentPendingSend(user);
    default:
      // Help them recover with the quick menu.
      return { reply: pickReply(REPLIES.unknown, { name }), interactive: "buttons" };
  }
}

async function cancelMostRecentPendingSend(user: tellaUser): Promise<HandlerResult> {
  const name = firstName(user);
  const pendingSends = await listActivePendingSends(user.id);

  if (pendingSends.length === 0) {
    return { reply: pickReply(REPLIES.cancelNothing, { name }), interactive: "buttons" };
  }

  const latest = pendingSends[0];
  await deletePendingSend(latest.id);

  const p = latest.payload;
  const recipientLabel = p.recipientName ?? p.recipientAddress;
  const remaining = pendingSends.length - 1;
  const remainingNote =
    remaining > 0
      ? ` You still have ${remaining} other pending send${remaining > 1 ? "s" : ""} — say "cancel" again to drop the next one.`
      : "";

  return {
    reply: `Cancelled your pending send of ${p.amount} USDC to ${recipientLabel}.${remainingNote}`,
    interactive: "buttons",
  };
}

function addressReply(user: tellaUser): Pick<HandlerResult, "reply" | "followUp"> {
  const name = firstName(user);
  if (user.wallet_status === "active" && user.wallet_address) {
    return {
      reply: pickReply(REPLIES.address, { name, address: user.wallet_address }),
      followUp: user.wallet_address,
    };
  }
  if (user.wallet_status === "pending") {
    return { reply: pickReply(REPLIES.walletPending, { name }) };
  }
  return { reply: pickReply(REPLIES.walletNotReady, { name }) };
}

async function startSendFlow({
  user,
  intent,
}: {
  user: tellaUser;
  intent: ReturnType<typeof parseSendIntent>;
}): Promise<HandlerResult> {
  if (!intent)
    return {
      reply:
        'I couldn\'t understand that send instruction. Try "send 5 usdc to +234..." or "send 5 usdc to Chidi".',
    };

  if (user.wallet_status !== "active" || !user.circle_wallet_id) {
    return {
      reply:
        "Your wallet isn't ready yet. Once it's set up you'll be able to send.",
    };
  }

  let recipientAddress: string;
  let recipientName: string | null = null;
  let recipientUserId: string | null = null;
  let recipientWhatsappNumber: string | null = null;

  if (intent.recipient.kind === "address") {
    if (
      user.wallet_address &&
      intent.recipient.address.toLowerCase() === user.wallet_address.toLowerCase()
    ) {
      return { reply: "That's your own address — can't send to yourself." };
    }
    recipientAddress = intent.recipient.address;
  } else if (intent.recipient.kind === "phone") {
    const recipient = await findUserByWhatsApp(intent.recipient.whatsappNumber);

    if (!recipient) {
      return {
        reply: [
          "That number isn't on tella yet 👀",
          "",
          "I can only send to tella users by phone number for now. If you have their wallet address, you can send to that directly:",
          '• "send 5 usdc to 0x..."',
        ].join("\n"),
      };
    }

    if (recipient.id === user.id) {
      return { reply: "That's your own number — can't send to yourself." };
    }

    if (recipient.wallet_status !== "active" || !recipient.wallet_address) {
      return {
        reply: `${recipient.profile_name ?? "That user"} hasn't finished setting up their wallet yet. Try again in a moment.`,
      };
    }

    recipientAddress = recipient.wallet_address;
    recipientName = recipient.profile_name;
    recipientUserId = recipient.id;
    recipientWhatsappNumber = intent.recipient.whatsappNumber;
  } else {
    const beneficiary = await findBeneficiaryByLabel(user.id, intent.recipient.label);

    if (!beneficiary) {
      return {
        reply: [
          `I don't have a beneficiary called "${intent.recipient.label}" saved yet.`,
          "",
          "Send to their phone number or wallet address first, and I'll offer to save them for next time.",
        ].join("\n"),
      };
    }

    recipientAddress = beneficiary.recipient_address;
    recipientName = beneficiary.label;
    recipientUserId = beneficiary.recipient_user_id;
    recipientWhatsappNumber = beneficiary.recipient_whatsapp_number;
  }

  const rate = await getUsdToNgnRate();
  const amountNgn = usdToNgn(parseFloat(intent.amount), rate);

  const pending = await createPendingSend({
    userId: user.id,
    payload: {
      amount: intent.amount,
      amountNgn: amountNgn.toFixed(2),
      token: intent.token,
      recipientUserId,
      recipientName,
      recipientAddress,
      recipientWhatsappNumber,
    },
  });

  return confirmResult(pending);
}

async function getBalanceReply(
  user: tellaUser,
): Promise<Pick<HandlerResult, "reply" | "followUp">> {
  const name = firstName(user);

  if (user.wallet_status !== "active" || !user.circle_wallet_id) {
    return { reply: pickReply(REPLIES.walletNotReady, { name }) };
  }

  let balances;
  try {
    balances = await getWalletBalances(user.circle_wallet_id);
  } catch (err) {
    console.error("[balance] fetch failed", { userId: user.id, err });
    return { reply: pickReply(REPLIES.balanceError, { name }) };
  }

  const nonZero = balances.filter((b) => parseFloat(b.amount) > 0);
  if (nonZero.length === 0) {
    return {
      reply: pickReply(REPLIES.balanceEmpty, { name }),
      followUp: user.wallet_address ?? undefined,
    };
  }

  const lines = nonZero.map((b) => `• ${b.amount} ${b.symbol}`);
  return {
    reply: [pickReply(REPLIES.balanceIntro, { name }), "", ...lines].join("\n"),
  };
}

const DIRECTION_ICON = { sent: "↗", received: "↙" } as const;
const STATUS_ICON = { submitted: "⏳", complete: "✅" } as const;

async function getHistoryReply(user: tellaUser): Promise<string> {
  const name = firstName(user);
  const transactions = await listRecentTransactions(user.id, 10);

  if (transactions.length === 0) {
    return `You don't have any transactions yet, ${name}. Once you send or receive, they'll show up here.`;
  }

  const dateFormatter = new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos",
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  const lines = transactions.map((t, i) => {
    const verb = t.direction === "sent" ? "Sent" : "Received";
    const counterparty = t.counterparty_label ?? "an external wallet";
    const preposition = t.direction === "sent" ? "to" : "from";
    const amount = `${t.amount_usdc} USDC`;
    const when = dateFormatter.format(new Date(t.created_at));
    return [
      `${i + 1}️⃣ ${DIRECTION_ICON[t.direction]} ${verb} ${amount} ${preposition} ${counterparty}`,
      `    ${when} · ${STATUS_ICON[t.status]} ${t.status === "complete" ? "Complete" : "Processing"}`,
    ].join("\n");
  });

  return [`📜 *Your last ${transactions.length} transactions*`, "", ...lines].join("\n\n");
}
