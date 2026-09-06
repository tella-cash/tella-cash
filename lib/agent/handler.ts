import type {
  tellaUser,
  PendingAction,
  PendingSend,
  FreezeSource,
} from "@/lib/supabase/types";
import {
  completeOnboarding,
  findUserByWhatsApp,
} from "@/lib/users/repository";
import {
  getActivePending,
  deletePending,
  createPending,
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
  listBeneficiaries,
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
import { isUnfreezeRequest } from "@/lib/agent/detect-unfreeze-request";
import { gateSpend, gateWalletReady, isFrozen } from "@/lib/users/wallet-gate";
import { freezeAccount } from "@/lib/users/freeze";
import { cancelHeldSend, listHoldingForUser } from "@/lib/held_sends/repository";
import { factorCount, factorsPredating } from "@/lib/auth/factors";
import {
  createResetToken,
  buildResetUrl,
  RESET_TTL_MINUTES,
} from "@/lib/security/reset-tokens";
import { recordAuthAttempt, formatRetryAfter } from "@/lib/auth/rate-limit";
import { classifyRecipient, type ParsedSendIntent } from "@/lib/agent/parse-send";
import { mapDecodedSend } from "@/lib/agent/map-decoded-send";
import { normalizeFaucetAsset } from "@/lib/agent/normalize-faucet-asset";
import {
  decode,
  decodeFollowUp,
  flowStart,
  SendamUnavailableError,
  type FollowUpSlots,
} from "@/lib/sendam-ai/client";
import { fastPathDecode, stripCommandPrefix } from "@/lib/agent/fast-path";
import { checkConfidence, sanitizeModelReply } from "@/lib/agent/confidence";
import {
  SAVE_BENEFICIARY_FLOW,
  FAUCET_ASSET_FLOW,
  FAUCET_ASSET_AWAITING,
  nextQuestionFor,
} from "@/lib/sendam-ai/flows";
import { REPLIES, pickReply } from "@/lib/agent/replies";
import { PROVIDERS } from "@/lib/messaging/providers";
import type { MessageProvider } from "@/lib/messaging/processed-messages";
import {
  QUICK_CHOICES,
  MENU_CHOICES,
  FREEZE_CHOICES,
  type Choice,
} from "@/lib/agent/menus";
import {
  isAffirmation,
  isDeclination,
  isNegation,
  isConfirmPayload,
} from "@/lib/agent/confirm-action";
import { hasCommandKeyword } from "@/lib/agent/detect-command-keyword";
import {
  ABANDONED_REPLY,
  amountPrompt,
  amountRetryPrompt,
  beneficiaryChoices,
  isSendFlowPayload,
  parseSendAmount,
  parseSendReply,
  recipientPrompt,
  recipientPromptWithAmount,
} from "@/lib/agent/send-flow";
import { buildConfirmUrl } from "@/lib/confirm/url";

interface IncomingMessage {
  user: tellaUser;
  text: string;
  isNew: boolean;
  /**
   * Which channel this arrived on.
   *
   * Nothing here branches on it — that is the whole point of
   * lib/messaging/providers.ts. It is carried, not consulted: recorded on a
   * freeze so the audit trail says where the kill switch was pulled, and on
   * a pending send so the confirm page can return the user to the chat they
   * started in rather than to WhatsApp by default.
   */
  origin?: MessageProvider;
}

export interface HandlerResult {
  reply: string;
  /**
   * Tap-to-choose options.
   *
   * Deliberately NOT a widget name. This used to be
   * `interactive: "buttons" | "list"`, which named two Meta message types
   * and meant every other channel either implemented Meta's vocabulary or
   * got nothing. Each provider now draws these however it can — quick
   * replies, a list picker, an inline keyboard, or a line of plain text —
   * and lib/messaging/render.ts owns the fallback.
   *
   * The contract that makes it work: a tap must arrive back as inbound text
   * equal to the choice's `title`, so nothing downstream can tell a tap from
   * typing. See lib/agent/menus.ts.
   */
  choices?: Choice[];
  /**
   * A single call-to-action link. Rendered as a tappable button where the
   * channel has one, and appended to the message where it does not.
   */
  link?: { label: string; url: string };
  /**
   * A second plain-text message sent immediately after `reply`, for
   * content that should stand alone in its own bubble — a wallet address,
   * so a long-press → Copy grabs exactly that and nothing else mixed in
   * from surrounding sentence text.
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
  // Falls back to the channel recorded on the user row, which is the right
  // default for a caller that does not say: it is where they were last seen.
  const origin: MessageProvider = message.origin ?? user.whatsapp_channel;

  if (isNew) {
    return {
      reply: [
        "👋 Welcome to tella!",
        "",
        "Send and receive USDC right here in chat — no exchange, no app, no seed phrase to lose. I'll set your wallet up in about 30 seconds.",
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

  // The local detectors below are matched against the text with one leading
  // slash removed, so /freeze is the kill switch and not an unrecognised
  // string. Registering these in Telegram's command menu puts them one tap
  // away, and a menu entry that silently does nothing is worse than no menu
  // entry — isFreezeRequest anchors on "^\s*freeze$", which "/freeze" does
  // not match. Only the detectors see this; the decoder still gets the user's
  // own words.
  const command = stripCommandPrefix(text.trim());

  // A backend-initiated multi-turn flow (e.g. beneficiary-save) is a short,
  // mandatory back-and-forth — every message must be captured until it
  // resolves. Pending *sends* are deliberately NOT intercepted here: a user
  // can have several at once, and typing a new "send X to Y" while one is
  // outstanding must start a fresh one rather than being swallowed by an
  // old prompt (see handleOnboardedUser, which checks for a structured send
  // before anything pending-send-related).
  const pending = await getActivePending(user.id);

  // A proposed destructive action outranks everything, including a fresh
  // freeze request: someone who typed "freeze", read the prompt and typed
  // "freeze" again means yes, not start over. Resolved with no decoder call
  // at all — see lib/agent/confirm-action.ts for why that is not an
  // optimisation but a requirement.
  if (pending?.kind === "confirm") {
    const resolution = await resolvePendingConfirmation({ user, pending, text });
    if (resolution) return resolution;
    // Fell through: the message was not an answer. The row is gone and the
    // message gets handled normally below, rather than being scolded for
    // arriving at the wrong moment.
  }

  // Checked before the pending-flow interception below, not after. A user
  // halfway through "save this recipient?" whose phone has just been stolen
  // must not have "freeze" swallowed as an answer to a beneficiary prompt.
  // This is also matched before any decoder runs, for the reason
  // detect-freeze-request.ts gives: the kill switch cannot depend on a
  // network call to a service that may be the thing that is down.
  if (isFreezeRequest(command)) return startFreezeConfirmation(user, origin);

  if (isUnfreezeRequest(command)) return handleUnfreezeRequest(user, origin);

  if (isTelegramLinkRequest(command)) return handleTelegramLinkRequest(user, origin);

  if (isGoogleLinkRequest(command)) return handleGoogleLinkRequest(user, origin);

  // Sits below the kill switch and above the decoder-backed flows. Below,
  // because someone mid-send whose phone has just been taken must reach
  // "freeze" without first having to finish or abandon a payment. Above,
  // because this flow captures plain answers — a bare "5" is an amount here
  // and nothing anywhere else.
  if (pending?.kind === "send") {
    return handleSendFlowResponse({ user, pending, text, origin });
  }

  if (pending?.kind === "flow") {
    return handleFlowPendingResponse({ user, pending, text, origin });
  }

  return handleOnboardedUser({ user, text, origin });
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
  origin,
}: {
  user: tellaUser;
  pending: PendingAction;
  text: string;
  origin: MessageProvider;
}): Promise<HandlerResult> {
  const name = firstName(user);

  if (isConfirmPayload(pending.payload) || isSendFlowPayload(pending.payload)) {
    // Unreachable via the dispatcher, which routes on `kind`. Guarded anyway
    // so a row whose kind and payload disagree cannot be read as a flow.
    console.error("[flow] non-flow payload on a flow row", { id: pending.id });
    await deletePending(pending.id);
    return { reply: pickReply(REPLIES.unknown, { name }), choices: QUICK_CHOICES };
  }

  const { flow, token } = pending.payload;
  const failures = pending.payload.failures ?? 0;

  // The beneficiary prompt is a courtesy question, not an interrogation. If
  // the next message is plainly a new request — "balance", "send 5 to
  // chidi" — it is not an answer, and feeding it to the flow decoder to be
  // told what it means about beneficiaries is both wrong and slow. Drop the
  // prompt, say so, and do the thing they actually asked for.
  //
  // Deliberately before decodeFollowUp: no round-trip, and it still works
  // when sendam-ai is down. Scoped to this flow — the faucet flow's single
  // question is part of an action the user just asked for, so it keeps
  // capturing replies as before.
  if (flow === SAVE_BENEFICIARY_FLOW && hasCommandKeyword(text)) {
    await deletePending(pending.id);
    const next = await handleOnboardedUser({ user, text, origin });
    return {
      ...next,
      reply: `Dropping the beneficiary save for now.\n\n${next.reply}`,
    };
  }

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
        choices: QUICK_CHOICES,
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
    // Still at the yes/no step, and the decoder could not read the reply as
    // either. The keyword check above already ruled out a new request, so
    // the most likely thing the user just typed is the name they want the
    // recipient saved under — they answered the question they thought we
    // asked. Offer that reading back rather than repeating ourselves.
    if (flow === SAVE_BENEFICIARY_FLOW && result.slots["confirmed"] == null) {
      const candidate = await proposeCandidateLabel({ user, result, text });
      if (candidate) return candidate;
    }

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
  return { reply: pickReply(REPLIES.unknown, { name }), choices: QUICK_CHOICES };
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
 * Reads an unrecognised reply to "save this recipient?" as the name the
 * user wants them saved under, and asks them to confirm just that.
 *
 * Mints a fresh token whose only open slot is `confirmed`, carrying the
 * proposed name in the slots — so a "yes" comes back COMPLETE with
 * beneficiaryName already resolved and completeSaveBeneficiaryFlow saves it
 * (still through isValidBeneficiaryLabel), and a "no" is caught by the
 * decline check above. No new completion path needed.
 *
 * Returns null when it cannot make the offer, and the caller falls back to
 * plainly re-asking for a yes or a no.
 */
async function proposeCandidateLabel({
  user,
  result,
  text,
}: {
  user: tellaUser;
  result: Extract<Awaited<ReturnType<typeof decodeFollowUp>>, { status: "IN_PROGRESS" }>;
  text: string;
}): Promise<HandlerResult | null> {
  const candidate = text.trim();

  // Someone typing a paragraph is not proposing a name, and quoting it back
  // in full would be nonsense. isValidBeneficiaryLabel caps at 30; this is
  // looser on purpose so a slightly-too-long name still gets the offer and
  // the specific "that doesn't look like a name I can save" reply.
  if (!candidate || candidate.length > 60) return null;

  // The address lives in the slots we seeded at flow start. If it did not
  // come back, there is nothing to save the name against.
  const recipientAddress = result.slots["recipientAddress"];
  if (typeof recipientAddress !== "string" || !recipientAddress) return null;

  try {
    const { token } = await flowStart(
      SAVE_BENEFICIARY_FLOW,
      { ...result.slots, beneficiaryName: candidate },
      [
        {
          slot: "confirmed",
          type: "CONFIRMATION",
          description: "save this recipient under that name?",
        },
      ],
    );
    await createPendingFlow({ userId: user.id, flow: SAVE_BENEFICIARY_FLOW, token });
  } catch (err) {
    // Same reason reissueNamePrompt swallows this: an uncaught throw here is
    // total silence on the Meta channel, which has no fallback message.
    console.error("[agent] flowStart failed", { userId: user.id, flow: SAVE_BENEFICIARY_FLOW, err });
    return null;
  }

  return {
    reply: [
      `Did you mean to save them as *${candidate}*?`,
      "",
      "Reply *yes* to save it, or *no* to skip.",
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

/** A confirm-send prompt + the link that opens the confirm page. */
function confirmResult(pending: PendingSend): HandlerResult {
  return {
    reply: buildConfirmBody(pending),
    link: { label: "Confirm send", url: buildConfirmUrl(pending.id) },
  };
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
  origin,
}: {
  user: tellaUser;
  text: string;
  origin: MessageProvider;
}): Promise<HandlerResult> {
  const name = firstName(user);
  const trimmed = text.trim();

  if (!trimmed)
    return { reply: pickReply(REPLIES.empty, { name }), choices: QUICK_CHOICES };

  // Debug health-check stays deterministic.
  if (trimmed.toLowerCase() === "ping") return { reply: "pong ✓" };

  // The other half of the promise buildConfirmBody makes.
  //
  // "Reply *no* to cancel" was printed under every confirm link and nothing
  // listened for it: a pending send is a tella_pending_send row, and the only
  // declination check in this file reads tella_pending_action, which a send
  // never creates. So "no" reached the decoder, came back UNKNOWN, and the
  // user got the generic help menu — while the link they were trying to kill
  // stayed live. Matched before the decoder for the same reason freeze and
  // reset are: cancelling must not depend on a service that may be down.
  //
  // Gated on there actually being something to cancel, so a conversational
  // "no" with nothing pending is still handled normally below.
  if (isNegation(trimmed)) {
    const pendingSends = await listActivePendingSends(user.id);
    if (pendingSends.length > 0) return cancelMostRecentPendingSend(user);
  }

  // Matched before decode() on purpose — see detect-reset-request.ts. A
  // locked-out user must get the recovery link even when sendam-ai is down.
  if (isResetRequest(trimmed)) return startPinReset(user, origin);

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
          choices: QUICK_CHOICES,
        };
      }

      return { reply: pickReply(REPLIES.unknown, { name }), choices: QUICK_CHOICES };
    }
  }

  // Confidence is finally consulted. Until now it was decoded, typed and
  // ignored, so a SEND parsed at 0.4 minted a confirm link exactly as
  // readily as one parsed at 0.99. Tier 0 returns 1 by construction, so this
  // only ever constrains the tier that guesses.
  const verdict = checkConfidence(decoded);
  if (!verdict.ok) {
    if (verdict.reason === "confirm_send") {
      // Readable but not certain. Reading it back is far more useful than
      // "I didn't understand", and no confirm link exists until they agree.
      return {
        reply: [
          `Did you mean *send ${verdict.amount} USDC to ${verdict.recipient}*?`,
          "",
          "Send that again if so, and I'll set it up.",
        ].join("\n"),
      };
    }
    return { reply: pickReply(REPLIES.unknown, { name }), choices: QUICK_CHOICES };
  }

  // A structured send carries real parameters (amount + recipient), so it
  // always wins over the general intent switch below.
  const sendIntent: ParsedSendIntent | null = mapDecodedSend(decoded);
  if (sendIntent) return startSendFlow({ user, intent: sendIntent, origin });

  switch (decoded.intent) {
    case "BALANCE":
      return { ...(await getBalanceReply(user)), choices: QUICK_CHOICES };
    case "ADDRESS":
      return { ...addressReply(user), choices: QUICK_CHOICES };
    case "HISTORY":
      return { reply: await getHistoryReply(user), choices: QUICK_CHOICES };
    case "SEND":
      // Reached when mapDecodedSend refused, which it does unless BOTH an
      // amount and a recipient were read. That covers a tapped Send button and
      // /send (nothing to read) as well as "send 5" or "send money to chidi"
      // (half read). Whatever was understood seeds the flow.
      return startGuidedSend(user, origin, {
        amount: decoded.amount,
        recipient: decoded.recipient,
      });
    case "GREETING":
      // sendam-ai reads the tone of the user's own greeting and composes a
      // matching reply; fall back to our fixed template on older deploys
      // that don't send one yet.
      return {
        reply:
          sanitizeModelReply(decoded.reply) ?? pickReply(REPLIES.greeting, { name }),
        choices: QUICK_CHOICES,
      };
    case "HELP":
      // Fuller menu with descriptions.
      return { reply: pickReply(REPLIES.help, { name }), choices: MENU_CHOICES };
    case "ABOUT":
      return { reply: pickReply(REPLIES.about, { name }), choices: QUICK_CHOICES };
    case "HOW_IT_WORKS":
      return { reply: pickReply(REPLIES.howItWorks, { name }), choices: QUICK_CHOICES };
    case "FEES":
      return { reply: pickReply(REPLIES.fees, { name }), choices: QUICK_CHOICES };
    case "SECURITY":
      return { reply: pickReply(REPLIES.security, { name }), choices: QUICK_CHOICES };
    case "FAUCET":
      return handleFaucetIntent({ user, asset: decoded.asset });
    case "THANKS":
      return { reply: pickReply(REPLIES.thanks, { name }), choices: QUICK_CHOICES };
    case "GOODBYE":
      // No menu on a sign-off — let the conversation rest.
      return { reply: pickReply(REPLIES.goodbye, { name }) };
    case "AFFIRM":
      return { reply: pickReply(REPLIES.affirm, { name }), choices: QUICK_CHOICES };
    case "CANCEL":
      return cancelMostRecent(user);
    // No tella equivalent — wallets auto-provision on onboarding, and
    // there's no "list beneficiaries" feature yet.
    case "CREATE_WALLET":
    case "LIST_CONTACTS":
    case "UNKNOWN":
    default:
      // Help them recover with the quick menu.
      return { reply: pickReply(REPLIES.unknown, { name }), choices: QUICK_CHOICES };
  }
}

