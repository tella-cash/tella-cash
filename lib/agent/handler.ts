import type { tellaUser, PendingAction, PendingSend } from "@/lib/supabase/types";
import {
  completeOnboarding,
  findUserByWhatsApp,
} from "@/lib/users/repository";
import {
  getActivePending,
  deletePending,
  createPendingFlow,
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
import {
  getWalletBalances,
  requestFaucetTokens,
  FaucetForbiddenError,
  FaucetRateLimitedError,
  type FaucetAsset,
} from "@/lib/wallet/circle";
import { getUsdToNgnRate, usdToNgn } from "@/lib/fx/naira";
import { checkSendLimits, formatLimitFailure } from "@/lib/sends/limits";
import { isResetRequest } from "@/lib/agent/detect-reset-request";
import { isFreezeRequest } from "@/lib/agent/detect-freeze-request";
import { gateSpend, gateWalletReady, isFrozen } from "@/lib/users/wallet-gate";
import { freezeAccount } from "@/lib/users/freeze";
import {
  createResetToken,
  buildResetUrl,
  RESET_TTL_MINUTES,
} from "@/lib/security/reset-tokens";
import { recordAuthAttempt, formatRetryAfter } from "@/lib/auth/rate-limit";
import type { ParsedSendIntent } from "@/lib/agent/parse-send";
import { mapDecodedSend } from "@/lib/agent/map-decoded-send";
import { normalizeFaucetAsset } from "@/lib/agent/normalize-faucet-asset";
import {
  decode,
  decodeFollowUp,
  flowStart,
  SendamUnavailableError,
  type FollowUpSlots,
} from "@/lib/sendam-ai/client";
import { fastPathDecode } from "@/lib/agent/fast-path";
import {
  SAVE_BENEFICIARY_FLOW,
  FAUCET_ASSET_FLOW,
  FAUCET_ASSET_AWAITING,
  nextQuestionFor,
} from "@/lib/sendam-ai/flows";
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
        "Send and receive USDC right here in WhatsApp — no exchange, no app, no seed phrase to lose. I'll set your wallet up in about 30 seconds.",
        "",
        "What should I call you?",
        "",
        "(Just reply with your name)",
      ].join("\n"),
    };
  }

  if (user.onboarding_step === "awaiting_name") {
    return handleNameEntry({ user, text });
  }

  // A backend-initiated multi-turn flow (e.g. beneficiary-save) is a short,
  // mandatory back-and-forth — every message must be captured until it
  // resolves. Pending *sends* are deliberately NOT intercepted here: a user
  // can have several at once, and typing a new "send X to Y" while one is
  // outstanding must start a fresh one rather than being swallowed by an
  // old prompt (see handleOnboardedUser, which checks for a structured send
  // before anything pending-send-related).
  // Checked before the pending-flow interception below, not after. A user
  // halfway through "save this recipient?" whose phone has just been stolen
  // must not have "freeze" swallowed as an answer to a beneficiary prompt.
  // This is also matched before any decoder runs, for the reason
  // detect-freeze-request.ts gives: the kill switch cannot depend on a
  // network call to a service that may be the thing that is down.
  if (isFreezeRequest(text)) return handleFreezeRequest(user);

  const flowPending = await getActivePending(user.id);
  if (flowPending) {
    return handleFlowPendingResponse({ user, pending: flowPending, text });
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

  const firstNameValue = updated.profile_name?.split(" ")[0] ?? candidate;

  return {
    reply: [
      `Nice to meet you, ${firstNameValue}! 🎉`,
      "",
      "I'm setting up your tella wallet now — give me a few seconds. I'll send your address as soon as it's ready.",
    ].join("\n"),
    sideEffect: { kind: "provision_wallet", userId: user.id },
  };
}

/**
 * How many consecutive decode failures a flow gets before it releases the
 * conversation. Two: the first is plausibly a blip worth retrying, and a
 * third would mean the user has typed three messages into a conversation
 * that cannot advance.
 */
const MAX_FLOW_FAILURES = 2;

/**
 * Interprets one reply within a pending multi-turn flow via sendam-ai's
 * stateless token mechanism. `pending.payload` only ever holds an opaque
 * `{ flow, token }` — this function forwards the token, never parses it.
 */
