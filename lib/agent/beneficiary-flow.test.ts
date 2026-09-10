/**
 * beneficiary-flow tests. Runner-free — run with `npm test`.
 *
 * This file is the reason the beneficiary offer no longer needs sendam-ai, so
 * it carries the cases the decoder used to absorb. The one that matters most
 * is the third group: replies that are neither yes nor no. Those are read as
 * a proposed NAME and offered back, so a wrong answer here does not merely
 * misfire — it either saves a recipient under "what time does it arrive" or
 * throws away a name the user actually typed.
 */
import {
  MAX_PROPOSED_LABEL_LENGTH,
  isBeneficiaryPayload,
  isValidBeneficiaryLabel,
  readConfirmReply,
} from "./beneficiary-flow";
import type { BeneficiaryPendingPayload } from "@/lib/supabase/types";

const failures: string[] = [];
let passed = 0;
let total = 0;

function check(label: string, condition: boolean): void {
  total++;
  if (condition) passed++;
  else failures.push(`  ✗ ${label}`);
}

const PAYLOAD: BeneficiaryPendingPayload = {
  action: "save_beneficiary",
  step: "confirm",
  recipientAddress: "0x1111111111111111111111111111111111111111",
  recipientUserId: null,
  recipientWhatsappNumber: null,
  suggestedLabel: "0x1111…1111",
};

const PROPOSED: BeneficiaryPendingPayload = { ...PAYLOAD, proposedLabel: "Chidi" };

// ---------------------------------------------------------------------------
// The payload guard.
// ---------------------------------------------------------------------------

check("guard accepts a beneficiary payload", isBeneficiaryPayload(PAYLOAD));
check(
  "guard rejects a freeze confirmation",
  !isBeneficiaryPayload({ action: "freeze", source: "whatsapp", reason: "x" }),
);
check(
  "guard rejects a guided-send payload",
  // `action: "send"` is the near miss the guard exists for: both payloads
  // carry an `action`, so anything looser than a literal match would narrow
  // a send row to this shape and read an address off something with none.
  !isBeneficiaryPayload({ action: "send", step: "recipient" }),
);
check(
  "guard rejects a sendam-ai flow payload",
  !isBeneficiaryPayload({ flow: "faucet_asset", token: "opaque" }),
);

// ---------------------------------------------------------------------------
// Yes.
// ---------------------------------------------------------------------------

for (const t of ["yes", "Yes", "  yes  ", "yeah", "yep", "y", "ok", "okay", "confirm", "confirmed", "do it", "go ahead", "yes!"]) {
  const reading = readConfirmReply(t, PAYLOAD);
  check(
    `yes: ${JSON.stringify(t)} accepted with no name yet`,
    reading.kind === "accepted" && reading.label === null,
  );
}

// A yes that lands on an already-proposed name saves under it directly,
// rather than asking for a name the user has already given.
{
  const reading = readConfirmReply("yes", PROPOSED);
  check(
    "yes on a proposal carries the proposed name",
    reading.kind === "accepted" && reading.label === "Chidi",
  );
}

// ---------------------------------------------------------------------------
// No. Checked before yes and before the name reading, so a user reaching for
// "cancel" gets out instead of being saved as a beneficiary called "cancel".
// ---------------------------------------------------------------------------

for (const t of ["no", "No", "nope", "nah", "n", "cancel", "stop", "not now", "nevermind", "never mind", "no thanks", "don't", "no."]) {
  check(`no: ${JSON.stringify(t)} declines`, readConfirmReply(t, PAYLOAD).kind === "declined");
}

// And a no on a proposal declines, rather than being read as a second name.
check("no on a proposal declines", readConfirmReply("no", PROPOSED).kind === "declined");

// ---------------------------------------------------------------------------
// Neither — read as a proposed name and offered back.
// ---------------------------------------------------------------------------

const PROPOSALS: Array<[string, string]> = [
  ["Chidi", "Chidi"],
  ["  Mum  ", "Mum"],
  ["Landlord 2", "Landlord 2"],
  ["my landlord", "my landlord"],
  ["Yes-Man", "Yes-Man"],
  // Anchoring is what protects this one: "yes" as a substring must not be
  // read as consent when the whole message is a name.
  ["Yesenia", "Yesenia"],
  ["No'ah", "No'ah"],
];

for (const [input, expected] of PROPOSALS) {
  const reading = readConfirmReply(input, PAYLOAD);
  check(
    `proposal: ${JSON.stringify(input)} -> ${JSON.stringify(expected)}`,
    reading.kind === "proposed" && reading.label === expected,
  );
}

// A second name at the proposal step is a correction, not noise.
{
  const reading = readConfirmReply("Adaeze", PROPOSED);
  check(
    "a new name replaces an unconfirmed proposal",
    reading.kind === "proposed" && reading.label === "Adaeze",
  );
}

// ---------------------------------------------------------------------------
// Unreadable. Nothing here may become a name.
// ---------------------------------------------------------------------------

const UNREADABLE = [
  "",
  "   ",
  // Someone typing a paragraph is not proposing a name, and quoting it back
  // in full would be nonsense.
  "a".repeat(MAX_PROPOSED_LABEL_LENGTH + 1),
  // A multi-line reply is a message, not a name.
  "Chidi\nactually wait",
  "line one\r\nline two",
];

for (const t of UNREADABLE) {
  check(
    `unreadable: ${JSON.stringify(t.slice(0, 24))}`,
    readConfirmReply(t, PAYLOAD).kind === "unreadable",
  );
}

// A reply of exactly the limit is still a proposal — the boundary is
// inclusive, and an off-by-one here silently drops a real name.
check(
  "a name of exactly the maximum length is still proposed",
  readConfirmReply("a".repeat(MAX_PROPOSED_LABEL_LENGTH), PAYLOAD).kind === "proposed",
);

// ---------------------------------------------------------------------------
// Label validation. Looser than a user's own name, and capped at 30 because
// lib/meta/client.ts matches a tapped button title back against saved labels.
// ---------------------------------------------------------------------------

for (const t of ["Mum", "Chidi", "Landlord 2", "Ade-Bola", "O'Brien", "  Mum  ", "Zainab Musa"]) {
  check(`valid label: ${JSON.stringify(t)}`, isValidBeneficiaryLabel(t));
}

for (const t of [
  "",
  " ",
  "M",
  "a".repeat(31),
  // Trailing/leading punctuation the pattern refuses, so a label always
  // starts and ends on a letter or a digit.
  "-Mum",
  "Mum-",
  "Mum!",
  "@chidi",
  "0x1111111111111111111111111111111111111111",
]) {
  check(`invalid label: ${JSON.stringify(t.slice(0, 24))}`, !isValidBeneficiaryLabel(t));
}

console.log(`beneficiary-flow: ${passed}/${total} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
