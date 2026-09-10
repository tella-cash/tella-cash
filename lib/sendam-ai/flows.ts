import type { AwaitingSlot, FollowUpSlots } from "./client";

// Static lookup, not a generic engine — tella defines its own
// backend-initiated flows here. sendam-ai's decoder never authors question
// text (see docs/INTEGRATION.md in that repo); since tella itself defined
// each flow's `awaiting` shape at /flow/start time, it already knows what
// question corresponds to each still-unresolved slot.

// The save-beneficiary flow used to live here. It no longer touches sendam-ai
// at all: the recipient is stored in the pending row in the clear and the
// yes/no is read by anchored patterns in lib/agent/beneficiary-flow.ts. See
// migrations/0023_beneficiary_pending_action.sql for what that fixed.

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
  if (flow === FAUCET_ASSET_FLOW && slots["asset"] == null) {
    return "Which one — *native* (gas), *USDC*, or *EURC*?";
  }
  return null;
}