async function handleFlowPendingResponse({
  user,
  pending,
  text,
}: {
  user: tellaUser;
  pending: PendingAction;
  text: string;
}): Promise<HandlerResult> {
  const { flow, token } = pending.payload;
  const failures = pending.payload.failures ?? 0;
  const name = firstName(user);

  let result: Awaited<ReturnType<typeof decodeFollowUp>>;
  try {
    result = await decodeFollowUp(text, token);
  } catch (err) {
    console.error("[agent] decodeFollowUp failed", {
      userId: user.id,
      flow,
      failures,
      err,
    });

    // The row is still kept on the first failure, for the original reason:
    // the user's retry should hit the same token rather than have the flow
    // fabricate progress on our outage.
    //
    // But keeping it forever was its own bug. A token that has genuinely
    // expired on sendam-ai's side throws every time, and while it does this
    // handler captures EVERY message the user sends — for up to the full
    // 15-minute TTL — and answers all of them with this same line, whatever
    // they actually typed. Someone trying to check their balance, or start a
    // send, or ask for help, just gets told to say it again. So after a
    // second consecutive failure the flow gives the conversation back.
    if (failures + 1 >= MAX_FLOW_FAILURES) {
      await deletePending(pending.id);
      return {
        reply: [
          `Sorry ${name}, I lost the thread of that one.`,
          "",
          "Let's start over — what would you like to do?",
        ].join("\n"),
        interactive: "buttons",
      };
    }

    await createPendingFlow({
      userId: user.id,
      flow,
      token,
      failures: failures + 1,
    });
    return { reply: "Sorry, having a little trouble right now — could you say that again?" };
  }

  // Early termination on decline: our own business rule layered on top of
  // the generic token mechanism — sendam-ai doesn't know "declining ends
  // the flow," it just resolves whatever slots it can. Checked before
  // `status`, since a lone "no" reply can leave the flow IN_PROGRESS
  // (beneficiaryName still unresolved) with confirmed already false.
  if (result.slots["confirmed"] === false) {
    await deletePending(pending.id);
    return { reply: "No problem, skipped. Let me know if you change your mind." };
  }

  if (result.status === "IN_PROGRESS") {
    await createPendingFlow({ userId: user.id, flow: result.flow, token: result.token });
    return { reply: nextQuestionFor(result.flow, result.slots) ?? "Sorry, could you say that again?" };
  }

  if (flow === SAVE_BENEFICIARY_FLOW) {
    return completeSaveBeneficiaryFlow({ user, pending, slots: result.slots });
  }

  if (flow === FAUCET_ASSET_FLOW) {
    return completeFaucetAssetFlow({ user, pending, slots: result.slots });
  }

  await deletePending(pending.id);
  return { reply: pickReply(REPLIES.unknown, { name }), interactive: "buttons" };
}

async function completeSaveBeneficiaryFlow({
  user,
  pending,
  slots,
}: {
  user: tellaUser;
  pending: PendingAction;
  slots: FollowUpSlots;
}): Promise<HandlerResult> {
  await deletePending(pending.id);

  const label = (typeof slots["beneficiaryName"] === "string" ? slots["beneficiaryName"] : "").trim();

  // The model proposes a name — we still validate it ourselves before
  // persisting, same as any other proposal from sendam-ai.
  if (!isValidBeneficiaryLabel(label)) {
    return reissueNamePrompt({
      user,
      slots,
      replyPrefix: "That doesn't look like a name I can save. Try something like *Chidi* or *Mum*.",
    });
  }

  const recipientAddress = String(slots["recipientAddress"] ?? "");
  const recipientUserId = typeof slots["recipientUserId"] === "string" ? slots["recipientUserId"] : null;
  const recipientWhatsappNumber =
    typeof slots["recipientWhatsappNumber"] === "string" ? slots["recipientWhatsappNumber"] : null;

  const existing = await findBeneficiaryByLabel(user.id, label);
  if (existing) {
    return reissueNamePrompt({
      user,
      slots,
      replyPrefix: `You already have a beneficiary called *${existing.label}*. Try a different name.`,
    });
  }

  const result = await createBeneficiary({
    userId: user.id,
    label,
    recipientUserId,
    recipientAddress,
    recipientWhatsappNumber,
  });

  if (!result.ok) {
    return reissueNamePrompt({
      user,
      slots,
      replyPrefix: `You already have a beneficiary called *${label}*. Try a different name.`,
    });
  }

  return {
    reply: [
      `✓ Saved as *${label}*.`,
      "",
      `Next time just say "send 5 usdc to ${label}".`,
    ].join("\n"),
  };
}

