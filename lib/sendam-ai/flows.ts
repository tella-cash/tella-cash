import type { AwaitingSlot, FollowUpSlots } from "./client";

// Static lookup, not a generic engine — tella defines its own
// backend-initiated flows here. sendam-ai's decoder never authors question
// text (see docs/INTEGRATION.md in that repo); since tella itself defined
// each flow's `awaiting` shape at /flow/start time, it already knows what
// question corresponds to each still-unresolved slot.

export const SAVE_BENEFICIARY_FLOW = "save_beneficiary";

export const SAVE_BENEFICIARY_AWAITING: AwaitingSlot[] = [
  { slot: "confirmed", type: "CONFIRMATION", description: "save this recipient as a beneficiary?" },
  { slot: "beneficiaryName", type: "FREE_TEXT", description: "what should we call them?" },
];

export const FAUCET_ASSET_FLOW = "faucet_asset";

export const FAUCET_ASSET_AWAITING: AwaitingSlot[] = [
  {
    slot: "asset",
    type: "FREE_TEXT",
    description: "which testnet asset do they want — native gas, USDC, or EURC?",
  },
];

/** Returns the next question to ask, or null if nothing more is needed. */
export function nextQuestionFor(flow: string, slots: FollowUpSlots): string | null {
  if (flow === SAVE_BENEFICIARY_FLOW && slots["beneficiaryName"] == null) {
    return "Nice — what would you like to save them as?";
  }
  if (flow === FAUCET_ASSET_FLOW && slots["asset"] == null) {
    return "Which one — *native* (gas), *USDC*, or *EURC*?";
  }
  return null;
}
