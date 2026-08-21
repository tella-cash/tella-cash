/**
 * Detects a PIN-reset / passkey-recovery request in raw message text.
 *
 * This is matched locally, BEFORE the message is handed to sendam-ai,
 * rather than added as a new decoder intent. Two reasons:
 *
 *   1. sendam-ai is a separate deployed service with a closed intent set.
 *      "reset my pin" lands on SECURITY or UNKNOWN there, both of which
 *      reply with generic reassurance — exactly the wrong answer for a
 *      person who is locked out.
 *   2. Someone locked out of their money is not in a mood to be
 *      paraphrased. This path should be deterministic, and it should keep
 *      working during a sendam-ai outage, when the fallback is the generic
 *      "I didn't understand" reply.
 *
 * Kept deliberately narrow. A false positive costs a WhatsApp message with
 * a reset link the user can ignore; it can't reset anything on its own.
 */

const RESET_PATTERNS: RegExp[] = [
  // "reset pin", "reset my pin", "reset the pin code"
  /\breset\b[^.!?]{0,20}\bpin\b/i,
  // "forgot my pin", "forgotten pin", "i forget my pin"
  /\bforgot(ten)?\b[^.!?]{0,20}\bpin\b/i,
  /\bforget\b[^.!?]{0,20}\bpin\b/i,
  // "change my pin", "new pin"
  /\bchange\b[^.!?]{0,20}\bpin\b/i,
  /\bnew pin\b/i,
  // "lost my pin", "can't remember my pin"
  /\blost\b[^.!?]{0,20}\bpin\b/i,
  /\b(can'?t|cannot|don'?t)\s+remember\b[^.!?]{0,20}\bpin\b/i,
  // Passkey side of the same problem — lost the device holding it.
  /\breset\b[^.!?]{0,20}\b(passkey|face\s?id|fingerprint|biometrics?)\b/i,
  /\b(lost|new|changed)\b[^.!?]{0,20}\b(phone|device)\b/i,
  /\bremove\b[^.!?]{0,20}\bpasskey\b/i,
];

/**
 * A message that is instructing a transfer is a transfer, whatever else it
 * happens to contain. "send 5 usdc to my new phone shop" would otherwise
 * match the lost-device pattern and hand back a reset link instead of
 * moving money.
 */
const SEND_INSTRUCTION = /\bsend\b[^]*\d/i;

export function isResetRequest(text: string): boolean {
  const trimmed = text.trim();
  // Long messages are prose, not a command. Matching inside them invites
  // false positives ("...my old phone, anyway can you send 5 usdc to...").
  if (!trimmed || trimmed.length > 120) return false;
  if (SEND_INSTRUCTION.test(trimmed)) return false;
  return RESET_PATTERNS.some((p) => p.test(trimmed));
}