/**
 * The original token is already COMPLETE/consumed at this point — mints a
 * fresh single-slot token for just the name rather than trying to continue
 * a finished flow.
 */
async function reissueNamePrompt({
  user,
  slots,
  replyPrefix,
}: {
  user: tellaUser;
  slots: FollowUpSlots;
  replyPrefix: string;
}): Promise<HandlerResult> {
  // A sendam-ai outage here must not throw all the way up to the webhook
  // route — the Meta channel has no fallback-message safety net of its own
  // (unlike Twilio's), so an uncaught throw here means total silence.
  try {
    const { token } = await flowStart(SAVE_BENEFICIARY_FLOW, slots, [
      { slot: "beneficiaryName", type: "FREE_TEXT", description: "what should we call them?" },
    ]);
    await createPendingFlow({ userId: user.id, flow: SAVE_BENEFICIARY_FLOW, token });
    return { reply: replyPrefix };
  } catch (err) {
    console.error("[agent] flowStart failed", { userId: user.id, flow: SAVE_BENEFICIARY_FLOW, err });
    return { reply: replyPrefix };
  }
}

async function completeFaucetAssetFlow({
  user,
  pending,
  slots,
}: {
  user: tellaUser;
  pending: PendingAction;
  slots: FollowUpSlots;
}): Promise<HandlerResult> {
  await deletePending(pending.id);

  const asset = normalizeFaucetAsset(typeof slots["asset"] === "string" ? slots["asset"] : null);
  if (!asset) {
    return reissueFaucetAssetPrompt({
      user,
      replyPrefix: pickReply(REPLIES.faucetInvalidAsset, { name: firstName(user) }),
    });
  }

  return sendFaucetTokens({ user, asset });
}

/**
 * Starts (or restarts) the "which testnet asset?" flow. A sendam-ai
 * outage/misconfiguration here must not cost the user their message —
 * same principle as decode()'s try/catch in handleOnboardedUser — so a
 * failed flowStart() falls back to a plain reply instead of throwing all
 * the way up to the webhook route, which for the Meta channel has no
 * fallback-message safety net of its own (unlike the Twilio route).
 *
 * `priorSlots` is deliberately NOT forwarded on a re-ask (see call sites):
 * an old, unrecognized "asset" value would otherwise look already-resolved
 * to sendam-ai and never get asked again.
 */
async function startFaucetAssetFlow(user: tellaUser): Promise<{ ok: boolean; reply: string }> {
  try {
    const { token } = await flowStart(FAUCET_ASSET_FLOW, {}, FAUCET_ASSET_AWAITING);
    await createPendingFlow({ userId: user.id, flow: FAUCET_ASSET_FLOW, token });
    return {
      ok: true,
      reply: nextQuestionFor(FAUCET_ASSET_FLOW, {}) ?? "Which testnet asset would you like — native, USDC, or EURC?",
    };
  } catch (err) {
    console.error("[faucet] flowStart failed", { userId: user.id, err });
    return { ok: false, reply: pickReply(REPLIES.faucetError, { name: firstName(user) }) };
  }
}

/**
 * The original token is already COMPLETE/consumed at this point — mints a
 * fresh single-slot token for just the asset rather than trying to continue
 * a finished flow.
 */
async function reissueFaucetAssetPrompt({
  user,
  replyPrefix,
}: {
  user: tellaUser;
  replyPrefix: string;
}): Promise<HandlerResult> {
  const result = await startFaucetAssetFlow(user);
  if (!result.ok) return { reply: result.reply };
  return { reply: `${replyPrefix}\n\n${result.reply}` };
}

