import { isEvmAddress, normalizePhone } from "@/lib/utils/phone";
import type { DecodedIntent } from "@/lib/sendam-ai/client";
import type { ParsedSendIntent } from "@/lib/agent/parse-send";

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

  return {
    amount: decoded.amount,
    token: "USDC",
    recipient: { kind: "label", label: recipientRaw },
  };
}
