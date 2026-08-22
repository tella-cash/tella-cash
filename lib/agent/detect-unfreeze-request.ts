/**
 * Detects a request to lift a freeze.
 *
 * Local, and matched before any decoder, for the same reason the freeze and
 * reset detectors are: someone locked out of their own money must not be told
 * "I'm having trouble understanding right now".
 *
 * Tuned the OPPOSITE way to detect-freeze-request. That one is deliberately
 * loose, because a false positive costs an inconvenience and a false negative
 * costs the account. Here the asymmetry reverses: matching this by accident
 * starts a flow that asks for a factor, which is noise at best and at worst
 * trains someone to expect a PIN prompt they did not ask for. So it only
 * matches messages that are clearly about lifting a freeze.
 */

const UNFREEZE_PATTERNS: RegExp[] = [
  /^\s*(unfreeze|unlock)\s*$/i,
  /^\s*(unfreeze|unlock)\s+(my\s+)?(account|wallet)\s*$/i,
  /\b(unfreeze|unlock|reactivate|re-?enable|restore)\b[^.!?]{0,24}\b(account|wallet)\b/i,
  /\b(lift|remove|cancel|undo)\b[^.!?]{0,16}\b(the\s+)?freeze\b/i,
  /\bi('| a)?m\s+(the\s+)?(real\s+)?owner\b/i,
];

/** A transfer instruction is a transfer, whatever else it contains. */
const SEND_INSTRUCTION = /\bsend\b[^]*\d/i;

export function isUnfreezeRequest(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 120) return false;
  if (SEND_INSTRUCTION.test(trimmed)) return false;
  // "how do I unfreeze?" is someone reading, not someone asking.
  if (trimmed.endsWith("?")) return false;
  return UNFREEZE_PATTERNS.some((p) => p.test(trimmed));
}
