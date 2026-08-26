import { fastPathDecode } from "@/lib/agent/fast-path";

/**
 * Detects "this message is a new request, not an answer".
 *
 * A pending save-beneficiary prompt captures every message the user sends
 * until it resolves. That is right for "yes", "no" and a name — and wrong
 * for "balance", which used to be fed to the flow decoder and answered with
 * a beneficiary question. The flow has to be able to tell that it has lost
 * the user's attention and get out of the way.
 *
 * Local and decoder-free on purpose: the whole point is to short-circuit
 * before the /decode round-trip, so this keeps working while sendam-ai is
 * slow or down, exactly like the freeze and reset detectors.
 *
 * Tuned tight rather than loose. A false positive drops a beneficiary the
 * user did want to save (recoverable — they can send again, and nothing is
 * lost but a name); but every match must still be something tella can
 * actually act on, so the word list stays to the closed set of things the
 * bot does.
 */

/**
 * The same intents fastPathDecode knows, matched inside a sentence.
 *
 * fastPathDecode's typed patterns are anchored — "balance" matches,
 * "what's my balance?" does not — which is correct for a tier that decides
 * an intent, and too strict for a tier that only decides "is this an answer
 * to my question?".
 *
 * Word boundaries are what keep names safe: a beneficiary called "Sandra"
 * or "Helper" must not read as "send" or "help".
 */
const COMMAND_WORDS =
  /\b(balance|bal|send|transfer|address|wallet|receive|history|transactions?|contacts?|beneficiar(?:y|ies)|faucet|testnet|fund|help|menu|pin|freeze)\b/i;

export function hasCommandKeyword(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Covers tapped button titles, /slash commands, the canonical send shape
  // and the typed shorthands — anything tier 0 already resolves is by
  // definition a request rather than an answer.
  if (fastPathDecode(trimmed)) return true;

  return COMMAND_WORDS.test(trimmed);
}
