/**
 * fastPathDecode tests. Runner-free — run with `pnpm test`. Exits non-zero on
 * any failure.
 *
 * Three groups, and the third is the important one. Matching a read wrongly
 * costs a message; matching a SEND wrongly costs money, so the "must fall
 * through" list is the real specification of this module.
 */

import { fastPathDecode } from "./fast-path";
import type { DecodedIntent } from "@/lib/sendam-ai/client";

type Case = [string, DecodedIntent["intent"] | null];

// Tapped button and list titles, exactly as lib/meta/client.ts authors them.
// Pinned here so renaming a title there without updating fast-path.ts shows
// up as a test failure rather than a quiet rise in decoder spend.
const TAPPED: Case[] = [
  ["Balance", "BALANCE"],
  ["My address", "ADDRESS"],
  ["Send", "SEND"],
  ["Send USDC", "SEND"],
  ["History", "HISTORY"],
  ["How it works", "HOW_IT_WORKS"],
  ["Is it safe?", "SECURITY"],
  ["Menu", "HELP"],
];

const TYPED: Case[] = [
  ["balance", "BALANCE"],
  ["  BAL  ", "BALANCE"],
  ["what's my balance", "BALANCE"],
  ["whats my balance", "BALANCE"],
  ["address", "ADDRESS"],
  ["wallet address", "ADDRESS"],
  ["history", "HISTORY"],
  ["transactions", "HISTORY"],
  ["help", "HELP"],
  ["menu", "HELP"],
  ["cancel", "CANCEL"],
  ["hi", "GREETING"],
  ["good morning", "GREETING"],
  ["thanks", "THANKS"],
  ["bye", "GOODBYE"],
  // Not shorthands for anything — the slower tiers can have these.
  ["what is usdc", null],
  ["can i send money to ghana", null],
  ["", null],
  ["   ", null],
];

const ADDRESS = "0x1111111111111111111111111111111111111111";

const SENDS: Array<[string, string | null, string | null]> = [
  // [input, expected amount or null if it must fall through, expected recipient]
  ["send 5 to chidi", "5", "chidi"],
  ["send 5 usdc to chidi", "5", "chidi"],
  ["SEND 12.50 USDC TO Chidi", "12.50", "Chidi"],
  ["send 0.25 to chidi", "0.25", "chidi"],
  [`send 5 usdc to ${ADDRESS}`, "5", ADDRESS],
  ["send 5 usdc to +2348012345678", "5", "+2348012345678"],
  ["send 5 to +234 801 234 5678", "5", "+234 801 234 5678"],

  // Must fall through. Each of these has a real intent that a smarter tier
  // can read, and a guess here would be a guess about money.
  ["send 5 to chidi please", null, null],
  ["send 5 usdc to my landlord for rent", null, null],
  ["send 5 to mama chidi", null, null],
  ["send some money to chidi", null, null],
  ["send 5", null, null],
  ["send to chidi", null, null],
  ["send 0 to chidi", null, null],
  ["send -5 to chidi", null, null],
  ["can you send 5 to chidi", null, null],
  ["send 5 to chidi and 10 to ada", null, null],
  ["i want to send 5 usdc to chidi tomorrow", null, null],
];

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

for (const [text, expected] of [...TAPPED, ...TYPED]) {
  const got = fastPathDecode(text);
  check(
    JSON.stringify(text),
    (got?.intent ?? null) === expected,
    `got ${got?.intent ?? "null"}, expected ${expected ?? "null"}`,
  );
}

for (const [text, expectedAmount, expectedRecipient] of SENDS) {
  const got = fastPathDecode(text);

  if (expectedAmount === null) {
    check(
      `falls through: ${JSON.stringify(text)}`,
      got === null || got.intent !== "SEND" || got.amount === null,
      `got ${JSON.stringify(got)}`,
    );
    continue;
  }

  check(
    `parses: ${JSON.stringify(text)}`,
    got?.intent === "SEND" &&
      got.amount === expectedAmount &&
      got.recipient === expectedRecipient,
    `got ${JSON.stringify(got)}`,
  );
}

// Confidence is load-bearing downstream: tier 0 only fires on closed-set
// matches, so anything it returns must be maximally trusted.
check(
  "every tier-0 result carries confidence 1",
  ["balance", "send 5 to chidi", "Menu"].every(
    (t) => fastPathDecode(t)?.confidence === 1,
  ),
);

/**
 * The slash-command set, which is what Telegram's menu button renders.
 *
 * Every entry registered with setMyCommands has to resolve here, because a
 * command in that menu is one tap away and a tap that resolves to nothing is
 * the failure this whole set of tests exists to stop. /send is the one that
 * was broken: "send" is known only as a BUTTON TITLE, and titles were matched
 * before the leading slash came off.
 */
const SLASH: Array<[string, string]> = [
  ["/balance", "BALANCE"],
  ["/address", "ADDRESS"],
  ["/history", "HISTORY"],
  ["/help", "HELP"],
  ["/cancel", "CANCEL"],
  ["/start", "HELP"],
  ["/send", "SEND"],
  // Telegram appends @botname when several bots share a chat.
  ["/balance@cashtellaBot", "BALANCE"],
  ["/send@cashtellaBot", "SEND"],
];

for (const [text, expected] of SLASH) {
  const got = fastPathDecode(text);
  check(
    `slash command: ${JSON.stringify(text)}`,
    got?.intent === expected,
    `got ${got?.intent ?? "null"}, expected ${expected}`,
  );
}

const total = TAPPED.length + TYPED.length + SENDS.length + SLASH.length + 1;
console.log(`fast-path: ${passed}/${total} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
