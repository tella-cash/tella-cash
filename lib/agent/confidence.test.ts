/**
 * Confidence gating and model-reply sanitisation tests. Runner-free — run
 * with `pnpm test`. Exits non-zero on any failure.
 */

import { checkConfidence, effectiveConfidence, sanitizeModelReply } from "./confidence";
import type { DecodedIntent } from "@/lib/sendam-ai/client";

const base: DecodedIntent = {
  intent: "BALANCE",
  amount: null,
  asset: null,
  recipient: null,
  confidence: 1,
};

function d(over: Partial<DecodedIntent>): DecodedIntent {
  return { ...base, ...over };
}

type Check = [string, () => boolean];

const CHECKS: Check[] = [
  // --- SEND holds the highest bar, because it is the expensive mistake ---
  [
    "a confident send passes",
    () => checkConfidence(d({ intent: "SEND", amount: "5", recipient: "Chidi", confidence: 0.95 })).ok,
  ],
  [
    "a shaky send is asked back rather than acted on",
    () => {
      const v = checkConfidence(
        d({ intent: "SEND", amount: "5", recipient: "Chidi", confidence: 0.6 }),
      );
      return !v.ok && v.reason === "confirm_send" && v.amount === "5" && v.recipient === "Chidi";
    },
  ],
  [
    "a send right on the threshold passes",
    () => checkConfidence(d({ intent: "SEND", amount: "5", recipient: "Chidi", confidence: 0.85 })).ok,
  ],

  // --- structural failures outrank whatever the decoder claimed ---
  [
    "a NaN amount is zero confidence however sure the decoder was",
    () => effectiveConfidence(d({ intent: "SEND", amount: "abc", recipient: "Chidi", confidence: 0.99 })) === 0,
  ],
  [
    "a negative amount is zero confidence",
    () => effectiveConfidence(d({ intent: "SEND", amount: "-5", recipient: "Chidi", confidence: 0.99 })) === 0,
  ],
  // --- an OPENING is not a broken PROPOSAL ---
  //
  // These four are the regression that made the Send button, /send and "send
  // usdc" answer "I'm not totally sure what you meant". All three arrive as
  // intent SEND with empty slots at confidence 1 from tier 0, and scoring a
  // missing slot as 0 put them under the 0.85 threshold — so the switch in
  // handleOnboardedUser was never reached and startGuidedSend was dead code.
  //
  // A SEND with no slots proposes nothing and moves nothing. What the
  // threshold protects against is a half-READ transfer being acted on, and
  // there is nothing here to have misread.
  [
    "a bare send — the Send button, /send, \"send usdc\" — is allowed through",
    () => {
      const v = checkConfidence(d({ intent: "SEND", amount: null, recipient: null, confidence: 1 }));
      return v.ok;
    },
  ],
  [
    "an amount with no recipient opens the flow rather than being refused",
    () => {
      const v = checkConfidence(d({ intent: "SEND", amount: "5", recipient: null, confidence: 0.99 }));
      return v.ok;
    },
  ],
  [
    "a recipient with no amount opens the flow rather than being refused",
    () => {
      const v = checkConfidence(d({ intent: "SEND", amount: null, recipient: "Chidi", confidence: 0.99 }));
      return v.ok;
    },
  ],
  [
    "a bare send the DECODER is unsure about is still refused — only tier 0 is certain",
    () => {
      const v = checkConfidence(d({ intent: "SEND", amount: null, recipient: null, confidence: 0.3 }));
      return !v.ok && v.reason === "too_low";
    },
  ],
  [
    "an unusable amount is still zero, slots or no slots",
    () => effectiveConfidence(d({ intent: "SEND", amount: "abc", recipient: null, confidence: 0.99 })) === 0,
  ],
  [
    "a structurally broken send is NOT echoed back — there is nothing worth reading out",
    () => {
      const v = checkConfidence(d({ intent: "SEND", amount: "abc", recipient: "Chidi", confidence: 0.99 }));
      return !v.ok && v.reason === "too_low";
    },
  ],

  // --- reads sit lower, cancel sits in between ---
  [
    "a middling balance read passes",
    () => checkConfidence(d({ intent: "BALANCE", confidence: 0.55 })).ok,
  ],
  [
    "a very weak balance read does not",
    () => !checkConfidence(d({ intent: "BALANCE", confidence: 0.3 })).ok,
  ],
  [
    "cancel needs more than a read does",
    () =>
      !checkConfidence(d({ intent: "CANCEL", confidence: 0.55 })).ok &&
      checkConfidence(d({ intent: "CANCEL", confidence: 0.75 })).ok,
  ],
  [
    "conversational intents have no bar at all",
    () =>
      checkConfidence(d({ intent: "GREETING", confidence: 0.1 })).ok &&
      checkConfidence(d({ intent: "HELP", confidence: 0 })).ok,
  ],
  [
    "a non-finite confidence is treated as zero, not waved through",
    () => effectiveConfidence(d({ intent: "BALANCE", confidence: NaN })) === 0,
  ],
  [
    "tier 0 results always pass",
    () => checkConfidence(d({ intent: "SEND", amount: "5", recipient: "Chidi", confidence: 1 })).ok,
  ],
];

// --- sanitizeModelReply: the only decoder-composed text a user ever sees ---
const REPLY_KEPT = [
  "Hey! Good to hear from you.",
  "Morning 👋 how can I help?",
  "Hello there, what can I do for you today?",
];

const REPLY_REJECTED: Array<[string, string]> = [
  ["empty", ""],
  ["whitespace", "   "],
  ["too long", "a".repeat(301)],
  ["http link", "Hi! Check https://evil.example for a bonus"],
  ["www link", "Hi! Go to www.evil.example"],
  ["wa.me link", "Hey, message me on wa.me/12345"],
  ["telegram link", "Hi, find me at t.me/someone"],
  ["wallet address", "Hello! Send to 0xabcdef123456 for a reward"],
  ["long digit run", "Hi! Call 08012345678 to claim"],
];

for (const text of REPLY_KEPT) {
  CHECKS.push([`reply kept: ${JSON.stringify(text)}`, () => sanitizeModelReply(text) === text]);
}
for (const [name, text] of REPLY_REJECTED) {
  CHECKS.push([`reply rejected (${name})`, () => sanitizeModelReply(text) === null]);
}
CHECKS.push(["null reply falls back", () => sanitizeModelReply(null) === null]);

let passed = 0;
const failures: string[] = [];

for (const [name, check] of CHECKS) {
  let ok = false;
  try {
    ok = check();
  } catch (err) {
    failures.push(`  ✗ ${name} threw: ${(err as Error).message}`);
    continue;
  }
  if (ok) passed++;
  else failures.push(`  ✗ ${name}`);
}

console.log(`confidence: ${passed}/${CHECKS.length} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
