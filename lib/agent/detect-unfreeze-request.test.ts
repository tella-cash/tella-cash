/**
 * isUnfreezeRequest tests. Runner-free — run with `pnpm test`.
 */
import { isUnfreezeRequest } from "./detect-unfreeze-request";

const SHOULD: string[] = [
  "unfreeze", "UNFREEZE", "  unlock  ",
  "unfreeze my account", "unlock my wallet", "unfreeze account",
  "please unfreeze my account", "lift the freeze", "remove the freeze",
  "undo the freeze", "reactivate my account", "re-enable my wallet",
  "restore my account", "i'm the owner", "im the real owner",
];

const SHOULD_NOT: string[] = [
  // The mirror image — must not undo a freeze.
  "freeze", "freeze my account", "my phone was stolen",
  // Questions are people reading.
  "how do i unfreeze my account?", "can you unfreeze it?",
  // Money instructions win.
  "send 5 usdc to unlock the door guy",
  // Ordinary traffic.
  "balance", "history", "hello", "thanks",
  "", "   ",
];

let passed = 0;
const failures: string[] = [];
for (const t of SHOULD) {
  if (isUnfreezeRequest(t)) passed++;
  else failures.push(`  ✗ expected UNFREEZE for ${JSON.stringify(t)}`);
}
for (const t of SHOULD_NOT) {
  if (!isUnfreezeRequest(t)) passed++;
  else failures.push(`  ✗ expected NO unfreeze for ${JSON.stringify(t)}`);
}
const total = SHOULD.length + SHOULD_NOT.length;
console.log(`detect-unfreeze-request: ${passed}/${total} passed`);
if (failures.length) { console.error("\nFailures:\n" + failures.join("\n")); process.exit(1); }
