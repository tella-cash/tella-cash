/**
 * Guided send flow tests. Runner-free — run with `npm test`.
 *
 * Two things are pinned here and they are not the same kind of thing.
 *
 * parseSendAmount decides how much money moves, from a string a person typed
 * in a chat window. The interesting column is REJECTED: every entry there is
 * something that could plausibly arrive at the "how much?" question, and
 * accepting any of them means a transfer for an amount the user did not name.
 *
 * The choice round-trip is the other half. A tapped option has to arrive back
 * as text identical to the label that was drawn, or the recipient the user
 * picked is not the recipient the send resolves. That contract is stated in
 * menus.ts and was previously guaranteed only by every title being a short
 * literal in that file; the moment the options became the user's own
 * beneficiary names it needed an encoding and a test.
 */
import {
  parseSendAmount,
  parseSendReply,
  beneficiaryChoices,
  isSendFlowPayload,
} from "./send-flow";
import { encodeChoiceData, titleForCallbackData, QUICK_CHOICES } from "./menus";
import type { Beneficiary } from "@/lib/supabase/types";

let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail = ""): void {
  if (ok) passed++;
  else failures.push(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

/* ---------- parseSendAmount ---------- */

const ACCEPTED: Array<[string, string]> = [
  ["5", "5"],
  ["  5  ", "5"],
  ["12.50", "12.50"],
  ["0.000001", "0.000001"],
  ["5 usdc", "5"],
  ["5USDC", "5"],
  ["usdc 5", "5"],
  ["1000", "1000"],
  // The digits are returned as typed, never round-tripped through a float.
  ["0.10", "0.10"],
];

const REJECTED: string[] = [
  // Not a number at all.
  "", "   ", "all of it", "the usual", "lots",
  // A number with an instruction wrapped around it. "5 to chidi" at the
  // amount step means the user answered a different question than the one
  // asked, and guessing which half is the amount is how the wrong person
  // gets paid.
  "5 to chidi", "send 5", "about 5", "5 or 6", "5, actually 10",
  // Zero and negatives. Number() accepts both and every downstream check is
  // a `>` comparison, so a zero would sail through as a valid transfer.
  "0", "0.0", "-5", "-0.5",
  // More precision than USDC has. Truncating silently would move a different
  // amount than the one on screen.
  "1.1234567",
  // Shapes that Number() forgives and a wallet must not.
  "1e3", "0x5", "Infinity", "NaN", "5.", ".5", "1,000", "５",
  // Currency the flow does not deal in.
  "5 ngn", "$5", "₦5000",
];

for (const [text, expected] of ACCEPTED) {
  const got = parseSendAmount(text);
  check(
    `accepts ${JSON.stringify(text)}`,
    got === expected,
    `got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`,
  );
}

for (const text of REJECTED) {
  const got = parseSendAmount(text);
  check(`rejects ${JSON.stringify(text)}`, got === null, `got ${JSON.stringify(got)}`);
}

/* ---------- parseSendReply: one answer, either slot, or both ---------- */

/**
 * The question is "who are you sending to?" and people do not answer it with
 * only a name. Reading the whole reply as a label meant "5 to chidi" was
 * looked up as a beneficiary of that name, which nobody has.
 *
 * The two rows that would send money to the WRONG PLACE if this split them are
 * called out below. A phone number with spaces ends in digits; a saved name
 * can too.
 */
const SLOTS: Array<[string, string | null, string | null]> = [
  // amount alone
  ["5", "5", null],
  ["5 usdc", "5", null],
  ["usdc 5", "5", null],
  ["12.50", "12.50", null],
  // recipient alone
  ["chidi", null, "chidi"],
  ["Mum", null, "Mum"],
  // both, amount first — with and without "to"
  ["5 to chidi", "5", "chidi"],
  ["5 chidi", "5", "chidi"],
  ["5 usdc to chidi", "5", "chidi"],
  ["12.50 to Mum", "12.50", "Mum"],
  ["send 5 to chidi", "5", "chidi"],
  // both, recipient first — how people actually reply to "5 USDC to who?"
  ["chidi 5", "5", "chidi"],
  ["Mum 12.50", "12.50", "Mum"],
  // A phone number written with spaces ends in digits. Splitting it would read
  // "5678" as the amount and send to a truncated number.
  ["+234 801 234 5678", null, "+234 801 234 5678"],
  ["5 to +234 801 234 5678", "5", "+234 801 234 5678"],
  // An address is never split either.
  [
    "0x1111111111111111111111111111111111111111",
    null,
    "0x1111111111111111111111111111111111111111",
  ],
  // Empty.
  ["", null, null],
  ["   ", null, null],
];

for (const [text, amount, recipient] of SLOTS) {
  const got = parseSendReply(text);
  check(
    `slots ${JSON.stringify(text)}`,
    got.amount === amount && got.recipient === recipient,
    `got ${JSON.stringify(got)}`,
  );
}

// A saved name ending in a number DOES split here, and that is deliberate:
// whether "Landlord 2" is a name is a fact about the user's address book, not
// about the string. handleSendFlowResponse checks saved labels against the
// whole reply first, so a saved name always wins. This pins the split so that
// the guard is never quietly removed as unnecessary.
check(
  "a trailing number splits — the address-book check at the call site is what prevents it",
  (() => {
    const r = parseSendReply("Landlord 2");
    return r.amount === "2" && r.recipient === "Landlord";
  })(),
);

/* ---------- payload narrowing ---------- */

check(
  "narrows a send payload",
  isSendFlowPayload({ action: "send", step: "recipient" }),
);
check(
  "does not narrow a freeze payload",
  !isSendFlowPayload({ action: "freeze", source: "whatsapp", reason: "x" }),
);
check(
  "does not narrow a decoder-flow payload",
  !isSendFlowPayload({ flow: "save_beneficiary", token: "opaque" }),
);

/* ---------- choice round-trip ---------- */

function beneficiary(label: string, id = "b1"): Beneficiary {
  return {
    id,
    user_id: "u1",
    label,
    recipient_user_id: null,
    recipient_address: "0x0000000000000000000000000000000000000000",
    recipient_whatsapp_number: null,
    created_at: new Date().toISOString(),
  };
}

// Static choices keep travelling as ids, so renaming a button's copy cannot
// stop it matching itself.
for (const c of QUICK_CHOICES) {
  check(
    `static choice round-trips: ${c.title}`,
    titleForCallbackData(encodeChoiceData(c)!) === c.title,
  );
}

// Dynamic ones carry their own title. The names below are the ones that would
// break a naive encoding: one that collides with a static button id, and one
// that is long enough to have been truncated by the old renderers.
const DYNAMIC_LABELS = [
  "Mum",
  "Chidi",
  "ubiquitous computing",
  "balance",
  "My address",
  "Landlord 2",
  "Ada's shop",
  "Zoë",
];

for (const label of DYNAMIC_LABELS) {
  const [choice] = beneficiaryChoices([beneficiary(label)]);
  const data = encodeChoiceData(choice);
  check(
    `dynamic choice round-trips: ${JSON.stringify(label)}`,
    data !== null && titleForCallbackData(data) === label,
    `data=${JSON.stringify(data)}`,
  );
}

// A beneficiary nicknamed after a button must not come back as that button.
const [balanceBene] = beneficiaryChoices([beneficiary("balance")]);
check(
  "a beneficiary named after a button does not collide with it",
  encodeChoiceData(balanceBene) !== "balance",
  `got ${JSON.stringify(encodeChoiceData(balanceBene))}`,
);

// Too long to round-trip in 64 bytes → null, so the renderer degrades the set
// to text instead of drawing a button whose data is clipped.
const overlong = beneficiaryChoices([beneficiary("é".repeat(40))])[0];
check(
  "refuses to encode a title that cannot fit callback_data",
  encodeChoiceData(overlong) === null,
);

check("unknown callback data resolves to null", titleForCallbackData("nope") === null);
check("empty dynamic payload resolves to null", titleForCallbackData("t:") === null);

/* ---------- offered list is bounded ---------- */

const many = Array.from({ length: 25 }, (_, i) => beneficiary(`Person ${i}`, `b${i}`));
check("caps how many saved names are offered", beneficiaryChoices(many).length === 8);
check("offers nothing when nothing is saved", beneficiaryChoices([]).length === 0);

const total =
  ACCEPTED.length +
  REJECTED.length +
  SLOTS.length +
  1 +
  3 +
  QUICK_CHOICES.length +
  DYNAMIC_LABELS.length +
  // The six standalone checks below the loops.
  6;

console.log(`send-flow: ${passed}/${total} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
