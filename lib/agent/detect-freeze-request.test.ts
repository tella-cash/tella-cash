/**
 * isFreezeRequest tests. Runner-free — run with `pnpm test`. Exits non-zero
 * on any failure.
 *
 * The two halves matter for different reasons. The SHOULD FREEZE cases are
 * the ones where a miss means an attacker keeps going, so the detector is
 * deliberately loose there. The SHOULD NOT cases are the guardrails that
 * stop that looseness from freezing accounts belonging to people who were
 * only asking a question or moving money.
 */

import { isFreezeRequest } from "./detect-freeze-request";

const SHOULD_FREEZE: string[] = [
  "freeze",
  "FREEZE",
  "  lock  ",
  "panic",
  "stop",
  "freeze my account",
  "lock my wallet",
  "freeze account",
  "please freeze my account",
  "lock everything now",
  "block all payments",
  "stop all payments",
  "stop all transfers immediately",
  "disable my wallet",
  "suspend my account please",
  "my phone was stolen",
  "my phone is stolen",
  "my sim was hijacked",
  "my account has been hacked",
  "account compromised",
  "someone stole my phone",
  "someone is in my account",
  "i'm being hacked",
  "im being robbed",
  "help i've been hacked",
  "stolen phone",
];

const SHOULD_NOT_FREEZE: string[] = [
  // Money instructions always win.
  "send 5 usdc to the locksmith about my stolen phone",
  "send 20 to my new phone shop",
  "send 100 usdc to chidi",
  // Questions are people reading, not people panicking.
  "what happens if my phone is stolen?",
  "can you freeze my account?",
  "how do i lock my wallet?",
  // Negations.
  "my account is not hacked",
  "my phone wasn't stolen after all",
  // Ordinary traffic that shares vocabulary.
  "balance",
  "history",
  "hello",
  "thanks, all good",
  "what's my balance",
  "stop sending me the menu",
  // Prose, past the length bound.
  "hey so anyway I was thinking about the whole thing with my old phone and " +
    "whether the account is fine, but honestly it is probably nothing at all",
  // Empty.
  "",
  "   ",
];

let passed = 0;
const failures: string[] = [];

for (const text of SHOULD_FREEZE) {
  if (isFreezeRequest(text)) passed++;
  else failures.push(`  ✗ expected FREEZE for ${JSON.stringify(text)}`);
}

for (const text of SHOULD_NOT_FREEZE) {
  if (!isFreezeRequest(text)) passed++;
  else failures.push(`  ✗ expected NO freeze for ${JSON.stringify(text)}`);
}

const total = SHOULD_FREEZE.length + SHOULD_NOT_FREEZE.length;
console.log(`detect-freeze-request: ${passed}/${total} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