/**
 * Issue a recovery link.
 *
 * Possession of the account this arrived on is the authenticating factor —
 * the
 * same basis the confirm links already run on. What keeps that acceptable
 * is that the link is single-use, expires in ten minutes, and issuing one
 * is rate-limited: without the limit, anyone who could reach the bot could
 * flood the user's chat with reset links until one got tapped by mistake.
 *
 * Deliberately does NOT say whether the account currently has a PIN or a
 * passkey. That is a fact about someone's security setup and the reply goes
 * to whoever holds the phone.
 */
async function startPinReset(
  user: tellaUser,
  origin: MessageProvider,
): Promise<HandlerResult> {
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
    const token = await createResetToken(user.id, "pin_reset", origin);
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
    return { reply: pickReply(REPLIES.cancelNothing, { name }), choices: QUICK_CHOICES };
  }

  const latest = pendingSends[0];
  await deletePendingSend(latest.id);

  const p = latest.payload;
  const recipientLabel = p.recipientName ?? p.recipientAddress;
  const remaining = pendingSends.length - 1;
  const remainingNote =
    remaining > 0
      ? ` You still have ${remaining} other pending send${remaining > 1 ? "s" : ""} — reply *no* or *cancel* again to drop the next one.`
      : "";

  return {
    reply: `Cancelled your pending send of ${p.amount} USDC to ${recipientLabel}.${remainingNote}`,
    choices: QUICK_CHOICES,
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

/**
 * "I don't know that name" — and the saved list again, so the correction is a
 * tap rather than a second guess.
 *
 * The pending row is deliberately left in place: the user is still answering
 * "who are you sending to?", and dropping the flow here would make a typo cost
 * them the whole send.
 */
async function unknownRecipientReply(
  user: tellaUser,
  label: string,
): Promise<HandlerResult> {
  let saved: Awaited<ReturnType<typeof listBeneficiaries>> = [];
  try {
    saved = await listBeneficiaries(user.id);
  } catch (err) {
    console.error("[send-flow] beneficiary lookup failed", { userId: user.id, err });
  }

  const choices = beneficiaryChoices(saved);
  return {
    reply: [
      `I don't have anyone saved as "${label}".`,
      "",
      choices.length > 0
        ? "Tap one of these, or send a phone number or 0x address instead."
        : "Send me a phone number with the country code, or a 0x wallet address.",
    ].join("\n"),
    ...(choices.length > 0 ? { choices } : {}),
  };
}

/**
 * Drive the guided send one answer at a time.
 *
 * ONE function for every entry into the flow — the Send button, /send, "send
 * usdc", a decoder SEND with half its slots, and each reply inside the flow —
 * because the decision is the same every time and it is a decision about where
 * money goes. Two copies of "do I have enough to proceed" is how one of them
 * ends up proceeding on less.
 *
 * The rule: hold what is known, ask for exactly what is missing, and only hand
 * off to startSendFlow when both fields are in hand. startSendFlow stays the
 * single path from an intent to a confirm link; nothing here mints one.
 */
async function advanceSendFlow({
  user,
  origin,
  amount,
  recipient,
  pendingId,
}: {
  user: tellaUser;
  origin: MessageProvider;
  /** Whatever is known so far. Either may be null; both may be null. */
  amount: string | null;
  recipient: string | null;
  /** The flow row to clear once both fields are in hand. */
  pendingId?: string;
}): Promise<HandlerResult> {
  const gate = gateSpend(user);
  if (!gate.ok) {
    if (pendingId) await deletePending(pendingId);
    if (gate.reason === "frozen") return frozenReply(firstName(user));
    return {
      reply: "Your wallet isn't ready yet. Once it's set up you'll be able to send.",
    };
  }

  // A seeded amount comes from the decoder and is only as good as the decoder.
  // Re-parsed with the same anchored pattern a typed answer gets, so an
  // unusable one is treated as absent and asked for rather than carried.
  const known = amount ? parseSendAmount(amount) : null;

  const remember = async (
    step: "recipient" | "amount",
    payload: { amount?: string; recipient?: string },
  ) => {
    await createPending({
      userId: user.id,
      kind: "send",
      payload: { action: "send", step, ...payload },
      ttlMinutes: 10,
    });
  };

  if (recipient) {
    // Checked here as well as in startSendFlow, and for the reason
    // checkSendLimits is: this one is advisory and exists so the message is
    // useful. Catching a mistyped number NOW costs one message; catching it
    // after the amount question costs two and makes the user retype both.
    const classified = classifyRecipient(recipient);

    if (classified.kind === "invalid_phone") {
      await remember("recipient", known ? { amount: known } : {});
      return {
        reply: [
          `"${classified.typed}" doesn't look like a complete phone number.`,
          "",
          "Include the country code, like +234 801 234 5678 — or send a 0x wallet address, or a name you've saved.",
        ].join("\n"),
      };
    }

    if (classified.kind === "label") {
      const saved = await findBeneficiaryByLabel(user.id, classified.label);
      if (!saved) {
        await remember("recipient", known ? { amount: known } : {});
        return unknownRecipientReply(user, classified.label);
      }
    }

    if (known) {
      // Both fields. The flow is over; the row goes before startSendFlow so a
      // failure there leaves the user free to start again rather than trapped
      // answering a question that has already been answered.
      if (pendingId) await deletePending(pendingId);
      return startSendFlow({
        user,
        intent: { amount: known, token: "USDC", recipient: classified },
        origin,
      });
    }

    await remember("amount", { recipient });
    return { reply: amountPrompt(recipient) };
  }

  // No recipient yet. Offer the saved names either way — best-effort, since a
  // lookup failing is a reason to ask for a number instead of a reason to
  // refuse to start a send.
  let saved: Awaited<ReturnType<typeof listBeneficiaries>> = [];
  try {
    saved = await listBeneficiaries(user.id);
  } catch (err) {
    console.error("[send-flow] beneficiary lookup failed", { userId: user.id, err });
  }

  try {
    await remember("recipient", known ? { amount: known } : {});
  } catch (err) {
    // Without the row the next message has nothing to answer, so the question
    // would go unheard. Say what still works rather than ask it anyway.
    console.error("[send-flow] could not start", { userId: user.id, err });
    return {
      reply: pickReply(REPLIES.sendHelp, { name: firstName(user) }),
      choices: QUICK_CHOICES,
    };
  }

  const choices = beneficiaryChoices(saved);
  return {
    reply: known
      ? recipientPromptWithAmount(known, choices.length > 0)
      : recipientPrompt(choices.length > 0),
    ...(choices.length > 0 ? { choices } : {}),
  };
}

/**
 * The SEND intent, with whatever the decoder managed to extract.
 *
 * Reached for a tapped Send button and /send (no slots at all), and for a
 * partially-read instruction like "send 5" or "send money to chidi" — which
 * mapDecodedSend refuses, correctly, because it only produces a complete
 * intent. Seeding the flow with the half that was understood is the difference
 * between "how much to Chidi?" and starting over.
 */
async function startGuidedSend(
  user: tellaUser,
  origin: MessageProvider,
  seed: { amount: string | null; recipient: string | null } = {
    amount: null,
    recipient: null,
  },
): Promise<HandlerResult> {
  return advanceSendFlow({
    user,
    origin,
    amount: seed.amount,
    recipient: seed.recipient?.trim() || null,
  });
}

/**
 * One answer inside the guided send.
 *
 * Two escape hatches, both matched before anything else:
 *
 *   - a negation or a cancel abandons the flow. Nothing has been created yet,
 *     so this genuinely costs nothing and the reply says so.
 *   - a closed-set command means the user has stopped answering and started
 *     asking for something else, so the flow gets out of the way rather than
 *     repeating its question until the row expires.
 *
 * Everything else is read for slots. A reply is not required to answer only
 * the question that was asked: "5 to chidi" at the who step finishes the send,
 * and "5" at the who step is remembered while we ask again who.
 */
async function handleSendFlowResponse({
  user,
  pending,
  text,
  origin,
}: {
  user: tellaUser;
  pending: PendingAction;
  text: string;
  origin: MessageProvider;
}): Promise<HandlerResult> {
  const trimmed = text.trim();

  if (!isSendFlowPayload(pending.payload)) {
    console.error("[send-flow] malformed payload", { id: pending.id });
    await deletePending(pending.id);
    return {
      reply: pickReply(REPLIES.unknown, { name: firstName(user) }),
      choices: QUICK_CHOICES,
    };
  }

  if (isNegation(trimmed) || isDeclination(trimmed)) {
    await deletePending(pending.id);
    return { reply: ABANDONED_REPLY, choices: QUICK_CHOICES };
  }

  const carried = pending.payload;

  // A saved name always wins over any splitting. "Landlord 2" is a
  // beneficiary, not a landlord and two dollars — and only the address book
  // knows that, which is why parseSendReply cannot decide it alone.
  let savedWhole = null;
  try {
    savedWhole = trimmed ? await findBeneficiaryByLabel(user.id, trimmed) : null;
  } catch (err) {
    console.error("[send-flow] beneficiary lookup failed", { userId: user.id, err });
  }

  // A closed-set command means the user has stopped answering and started
  // asking for something else, so the flow gets out of the way rather than
  // repeating its question until the row expires.
  //
  // It has to be checked HERE, before the reply is read for slots. Every
  // single word parses as a recipient — that is what the question asked for —
  // so a check placed after parsing would only ever fire on an empty message,
  // and "balance" would come back as "I don't have anyone saved as balance".
  //
  // Two conditions on it. Skipped when the reply IS a saved name, so someone
  // whose landlord is saved as "Balance" gets their landlord. And skipped for
  // SEND, because a whole instruction typed mid-flow — "send 5 to chidi" — is
  // an answer rather than an escape, and advanceSendFlow below handles it.
  if (!savedWhole) {
    const fast = fastPathDecode(trimmed);

    if (fast && fast.intent !== "SEND") {
      await deletePending(pending.id);
      const next = await handleOnboardedUser({ user, text: trimmed, origin });
      return { ...next, reply: `Dropping that send for now.\n\n${next.reply}` };
    }

    // Send tapped again, or /send typed again, while already in the flow. It
    // carries no slots, so reading it for them would take the button's own
    // label as a recipient and answer "I don't have anyone saved as Send".
    // Re-ask instead, keeping whatever has already been given.
    if (fast && fast.intent === "SEND" && !fast.amount && !fast.recipient) {
      return advanceSendFlow({
        user,
        origin,
        amount: carried.amount ?? null,
        recipient: carried.recipient ?? null,
        pendingId: pending.id,
      });
    }
  }

  const slots = savedWhole
    ? { amount: null, recipient: trimmed }
    : parseSendReply(trimmed);

  // Nothing usable at all — an empty or whitespace reply. Ask again for
  // whichever field is still missing.
  if (!slots.amount && !slots.recipient) {
    return {
      reply: carried.recipient
        ? amountRetryPrompt(carried.recipient)
        : recipientPrompt(false),
    };
  }

  // At the amount step a bare name is a correction, not an amount — so the
  // reply's own recipient wins over the one already held.
  return advanceSendFlow({
    user,
    origin,
    amount: slots.amount ?? carried.amount ?? null,
    recipient: slots.recipient ?? carried.recipient ?? null,
    pendingId: pending.id,
  });
}

async function startSendFlow({
  user,
  intent,
  origin,
}: {
  user: tellaUser;
  intent: ParsedSendIntent | null;
  origin: MessageProvider;
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
    return { reply: formatLimitFailure(limits.failure), choices: QUICK_CHOICES };
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
      origin,
    },
  });

  return confirmResult(pending);
}

