/**
 * Classifier tests. No test-runner dependency — run with `pnpm test`
 * (`tsx lib/agent/intents.test.ts`). Exits non-zero on any failure so it
 * can gate CI.
 *
 * Each case is [message, expected intent]. When you add new trigger words
 * to a rule, add a case here so the behaviour stays pinned.
 */

import { classifyIntent, type Intent } from "./intents";

const CASES: Array<[string, Intent]> = [
  // greeting
  ["hi", "greeting"],
  ["hey there", "greeting"],
  ["hello!", "greeting"],
  ["gm", "greeting"],
  ["good morning", "greeting"],
  ["whats up", "greeting"],
  ["yo", "greeting"],

  // help
  ["help", "help"],
  ["menu", "help"],
  ["what are my options", "help"],
  ["im lost", "help"],
  ["get started", "help"],

  // balance
  ["balance", "balance"],
  ["bal", "balance"],
  ["whats my balance", "balance"],
  ["how much do i have", "balance"],
  ["check balance", "balance"],
  ["how much usdc do i have", "balance"],
  ["balnce", "balance"], // fuzzy typo

  // address
  ["my address", "address"],
  ["address", "address"],
  ["whats my wallet address", "address"],
  ["deposit", "address"],
  ["how do i receive money", "address"],
  ["addres", "address"], // fuzzy typo

  // send (send-ish but not a parseable structured send)
  ["i want to send money", "send"],
  ["pay someone", "send"],
  ["transfer", "send"],
  ["send some usdc", "send"],

  // about
  ["what is tella", "about"],
  ["who are you", "about"],
  ["what is this", "about"],
  ["what can you do", "about"],

  // how_it_works
  ["how does this work", "how_it_works"],
  ["how do i use this", "how_it_works"],
  ["how does tella work", "how_it_works"],

  // fees
  ["are there any fees", "fees"],
  ["how much does it cost", "fees"],
  ["do you charge", "fees"],
  ["is it free to use", "fees"],

  // security
  ["is this safe", "security"],
  ["can i trust you", "security"],
  ["is it a scam", "security"],
  ["is my money secure", "security"],

  // thanks
  ["thanks", "thanks"],
  ["thank you", "thanks"],
  ["thx", "thanks"],
  ["appreciate it", "thanks"],

  // goodbye
  ["bye", "goodbye"],
  ["see you later", "goodbye"],
  ["good night", "goodbye"],

  // affirm
  ["yes", "affirm"],
  ["ok cool", "affirm"],
  ["sounds good", "affirm"],
  ["lets go", "affirm"],

  // cancel
  ["cancel", "cancel"],
  ["never mind", "cancel"],
  ["nvm", "cancel"],

  // priority: a real intent outranks a leading affirmation
  ["ok whats my balance", "balance"],

  // unknown
  ["asdkjfh", "unknown"],
  ["the weather is nice today", "unknown"],
];

let passed = 0;
const failures: string[] = [];

for (const [input, expected] of CASES) {
  const got = classifyIntent(input);
  if (got === expected) {
    passed++;
  } else {
    failures.push(`  ✗ ${JSON.stringify(input)} -> ${got} (expected ${expected})`);
  }
}

console.log(`intents: ${passed}/${CASES.length} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
