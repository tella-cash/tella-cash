import { isEvmAddress, normalizePhone } from "@/lib/utils/phone";
import type { DecodedIntent } from "@/lib/sendam-ai/client";
import type { ParsedSendIntent } from "@/lib/agent/parse-send";

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
 * Maps a sendam-ai /decode result onto the shape startSendFlow() expects, or
 * returns null if it's not an actionable SEND. Reuses the same
 * isEvmAddress/normalizePhone recipient classification the old regex-based
 * parseSendIntent() used — only the input source changes (a plain string
 * from `decoded.recipient` instead of a regex capture group).
 *
 * Never trusts amount blindly: downstream code does Number(amount)
 * comparisons, and NaN compares false against everything, which would
 * silently defeat a spend-limit-style check rather than reject it.
 */
export function mapDecodedSend(decoded: DecodedIntent): ParsedSendIntent | null {
  if (decoded.intent !== "SEND" || decoded.amount === null) return null;

  const amountNum = Number(decoded.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) return null;

  const recipientRaw = decoded.recipient?.trim();
  if (!recipientRaw) return null;

  if (isEvmAddress(recipientRaw)) {
    return {
      amount: decoded.amount,
      token: "USDC",
      recipient: { kind: "address", address: recipientRaw.toLowerCase() },
    };
  }

  const normalized = normalizePhone(recipientRaw);
  if (normalized) {
    return {
      amount: decoded.amount,
      token: "USDC",
      recipient: { kind: "phone", whatsappNumber: `whatsapp:${normalized}` },
    };
  }

  // Phone-SHAPED but not a valid phone number. Without this branch it falls
  // into the label case below and comes back as "I don't have a beneficiary
  // called +23480123", which sends the user to check their saved contacts
  // when the actual problem is a digit missing from the number they typed.
  if (looksLikePhone(recipientRaw)) {
    return {
      amount: decoded.amount,
      token: "USDC",
      recipient: { kind: "invalid_phone", typed: recipientRaw },
    };
  }

  return {
    amount: decoded.amount,
    token: "USDC",
    recipient: { kind: "label", label: recipientRaw },
  };
}