async function handleFaucetIntent({
  user,
  asset,
}: {
  user: tellaUser;
  asset: string | null;
}): Promise<HandlerResult> {
  const name = firstName(user);

  // A faucet drip is a write against the wallet, so it follows the same
  // gate as a send rather than the read gate.
  const gate = gateSpend(user);
  if (!gate.ok || !user.wallet_address) {
    if (gate.ok === false && gate.reason === "frozen") return frozenReply(name);
    return { reply: pickReply(REPLIES.walletNotReady, { name }) };
  }

  const normalized = normalizeFaucetAsset(asset);
  if (!normalized) {
    const result = await startFaucetAssetFlow(user);
    return { reply: result.reply };
  }

  return sendFaucetTokens({ user, asset: normalized });
}

async function sendFaucetTokens({
  user,
  asset,
}: {
  user: tellaUser;
  asset: FaucetAsset;
}): Promise<HandlerResult> {
  const name = firstName(user);

  try {
    await requestFaucetTokens({ address: user.wallet_address as string, asset });
    return { reply: pickReply(REPLIES.faucetSuccess, { name }) };
  } catch (err) {
    if (err instanceof FaucetRateLimitedError) {
      return { reply: pickReply(REPLIES.faucetRateLimited, { name }) };
    }
    if (err instanceof FaucetForbiddenError) {
      // Circle's drip API is gated behind a mainnet-upgraded account — the
      // web faucet isn't. Point the user there, with their address in its
      // own bubble so a long-press → Copy grabs exactly the address.
      return {
        reply: pickReply(REPLIES.faucetWebFallback, { name }),
        followUp: user.wallet_address as string,
      };
    }
    console.error("[faucet] request failed", { userId: user.id, asset, err });
    return { reply: pickReply(REPLIES.faucetError, { name }) };
  }
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

  // Matched before decode() on purpose — see detect-reset-request.ts. A
  // locked-out user must get the recovery link even when sendam-ai is down.
  if (isResetRequest(trimmed)) return startPinReset(user);

  // Tier 0. Taps on our own buttons and the handful of unambiguous typed
  // commands never leave this server: no latency, no cost, and no dependency
  // on a service that may be the thing that is broken. Returns null whenever
  // it is not certain, which is always safe — it just means a smarter tier
  // gets the message. See lib/agent/fast-path.ts.
  let decoded = fastPathDecode(trimmed);

  if (!decoded) {
    try {
      decoded = await decode(text, { userId: user.id });
    } catch (err) {
      console.error("[agent] decode failed", { userId: user.id, err });

      // An outage and a genuinely unparseable message used to produce the
      // identical reply, which meant a user got told "I didn't understand"
      // while the truth was that we never even asked. Those are different
      // problems and the user can act on the difference: one is worth
      // rephrasing, the other is worth waiting a minute.
      if (err instanceof SendamUnavailableError) {
        return {
          reply: [
            `I'm having trouble understanding messages right now, ${name} — that's on my side, not yours.`,
            "",
            "Try again in a minute. Balance, address and history still work, and you can always reply *freeze* if something's wrong.",
          ].join("\n"),
          interactive: "buttons",
        };
      }

      return { reply: pickReply(REPLIES.unknown, { name }), interactive: "buttons" };
    }
  }

  // A structured send carries real parameters (amount + recipient), so it
  // always wins over the general intent switch below.
  const sendIntent: ParsedSendIntent | null = mapDecodedSend(decoded);
  if (sendIntent) return startSendFlow({ user, intent: sendIntent });

  switch (decoded.intent) {
    case "BALANCE":
      return { ...(await getBalanceReply(user)), interactive: "buttons" };
    case "ADDRESS":
      return { ...addressReply(user), interactive: "buttons" };
    case "HISTORY":
      return { reply: await getHistoryReply(user), interactive: "buttons" };
    case "SEND":
      // Send-ish but not parseable — show them the format plus quick taps.
      return { reply: pickReply(REPLIES.sendHelp, { name }), interactive: "buttons" };
    case "GREETING":
      // sendam-ai reads the tone of the user's own greeting and composes a
      // matching reply; fall back to our fixed template on older deploys
      // that don't send one yet.
      return {
        reply: decoded.reply || pickReply(REPLIES.greeting, { name }),
        interactive: "buttons",
      };
    case "HELP":
      // Fuller menu with descriptions.
      return { reply: pickReply(REPLIES.help, { name }), interactive: "list" };
    case "ABOUT":
      return { reply: pickReply(REPLIES.about, { name }), interactive: "buttons" };
    case "HOW_IT_WORKS":
      return { reply: pickReply(REPLIES.howItWorks, { name }), interactive: "buttons" };
    case "FEES":
      return { reply: pickReply(REPLIES.fees, { name }), interactive: "buttons" };
    case "SECURITY":
      return { reply: pickReply(REPLIES.security, { name }), interactive: "buttons" };
    case "FAUCET":
      return handleFaucetIntent({ user, asset: decoded.asset });
    case "THANKS":
      return { reply: pickReply(REPLIES.thanks, { name }), interactive: "buttons" };
    case "GOODBYE":
      // No menu on a sign-off — let the conversation rest.
      return { reply: pickReply(REPLIES.goodbye, { name }) };
    case "AFFIRM":
      return { reply: pickReply(REPLIES.affirm, { name }), interactive: "buttons" };
    case "CANCEL":
      return cancelMostRecentPendingSend(user);
    // No tella equivalent — wallets auto-provision on onboarding, and
    // there's no "list beneficiaries" feature yet.
    case "CREATE_WALLET":
    case "LIST_CONTACTS":
    case "UNKNOWN":
    default:
      // Help them recover with the quick menu.
      return { reply: pickReply(REPLIES.unknown, { name }), interactive: "buttons" };
  }
}

