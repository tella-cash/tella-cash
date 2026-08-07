/**
 * isResetRequest tests. Runner-free — run with `pnpm test`. Exits non-zero
 * on any failure.
 *
 * Both directions matter. A missed reset request leaves someone locked out
 * of their own money with the bot replying "I didn't understand" — the worst
 * possible answer to that message. A false positive on a send instruction
 * would replace a transfer with a recovery link, so the send phrasings below
 * are the ones that must never match.
 */

import { isResetRequest } from "./detect-reset-request";

const SHOULD_MATCH = [
  "reset pin",
  "reset my pin",
  "Reset my PIN",
  "RESET MY PIN please",
  "i forgot my pin",
  "I've forgotten my pin",
  "forgot pin",
  "i forget my pin",
  "change my pin",
  "i want to change my pin",
  "new pin",
  "i lost my pin",
  "can't remember my pin",
  "cant remember my pin",
  "I don't remember my pin",
  "reset my passkey",
  "reset face id",
  "reset fingerprint",
  "i got a new phone",
  "lost my phone",
  "i changed my device",
  "remove my passkey",
];

const SHOULD_NOT_MATCH = [
  // Ordinary traffic.
  "send 5 usdc to +2348012345678",
  "what's my balance?",
  "my address",
  "hi",
  "help",
  "faucet usdc",
  "cancel",
  "thanks!",
  // Near-misses that are not a reset request.
  "is my pin safe?",
  "how do i set a pin",
  "what is a passkey",
  "send 5 usdc to my new phone shop",
  // Long prose: matching inside it invites false positives.
  "hey so last week i lost my pin card at the market and then my cousin said i should ask you about sending money to her instead, can you send 20 usdc to +2348012345678 please",
  // Empty-ish.
  "",
  "   ",
];

let passed = 0;
const failures: string[] = [];

for (const text of SHOULD_MATCH) {
  if (isResetRequest(text)) passed++;
  else failures.push(`  ✗ should match: ${JSON.stringify(text)}`);
}

for (const text of SHOULD_NOT_MATCH) {
  if (!isResetRequest(text)) passed++;
  else failures.push(`  ✗ should NOT match: ${JSON.stringify(text)}`);
}

const total = SHOULD_MATCH.length + SHOULD_NOT_MATCH.length;
console.log(`detect-reset-request: ${passed}/${total} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
