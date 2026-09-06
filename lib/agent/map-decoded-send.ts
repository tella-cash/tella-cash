import type { DecodedIntent } from "@/lib/sendam-ai/client";
import { classifyRecipient, type ParsedSendIntent } from "@/lib/agent/parse-send";

/**
 * Maps a sendam-ai /decode result onto the shape startSendFlow() expects, or
 * returns null if it's not an actionable SEND.
 *
 * The recipient classification it used to carry inline now lives in
 * parse-send.ts, because the guided send flow needs exactly the same rule and
 * a second copy of "what does this recipient string mean" is how the two
 * paths would drift into sending to different places for the same input.
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

  return {
    amount: decoded.amount,
    token: "USDC",
    recipient: classifyRecipient(recipientRaw),
  };
}