/**
 * Issue a recovery link over WhatsApp.
 *
 * Possession of this WhatsApp account is the authenticating factor — the
 * same basis the confirm links already run on. What keeps that acceptable
 * is that the link is single-use, expires in ten minutes, and issuing one
 * is rate-limited: without the limit, anyone who could reach the bot could
 * flood the user's chat with reset links until one got tapped by mistake.
 *
 * Deliberately does NOT say whether the account currently has a PIN or a
 * passkey. That is a fact about someone's security setup and the reply goes
 * to whoever holds the phone.
 */
async function startPinReset(user: tellaUser): Promise<HandlerResult> {
  const name = firstName(user);

  const attempt = await recordAuthAttempt(user.id, "pin_reset");
  if (!attempt.allowed) {
    return {
      reply: [
        `You've asked for a few of these already, ${name}.`,
        "",
        `Try again in ${formatRetryAfter(attempt.retryAfterSeconds)} — the last link I sent may still be valid.`,
      ].join("\n"),
    };
  }

  let url: string;
  try {
    const token = await createResetToken(user.id);
    url = buildResetUrl(token.id);
  } catch (err) {
    console.error("[security] reset token creation failed", {
      userId: user.id,
      err,
    });
    return {
      reply: "I couldn't start that just now. Try again in a moment.",
    };
  }

  console.log("[security] reset link issued", { userId: user.id });

  return {
    reply: [
      `No problem, ${name} — here's a link to set a new PIN 🔐`,
      "",
      url,
      "",
      `It works once and expires in ${RESET_TTL_MINUTES} minutes.`,
      "",
      "If you didn't ask for this, ignore it — nothing changes until someone opens that link and sets a new PIN.",
    ].join("\n"),
  };
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

// Reads deliberately ignore the freeze. A frozen user still needs their
// receiving address and their balance, and needs them most right after
// freezing, while working out what happened. See lib/users/wallet-gate.ts.
function addressReply(user: tellaUser): Pick<HandlerResult, "reply" | "followUp"> {
  const name = firstName(user);
  if (gateWalletReady(user).ok && user.wallet_address) {
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
  intent: ParsedSendIntent | null;
}): Promise<HandlerResult> {
  if (!intent)
    return {
      reply:
        'I couldn\'t understand that send instruction. Try "send 5 usdc to +234..." or "send 5 usdc to Chidi".',
    };

  const gate = gateSpend(user);
  if (!gate.ok) {
    if (gate.reason === "frozen") return frozenReply(firstName(user));
    return {
      reply:
        "Your wallet isn't ready yet. Once it's set up you'll be able to send.",
    };
  }

  let recipientAddress: string;
  let recipientName: string | null = null;
  let recipientUserId: string | null = null;
  let recipientWhatsappNumber: string | null = null;

  if (intent.recipient.kind === "invalid_phone") {
    // Reported as a malformed NUMBER, not as a missing beneficiary. The old
    // behaviour sent someone who mistyped a digit off to check their saved
    // contacts, which is the wrong place to look.
    return {
      reply: [
        `"${intent.recipient.typed}" doesn't look like a complete phone number.`,
        "",
        "Include the country code, like +234 801 234 5678. Or send to a wallet address, or a name you've saved.",
      ].join("\n"),
    };
  }

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

    // gateWalletReady, not gateSpend: this is the RECIPIENT's row. Freezing
    // is about outbound only, so a frozen user can still be paid, and
    // refusing here would leak their security state to the sender.
    if (!gateWalletReady(recipient).ok || !recipient.wallet_address) {
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

  // Checked here so an unaffordable or over-cap send is refused with a
  // useful message BEFORE a confirm link is minted — being told "insufficient
  // balance" after tapping through a biometric prompt is a worse experience
  // than being told now. executePendingSend re-checks authoritatively.
  const limits = await checkSendLimits({ user, amount: intent.amount });
  if (!limits.ok) {
    return { reply: formatLimitFailure(limits.failure), interactive: "buttons" };
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

/**
 * The reply every spend path gives a frozen account. One wording, one place,
 * so a user who hits the wall from three directions is told the same thing
 * three times rather than three different things.
 */
function frozenReply(name: string): HandlerResult {
  return {
    reply: [
      `Your account is frozen, ${name}, so I can't send anything.`,
      "",
      "Nothing has left your wallet. You can still check your balance and receive money.",
      "",
      "Reply *unfreeze* when you want it lifted and I'll walk you through it.",
    ].join("\n"),
  };
}

/**
 * Turn outbound money off, now.
 *
 * Requires no factor and no confirmation on purpose. Someone whose phone has
 * just been taken has seconds, not minutes, and an attacker who freezes an
 * account has achieved nothing an attacker wants. The asymmetry is the whole
 * design: see migrations/0012_account_freeze.sql.
 */
async function handleFreezeRequest(user: tellaUser): Promise<HandlerResult> {
  const name = firstName(user);

  if (isFrozen(user)) {
    return {
      reply: [
        `Your account is already frozen, ${name}. Nothing can leave your wallet.`,
        "",
        "Reply *unfreeze* when you want it lifted.",
      ].join("\n"),
    };
  }

  let cancelled = 0;
  try {
    ({ cancelledSends: cancelled } = await freezeAccount({
      userId: user.id,
      source: "whatsapp",
      reason: "user requested via chat",
    }));
  } catch (err) {
    // Say so plainly. Telling someone their money is safe when the freeze
    // did not apply is the worst outcome available here.
    console.error("[freeze] request failed", { userId: user.id, err });
    return {
      reply: [
        "I couldn't freeze your account just then, and I don't want to tell you it's safe when I'm not sure.",
        "",
        "Try again right now — reply *freeze*.",
      ].join("\n"),
    };
  }

  // The cancellation count is surfaced rather than swallowed: those were
  // real transfers the user had started, and money quietly disappearing from
  // a flow they began is not something to be terse about.
  const cancelledNote =
    cancelled === 0
      ? "You had no pending sends waiting."
      : cancelled === 1
        ? "I also cancelled the 1 pending send you had waiting."
        : `I also cancelled the ${cancelled} pending sends you had waiting.`;

  return {
    reply: [
      `🔒 Frozen. Nothing can leave your wallet, ${name}.`,
      "",
      cancelledNote,
      "",
      "You can still check your balance and receive money as normal.",
      "",
      "Reply *unfreeze* when you want it lifted.",
    ].join("\n"),
  };
}

async function getBalanceReply(
  user: tellaUser,
): Promise<Pick<HandlerResult, "reply" | "followUp">> {
  const name = firstName(user);

  const gate = gateWalletReady(user);
  if (!gate.ok) {
    return { reply: pickReply(REPLIES.walletNotReady, { name }) };
  }

  let balances;
  try {
    balances = await getWalletBalances(gate.walletId);
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