/**
 * Lift a freeze, from the channel the user is already on.
 *
 * This was missing, and its absence locked a real user out: the freeze
 * confirmation told them to reply "unfreeze" and nothing was listening. The
 * only path that existed went through Google, which they had never linked.
 *
 * WHY THIS IS SAFE OVER WHATSAPP, given the freeze exists to survive someone
 * holding the phone.
 *
 * It does not unfreeze anything on its own. It mints a single-use link to a
 * page that demands a PIN or passkey — the same bar the send path already
 * uses. An attacker who can satisfy it can already spend, so requiring it
 * here adds no new exposure.
 *
 * The factor must PREDATE the freeze, which is the part that does the work. A
 * frozen user may still reset their PIN (deliberately, to avoid a deadlock),
 * so without that rule an attacker could reset the PIN and use the one they
 * just chose to undo the freeze. Both steps are individually allowed; only
 * the timestamps separate them. See migrations/0019_pin_set_at.sql.
 */
async function handleUnfreezeRequest(
  user: tellaUser,
  origin: MessageProvider,
): Promise<HandlerResult> {
  const name = firstName(user);

  if (!isFrozen(user)) {
    return {
      reply: `Your account isn't frozen, ${name} — nothing to lift.`,
      choices: QUICK_CHOICES,
    };
  }

  const factors = await factorsPredating(user, user.frozen_at!);

  if (!factors.any) {
    // Honest rather than encouraging. There is nothing they can prove from
    // here, and pretending otherwise wastes the time of someone who may be
    // in the middle of a bad day.
    return {
      reply: [
        `I can't safely unfreeze this account from here, ${name}.`,
        "",
        "Lifting a freeze needs a PIN or Face ID that was set up before it happened, and this account doesn't have one.",
        "",
        "Reply *help* and a human will sort it out with you.",
      ].join("\n"),
    };
  }

  const token = await createResetToken(user.id, "unfreeze", origin);

  return {
    reply: [
      `Let's get you back in, ${name}.`,
      "",
      buildUnfreezeUrl(token.id),
      "",
      factors.passkey
        ? "Tap the link and confirm with Face ID or your fingerprint."
        : "Tap the link and enter your PIN.",
      "",
      "It works once and expires in 10 minutes.",
    ].join("\n"),
  };
}

