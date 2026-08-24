/**
 * isAffirmation / isDeclination tests. Runner-free — run with `npm test`.
 *
 * The interesting cases are the third column: messages that are NEITHER.
 * Those release the pending confirmation and get handled as ordinary
 * traffic, so a wrong answer here does not merely misfire a freeze — it
 * either swallows a real instruction or freezes an account that asked for
 * its balance.
 */
import { isAffirmation, isDeclination } from "./confirm-action";

const YES: string[] = [
  "freeze", "FREEZE", "  freeze  ", "freeze it", "Freeze it",
  "yes", "Yes", "yeah", "yep", "y", "ok", "okay",
  "confirm", "confirmed", "do it", "go ahead", "yes!", "yes.",
];

const NO: string[] = [
  "no", "No", "nope", "nah", "n", "cancel", "stop",
  "not now", "Not now", "nevermind", "never mind", "no.", "no!",
];

/** Neither. Every one of these must fall through to normal handling. */
const NEITHER: string[] = [
  // Real instructions typed at the prompt. Swallowing one of these as a
  // "yes" would freeze an account that was trying to move money.
  "send 5 usdc to chidi",
  "balance",
  "my address",
  "history",
  // Hedges and questions. A wallet must not read "yes but" as consent.
  "yes but wait",
  "no wait",
  "what does freezing do?",
  "freeze my account and tell me why",
  "why?",
  // Empty and whitespace.
  "", "   ",
];

let passed = 0;
const failures: string[] = [];

for (const t of YES) {
  if (isAffirmation(t) && !isDeclination(t)) passed++;
  else failures.push(`  ✗ expected YES for ${JSON.stringify(t)}`);
}
for (const t of NO) {
  if (isDeclination(t) && !isAffirmation(t)) passed++;
  else failures.push(`  ✗ expected NO for ${JSON.stringify(t)}`);
}
for (const t of NEITHER) {
  if (!isAffirmation(t) && !isDeclination(t)) passed++;
  else failures.push(`  ✗ expected NEITHER for ${JSON.stringify(t)}`);
}

const total = YES.length + NO.length + NEITHER.length;
console.log(`confirm-action: ${passed}/${total} passed`);
if (failures.length) { console.error("\nFailures:\n" + failures.join("\n")); process.exit(1); }
