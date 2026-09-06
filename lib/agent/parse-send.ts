import { isEvmAddress, normalizePhone } from "@/lib/utils/phone";

// Structured-send shape produced by mapDecodedSend() (lib/agent/map-decoded-send.ts)
// from a sendam-ai /decode result, and now also by the guided send flow
// (lib/agent/send-flow.ts). Intent parsing itself lives in sendam-ai — this
// file keeps the shape both sides agree on, and the one function that decides
// what a recipient string IS.
export interface ParsedSendIntent {
  amount: string;
  token: "USDC";
  recipient:
    | { kind: "phone"; whatsappNumber: string }
    | { kind: "address"; address: string }
    | { kind: "label"; label: string }
    /**
     * Looked like a phone number and wasn't a valid one. Distinct from
     * `label` because the reply has to be different: telling someone
     * "I don't have a beneficiary called +23480123" when they typed a
     * number reports a decode problem as an address-book problem, and
     * sends them looking in the wrong place.
     */
    | { kind: "invalid_phone"; typed: string };
}

/**
 * Digits and phone punctuation, and enough of them to be a phone number
 * attempt rather than a name. Deliberately loose: this only decides which
 * error message the user sees, never whether money moves.
 */
function looksLikePhone(value: string): boolean {
  if (/[a-z]/i.test(value)) return false;
  return /^[+\d][\d\s\-().]{5,}$/.test(value);
}

/**
 * What is this recipient string — an address, a phone number, or a saved name?
 *
 * Lives here, and is called by both producers of a ParsedSendIntent, for the
 * same reason performTransfer is shared between the confirm route and the
 * hold-release job: two copies of the rule that decides where money goes is
 * how they come to disagree. The guided flow and the decoder path now classify
 * a recipient identically by construction rather than by review.
 *
 * Note this makes no network call and consults no table. It decides the SHAPE
 * only; whether a beneficiary by that name exists, or whether that number
 * belongs to a tella user, is startSendFlow's question.
 */
export function classifyRecipient(raw: string): ParsedSendIntent["recipient"] {
  const trimmed = raw.trim();

  if (isEvmAddress(trimmed)) {
    return { kind: "address", address: trimmed.toLowerCase() };
  }

  const normalized = normalizePhone(trimmed);
  if (normalized) {
    return { kind: "phone", whatsappNumber: `whatsapp:${normalized}` };
  }

  // Phone-SHAPED but not a valid phone number. Without this branch it falls
  // into the label case below and comes back as "I don't have a beneficiary
  // called +23480123", which sends the user to check their saved contacts
  // when the actual problem is a digit missing from the number they typed.
  if (looksLikePhone(trimmed)) {
    return { kind: "invalid_phone", typed: trimmed };
  }

  return { kind: "label", label: trimmed };
}
