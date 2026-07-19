import type { AwaitingSlot, FollowUpSlots } from "./client";

// Static lookup, not a generic engine — tella defines exactly one
// backend-initiated flow today. sendam-ai's decoder never authors question
// text (see docs/INTEGRATION.md in that repo); since tella itself defined
// this flow's `awaiting` shape at /flow/start time, it already knows what
// question corresponds to each still-unresolved slot.

export const SAVE_BENEFICIARY_FLOW = "save_beneficiary";

export const SAVE_BENEFICIARY_AWAITING: AwaitingSlot[] = [
  { slot: "confirmed", type: "CONFIRMATION", description: "save this recipient as a beneficiary?" },
  { slot: "beneficiaryName", type: "FREE_TEXT", description: "what should we call them?" },
];

/** Returns the next question to ask, or null if nothing more is needed. */
export function nextQuestionFor(flow: string, slots: FollowUpSlots): string | null {
  if (flow === SAVE_BENEFICIARY_FLOW && slots["beneficiaryName"] == null) {
    return "Nice — what would you like to save them as?";
  }
  return null;
}
