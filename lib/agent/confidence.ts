import type { DecodedIntent } from "@/lib/sendam-ai/client";

/**
 * How much certainty an intent needs before it is allowed to act.
 *
 * `DecodedIntent.confidence` has been typed, returned by sendam-ai, and
 * plumbed through this codebase since the integration landed, and read by
 * nothing. A `SEND` parsed at 0.4 minted a confirm link exactly as readily as
 * one parsed at 0.99.
 *
 * The thresholds are asymmetric by consequence, not one global number,
 * because the intents are not equally expensive to get wrong:
 *
 *   - a misread `BALANCE` shows the wrong screen and costs one message
 *   - a misread `CANCEL` destroys a pending send the user wanted
 *   - a misread `SEND` proposes moving the wrong money to the wrong person
 *
 * Tier 0 returns confidence 1 by construction (it only fires on closed-set
 * exact matches), so none of this applies to it. This exists to put a floor
 * under the tier that guesses.
 */

const THRESHOLDS: Partial<Record<DecodedIntent["intent"], number>> = {
  // Real money. Below this we ask rather than assume.
  SEND: 0.85,
  // Destroys a pending send.
  CANCEL: 0.7,
  // Reads. Cheap to get wrong.
  BALANCE: 0.5,
  ADDRESS: 0.5,
  HISTORY: 0.5,
  FAUCET: 0.5,
};

// Conversational intents (GREETING, HELP, THANKS, ABOUT…) have no threshold.
// They produce a canned reply and nothing else, so demanding certainty about
// them would only convert a harmless wrong answer into an unhelpful one.

export type ConfidenceVerdict =
  | { ok: true }
  /** Certain enough to name, not certain enough to act. Ask instead. */
  | { ok: false; reason: "confirm_send"; amount: string; recipient: string }
  /** Not certain enough to name. Fall through to the generic reply. */
  | { ok: false; reason: "too_low" };

/**
 * The structural half of the score.
 *
 * A model can be confident and wrong in ways the payload itself reveals: an
 * amount that is not a finite positive number is not a 0.9 parse whatever the
 * decoder claims. So the effective confidence is the minimum of what was
 * claimed and what the fields support, and one obviously broken field cannot
 * ride in on a high score.
 *
 * MISSING SLOTS ARE NOT A BROKEN PARSE, and treating them as one was a real
 * bug rather than an over-cautious setting.
 *
 * This used to return 0 for a SEND with no amount, and again for one with no
 * recipient. But tapping the Send button, typing /send, or saying "send usdc"
 * all produce exactly that: intent SEND with both slots empty, at confidence 1
 * from tier 0, because they are unambiguous requests to START a send. Scoring
 * them 0 put them under the 0.85 threshold, so the switch in
 * handleOnboardedUser was never reached and the user got "I'm not totally sure
 * what you meant" — for the single most explicit thing this product does.
 *
 * The distinction that matters is between a PROPOSAL and an OPENING. The
 * threshold exists because a half-read transfer, acted on, moves the wrong
 * money to the wrong person. A SEND carrying no slots proposes nothing and
 * moves nothing; it opens a conversation, and the guided flow asks for
 * whatever is missing before anything is minted. There is nothing there to be
 * uncertain about.
 *
 * So the only structural failure left is data that is present and unusable.
 */
function structuralConfidence(decoded: DecodedIntent): number {
  if (decoded.intent !== "SEND") return 1;

  if (decoded.amount !== null) {
    const amount = Number(decoded.amount);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
  }

  return 1;
}

export function effectiveConfidence(decoded: DecodedIntent): number {
  const claimed = Number.isFinite(decoded.confidence) ? decoded.confidence : 0;
  return Math.min(claimed, structuralConfidence(decoded));
}

export function checkConfidence(decoded: DecodedIntent): ConfidenceVerdict {
  const threshold = THRESHOLDS[decoded.intent];
  if (threshold === undefined) return { ok: true };

  const score = effectiveConfidence(decoded);
  if (score >= threshold) return { ok: true };

  // A SEND that fell short only on the model's own uncertainty still has a
  // readable amount and recipient, and reading them back is far more useful
  // than "I didn't understand". The user confirms or corrects in one word,
  // and no confirm link is minted until they do.
  //
  // A SEND that fell short structurally has nothing worth reading back — a
  // NaN amount echoed at someone is noise — so it takes the generic path.
  if (
    decoded.intent === "SEND" &&
    structuralConfidence(decoded) === 1 &&
    decoded.amount &&
    decoded.recipient
  ) {
    return {
      ok: false,
      reason: "confirm_send",
      amount: decoded.amount,
      recipient: decoded.recipient.trim(),
    };
  }

  return { ok: false, reason: "too_low" };
}

/**
 * Length cap and content filter for model-composed text.
 *
 * `GREETING` is the only intent whose reply text comes from the decoder
 * rather than from our own templates, and it went to WhatsApp unread. That is
 * a path from user-controlled input, through a model, to words tella appears
 * to say in its own voice — so a greeting that comes back carrying a link, a
 * wallet address, or something that looks like an amount is not a greeting.
 *
 * Returns null when the text should not be used, and the caller falls back to
 * the fixed template.
 */
const MAX_REPLY_CHARS = 300;

export function sanitizeModelReply(reply: string | null | undefined): string | null {
  if (!reply) return null;

  const trimmed = reply.trim();
  if (!trimmed || trimmed.length > MAX_REPLY_CHARS) return null;

  // Links: the classic way a friendly-sounding message becomes a phishing one.
  if (/https?:\/\//i.test(trimmed)) return null;
  if (/\b(wa\.me|t\.me|bit\.ly|tinyurl)\b/i.test(trimmed)) return null;
  if (/\bwww\.\S/i.test(trimmed)) return null;

  // A wallet address in a greeting is either a mistake or an attempt.
  if (/0x[a-fA-F0-9]{6,}/.test(trimmed)) return null;

  // Long digit runs: phone numbers, account numbers, codes.
  if (/\d[\d\s-]{7,}/.test(trimmed)) return null;

  return trimmed;
}
