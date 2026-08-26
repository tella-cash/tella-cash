/**
 * hasCommandKeyword tests. Runner-free — run with `pnpm test`.
 */
import { hasCommandKeyword } from "./detect-command-keyword";

const SHOULD: string[] = [
  // Tier 0 shorthands and taps.
  "balance", "BALANCE", "  address  ", "history", "help", "cancel",
  "/balance", "Check balance",
  // The same intents buried in a sentence — anchored fast-path misses these.
  "what's my balance?", "abeg send me my balance",
  "actually, can I see my wallet address",
  "no wait, show me my transactions",
  "send 5 usdc to chidi", "send 20 to 08012345678",
  "i want to transfer some money", "fund my wallet please",
  "who are my beneficiaries?",
];

const SHOULD_NOT: string[] = [
  // Names — the whole reason this is word-boundary matched.
  "Chidi", "Mum", "Landlord", "Sandra", "Helper", "Menuka", "Balancia",
  "my landlord", "Uncle Emeka", "the guy from work",
  // Answers to the prompt itself.
  "yes", "no", "yeah save him", "abeg no",
  // Nothing to act on.
  "", "   ", "???", "asdkjhasd",
];

let passed = 0;
const failures: string[] = [];
for (const t of SHOULD) {
  if (hasCommandKeyword(t)) passed++;
  else failures.push(`  ✗ expected KEYWORD for ${JSON.stringify(t)}`);
}
for (const t of SHOULD_NOT) {
  if (!hasCommandKeyword(t)) passed++;
  else failures.push(`  ✗ expected NO keyword for ${JSON.stringify(t)}`);
}
const total = SHOULD.length + SHOULD_NOT.length;
console.log(`detect-command-keyword: ${passed}/${total} passed`);
if (failures.length) { console.error("\nFailures:\n" + failures.join("\n")); process.exit(1); }
