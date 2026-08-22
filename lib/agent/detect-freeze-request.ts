/**
 * Detects a "stop everything" request in raw message text.
 *
 * Matched locally and BEFORE anything is handed to a decoder, for the same
 * reasons detect-reset-request.ts is (see that file), plus one that is
 * specific to this: a person whose phone has just been stolen is the single
 * worst case to answer with "I'm having trouble right now, try again in a
 * minute". Freezing has to keep working when every decoder tier is down,
 * which means it cannot depend on one.
 *
 * Tuned in the opposite direction to the reset detector. That one is kept
 * deliberately narrow because a false positive sends a link the user can
 * ignore. Here the asymmetry runs the other way:
 *
 *   - false positive: one account frozen that did not need to be, one
 *     annoyed user, one unfreeze.
 *   - false negative: the attacker keeps going.
 *
 * So this matches loosely, and when it is unsure it should still fire. The
 * cost of being wrong is bounded and reversible in one direction only.
 */

const FREEZE_PATTERNS: RegExp[] = [
  // The literal commands, which is what the confirmation message tells
  // people to use and therefore what most real freezes will look like.
  /^\s*(freeze|lock|panic|stop)\s*$/i,
  /^\s*(freeze|lock)\s+(my\s+)?(account|wallet)\s*$/i,

  // Freeze / lock / block, phrased loosely.
  /\b(freeze|lock|block|disable|suspend)\b[^.!?]{0,24}\b(account|wallet|everything|payments?|transfers?)\b/i,
  /\bstop\b[^.!?]{0,16}\b(all\s+)?(payments?|transfers?|sends?|everything|transactions?)\b/i,

  // What people actually type when it is happening to them. These are the
  // patterns that matter most and the ones a tidy command list would miss.
  /\b(phone|sim|account|wallet)\b[^.!?]{0,16}\b(stolen|hacked|compromised|hijacked)\b/i,
  /\b(stolen|hacked|compromised|hijacked)\b[^.!?]{0,16}\b(phone|sim|account|wallet)\b/i,
  /\bi('| a)?m being (hacked|robbed|scammed)\b/i,
  /\bsomeone (is|has|stole|took)\b[^.!?]{0,24}\b(my )?(account|wallet|phone|money|usdc)\b/i,
  /\bhelp\b[^.!?]{0,12}\b(hacked|stolen|robbed)\b/i,
];

/**
 * A message instructing a transfer is a transfer, whatever else it contains.
 * Borrowed verbatim from detect-reset-request.ts, and load-bearing for the
 * same reason: "send 5 usdc to the locksmith about my stolen phone" must
 * move money, not freeze the account.
 */
const SEND_INSTRUCTION = /\bsend\b[^]*\d/i;

/**
 * Negations, because "my account is not hacked" and "what happens if my
 * phone is stolen?" are both things people write, and neither is a request
 * to freeze anything. Questions are the more common of the two: someone
 * reading the security blurb should not trip the kill switch.
 */
const NOT_A_REQUEST = /\b(not|isn'?t|wasn'?t|never)\b/i;

export function isFreezeRequest(text: string): boolean {
  const trimmed = text.trim();

  // Same bound as the reset detector: past ~120 characters this is prose,
  // and matching inside prose is where the false positives come from.
  if (!trimmed || trimmed.length > 120) return false;
  if (SEND_INSTRUCTION.test(trimmed)) return false;
  if (trimmed.endsWith("?")) return false;
  if (NOT_A_REQUEST.test(trimmed)) return false;

  return FREEZE_PATTERNS.some((p) => p.test(trimmed));
}
