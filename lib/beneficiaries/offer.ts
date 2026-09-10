import type { tellaUser } from "@/lib/supabase/types";
import { notifyUser } from "@/lib/messaging/notify";
import { findBeneficiaryByAddress } from "@/lib/beneficiaries/repository";
import { createPendingSaveBeneficiary } from "@/lib/pending_actions/repository";
import { beneficiaryOfferPrompt } from "@/lib/agent/beneficiary-flow";

export interface BeneficiaryOfferRecipient {
  address: string;
  userId: string | null;
  whatsappNumber: string | null;
  /** How the recipient was described in the receipt the user just got. */
  label: string;
}

export type BeneficiaryOfferOutcome =
  | "offered"
  | "already_saved"
  | "not_recorded"
  | "not_delivered";

/**
 * The three things this function touches, injectable.
 *
 * A seam for tests and nothing else — every caller in the app uses the
 * default. It exists because the interesting behaviour here IS the failure
 * handling: which step failing still produces a question, and which does not.
 * That is not observable from the outside without being able to make a step
 * fail, and it is exactly the kind of branch that regresses unnoticed, since
 * the symptom is silence.
 */
export interface BeneficiaryOfferDeps {
  findSaved: typeof findBeneficiaryByAddress;
  recordOffer: typeof createPendingSaveBeneficiary;
  notify: typeof notifyUser;
}

const REAL_DEPS: BeneficiaryOfferDeps = {
  findSaved: findBeneficiaryByAddress,
  recordOffer: createPendingSaveBeneficiary,
  notify: notifyUser,
};

/**
 * Offer to save a recipient the user has just paid.
 *
 * Shared by the confirm path (lib/sends/follow-up.ts) and the hold-release
 * cron, which previously did not offer at all — a send over the hold
 * threshold went out a day later with no question attached, because
 * sendReceiptAndFollowUp returns early on `{ ok: false, reason: "held" }` and
 * nothing downstream picked it up.
 *
 * THE FAILURE HANDLING IS THE POINT OF THIS FUNCTION.
 *
 * The old version put the duplicate check, a sendam-ai POST, the row write and
 * the message inside one try/catch that only logged. Any of the four failing
 * meant no question, no retry, and no record that one was owed — and the most
 * common failure was the sendam-ai call, which the question did not need.
 * There is no network call left here, and the three remaining steps fail
 * independently:
 *
 *   * the duplicate check FAILS OPEN. "I could not tell whether they are
 *     already saved" is not a reason to stay quiet; the worst case of asking
 *     anyway is a name collision, which the save path already handles by
 *     asking for a different one.
 *   * the row write is the one step that must succeed. Without it a yes has
 *     nowhere to land, so a failure here skips the question rather than asking
 *     one that cannot be answered.
 *   * delivery is last and reported, so a caller can log the difference
 *     between "never asked" and "asked, nobody reachable".
 */
export async function offerBeneficiarySave({
  user,
  recipient,
  deps = REAL_DEPS,
}: {
  user: tellaUser;
  recipient: BeneficiaryOfferRecipient;
  deps?: BeneficiaryOfferDeps;
}): Promise<BeneficiaryOfferOutcome> {
  try {
    const existing = await deps.findSaved(user.id, recipient.address);
    if (existing) return "already_saved";
  } catch (err) {
    // Fail open, deliberately. See the note above.
    console.error("[beneficiary] duplicate check failed, offering anyway", {
      userId: user.id,
      err,
    });
  }

  try {
    await deps.recordOffer({
      userId: user.id,
      payload: {
        step: "confirm",
        recipientAddress: recipient.address,
        recipientUserId: recipient.userId,
        recipientWhatsappNumber: recipient.whatsappNumber,
        suggestedLabel: recipient.label,
      },
    });
  } catch (err) {
    console.error("[beneficiary] could not record the offer, so not asking", {
      userId: user.id,
      err,
    });
    return "not_recorded";
  }

  try {
    const delivered = await deps.notify({
      user,
      body: beneficiaryOfferPrompt(recipient.label),
    });
    return delivered > 0 ? "offered" : "not_delivered";
  } catch (err) {
    console.error("[beneficiary] offer message failed", { userId: user.id, err });
    return "not_delivered";
  }
}