function buildUnfreezeUrl(token: string): string {
  const base = process.env.APP_BASE_URL ?? "";
  return `${base.replace(/\/$/, "")}/security/unfreeze/${token}`;
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
 * Propose a freeze, and wait for one word.
 *
 * WHY THIS IS TWO MESSAGES NOW, since the previous version froze on sight
 * and argued at length that it should.
 *
 * That argument was right about the direction of the risk: an attacker who
 * freezes an account gains nothing, and someone whose phone has just been
 * taken has seconds. What it underweighted is how loose
 * detect-freeze-request.ts has to be to catch "someone took my phone" —
 * loose enough that it also catches people merely describing a problem.
 * Every one of those costs an unfreeze, which needs a factor predating the
 * freeze, which is exactly what most accounts here do not have. So the
 * accidental freeze was not a mild inconvenience; it was a lockout.
 *
 * The price is real and is not hedged: a freeze now takes two messages, and
 * if the phone is taken between them, nothing freezes. That is why the
 * panic code (/api/panic) keeps its no-confirmation path — a pre-registered
 * secret typed on purpose IS the confirmation — and why the copy below says
 * nothing has changed yet, in those words. See migration 0021.
 */
async function startFreezeConfirmation(
  user: tellaUser,
  origin: MessageProvider,
): Promise<HandlerResult> {
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

  try {
    // Upserts on user_id, so this displaces an in-flight beneficiary flow.
    // That is the right priority — someone reaching for the kill switch is
    // not still thinking about what to nickname a recipient — but it does
    // mean the flow is gone rather than resumed afterwards.
    await createPending({
      userId: user.id,
      kind: "confirm",
      payload: {
        action: "freeze",
        source: PROVIDERS[origin].freezeSource,
        reason: "user requested via chat",
      },
      ttlMinutes: 10,
    });
  } catch (err) {
    // Cannot record the intent, so cannot honour an answer to it. Better to
    // say so than to prompt for a confirmation that will not resolve.
    console.error("[freeze] could not start confirmation", { userId: user.id, err });
    return {
      reply: [
        "I couldn't set that up just then, and I don't want to leave you unsure.",
        "",
        "Try again right now — reply *freeze*.",
      ].join("\n"),
    };
  }

  return {
    reply: [
      `Do you want me to freeze your account, ${name}?`,
      "",
      "Nothing will be able to leave your wallet until you lift it, and I'll cancel anything waiting to go out. You'll still be able to receive money.",
      "",
      "Reply *FREEZE* to confirm. *Nothing has changed yet.*",
    ].join("\n"),
    choices: FREEZE_CHOICES,
  };
}

/**
 * Answer a proposed action.
 *
 * Returns null when the message was not an answer at all, and the caller
 * then handles it normally. Someone who replies "balance" to a freeze prompt
 * gets their balance — being told "please answer yes or no" by a wallet
 * during what might be an emergency is the wrong instinct in both directions.
 */
async function resolvePendingConfirmation({
  user,
  pending,
  text,
}: {
  user: tellaUser;
  pending: PendingAction;
  text: string;
}): Promise<HandlerResult | null> {
  if (!isConfirmPayload(pending.payload)) {
    // Kind and payload disagree. Drop it rather than act on a shape we
    // cannot read.
    console.error("[confirm] malformed payload", { userId: user.id, id: pending.id });
    await deletePending(pending.id);
    return null;
  }

  const affirmed = isAffirmation(text);
  const declined = isDeclination(text);

  if (!affirmed && !declined) {
    await deletePending(pending.id);
    return null;
  }

  // Cleared before acting, not after. A freeze that throws must not leave a
  // row that turns the user's next message into a second freeze attempt.
  await deletePending(pending.id);

  if (declined) {
    return {
      reply: [
        "Left as it is — nothing has changed.",
        "",
        "Reply *freeze* any time if you change your mind.",
      ].join("\n"),
      choices: QUICK_CHOICES,
    };
  }

  return executeFreeze(user, pending.payload.source, pending.payload.reason);
}

/**
 * Turn outbound money off.
 *
 * Requires no factor, and that part has not changed: an attacker who freezes
 * an account has achieved nothing an attacker wants, so demanding proof here
 * would only lock out the people this exists for. See
 * migrations/0012_account_freeze.sql.
 */
async function executeFreeze(
  user: tellaUser,
  source: FreezeSource,
  reason: string,
): Promise<HandlerResult> {
  const name = firstName(user);

  let cancelled = 0;
  let cancelledHolds = 0;
  try {
    ({ cancelledSends: cancelled, cancelledHolds } = await freezeAccount({
      userId: user.id,
      source,
      reason,
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
  const stopped: string[] = [];
  if (cancelled === 1) stopped.push("1 pending send");
  else if (cancelled > 1) stopped.push(`${cancelled} pending sends`);
  if (cancelledHolds === 1) stopped.push("1 queued transfer");
  else if (cancelledHolds > 1) stopped.push(`${cancelledHolds} queued transfers`);

  const cancelledNote =
    stopped.length === 0
      ? "You had nothing waiting to go out."
      : `I also stopped ${stopped.join(" and ")}.`;

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

/**
 * "cancel" means the nearest thing the user could plausibly want to stop.
 *
 * A queued 24-hour transfer comes first. It is the larger amount by
 * definition — that is why it was held — and it is the one the user cannot
 * see in the thread, so it is the one they are most likely to be reaching
 * for and the one it is worst to get wrong.
 */
async function cancelMostRecent(user: tellaUser): Promise<HandlerResult> {
  const holds = await listHoldingForUser(user.id);

  if (holds.length > 0) {
    // Soonest to fire, since that is the one with least time left to act on.
    const next = holds[0];
    const stopped = await cancelHeldSend({ id: next.id, cancelledBy: "user" });

    if (!stopped) {
      // Lost the race with the release job, which had already claimed it.
      // Saying "cancelled" here would be a lie about money.
      return {
        reply: [
          `That transfer was already on its way, so I couldn't stop it.`,
          "",
          "Reply *freeze* if something is wrong and I'll stop everything else.",
        ].join("\n"),
        choices: QUICK_CHOICES,
      };
    }

    const remaining = holds.length - 1;
    const note =
      remaining > 0
        ? ` You still have ${remaining} other queued transfer${remaining > 1 ? "s" : ""} — say "cancel" again to stop the next one.`
        : "";

    return {
      reply: `Cancelled the queued send of ${next.payload.amount} USDC to ${next.payload.recipientName ?? next.payload.recipientAddress}.${note}`,
      choices: QUICK_CHOICES,
    };
  }

  return cancelMostRecentPendingSend(user);
}

const GOOGLE_LINK_PATTERNS: RegExp[] = [
  /\b(link|connect|add|use)\b[^.!?]{0,16}\b(google|gmail|email)\b/i,
  /\b(google|gmail)\b[^.!?]{0,16}\b(link|account|backup)\b/i,
];

function isGoogleLinkRequest(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 80) return false;
  return GOOGLE_LINK_PATTERNS.some((p) => p.test(trimmed));
}

/**
 * Mint a link that attaches a Google account to this wallet.
 *
 * Gated on an existing factor, same as the Telegram link and for the same
 * reason: this attaches a credential that can later freeze the account, and
 * five minutes of phone access should not be enough to acquire one.
 *
 * Worth being clear about what the user is getting, because "sign in with
 * Google" usually means something much larger than this does. It is a way
 * back in when the phone is gone, and an address that a SIM swap does not
 * reach. It cannot send money and it cannot unfreeze on its own.
 */
async function handleGoogleLinkRequest(
  user: tellaUser,
  origin: MessageProvider,
): Promise<HandlerResult> {
  const name = firstName(user);

  if (isFrozen(user)) {
    return { reply: "Your account is frozen, so I can't link anything new to it right now." };
  }

  if ((await factorCount(user)) === 0) {
    return {
      reply: [
        `Before I connect a Google account, ${name}, let's put a lock on this one.`,
        "",
        "Start a send and you'll be asked to set up Face ID or a PIN. Then say *link google* again.",
      ].join("\n"),
    };
  }

  const base = process.env.APP_BASE_URL;
  if (!base) {
    console.error("[google] APP_BASE_URL is not set");
    return { reply: "That isn't set up yet on my side. Try again later." };
  }

  const token = await createResetToken(user.id, "link_google", origin);

  return {
    reply: [
      "Tap this to connect your Google account:",
      "",
      `${base.replace(/\/$/, "")}/api/auth/google/start?purpose=link&token=${token.id}`,
      "",
      "It works once and expires in 10 minutes.",
      "",
      "Once connected you can freeze your wallet from any device, even without this phone — and security alerts go to that email too. It can't send money.",
    ].join("\n"),
  };
}

/**
 * "link telegram", and the handful of ways people phrase it.
 *
 * Local rather than a decoder intent for the usual reason (it should work
 * during an outage) and one specific one: sendam-ai has a closed intent set
 * that knows nothing about channels, so this would land on UNKNOWN and get a
 * shrug.
 */
const TELEGRAM_LINK_PATTERNS: RegExp[] = [
  /\b(link|connect|add|use)\b[^.!?]{0,16}\btelegram\b/i,
  /\btelegram\b[^.!?]{0,16}\b(link|account|bot)\b/i,
];

function isTelegramLinkRequest(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 80) return false;
  return TELEGRAM_LINK_PATTERNS.some((p) => p.test(trimmed));
}

/**
 * Mint a single-use deep link that binds a Telegram chat to this account.
 *
 * Gated on an existing factor. Attaching a new way to reach a wallet is a
 * money-grade action — an attacker holding the phone for five minutes should
 * not be able to give themselves a channel that outlives their access to it.
 * A user with no factor yet is pointed at setting one up first, which is the
 * same funnel the enrollment prompt uses rather than a dead end.
 */
async function handleTelegramLinkRequest(
  user: tellaUser,
  origin: MessageProvider,
): Promise<HandlerResult> {
  const name = firstName(user);

  if (isFrozen(user)) {
    return {
      reply: "Your account is frozen, so I can't link a new channel to it right now.",
    };
  }

  if ((await factorCount(user)) === 0) {
    return {
      reply: [
        `Before I link another channel, ${name}, let's put a lock on this account.`,
        "",
        "Start a send and you'll be asked to set up Face ID or a PIN — it takes about ten seconds. Then say *link telegram* again.",
      ].join("\n"),
    };
  }

  // Normalised rather than trusted. BotFather displays the username as
  // "@cashtellaBot" and that is what gets pasted into env, but t.me links
  // take the bare name — https://t.me/@name is a dead link, and the failure
  // is a user tapping something that goes nowhere rather than an error
  // anybody sees. Also tolerates someone pasting the whole t.me URL.
  const botUsername = (process.env.TELEGRAM_BOT_USERNAME ?? "")
    .trim()
    .replace(/^https?:\/\/t\.me\//i, "")
    .replace(/^@/, "");

  if (!botUsername) {
    console.error("[telegram] TELEGRAM_BOT_USERNAME is not set");
    return { reply: "Telegram isn't set up yet on my side. Try again later." };
  }

  const token = await createResetToken(user.id, "link_telegram", origin);

  return {
    reply: [
      "Tap this to connect Telegram:",
      "",
      `https://t.me/${botUsername}?start=${token.id}`,
      "",
      "It works once and expires in 10 minutes. On Telegram you'll be able to check your balance and freeze your account — sending stays here.",
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
