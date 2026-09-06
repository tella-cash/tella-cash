/**
 * Spend-reservation parsing tests. Runner-free — run with `npm test`.
 *
 * The reservation itself is one Postgres call and cannot be exercised without
 * a database. What CAN be pinned here is everything around it, and it is the
 * part that decides whether money moves when the answer is unclear.
 *
 * The rule under test is fail-closed: any response this cannot read as a
 * definite yes must refuse the send. A wrong "no" costs the user a retry; a
 * wrong "yes" moves money with nothing reserved against the daily cap and
 * nothing to complete or roll back afterwards.
 *
 * The second thing pinned is the Infinity → null conversion. Caps are off by
 * default (lib/sends/limits.ts), which means "no cap" is the COMMON path, not
 * an edge case — and sending Infinity to Postgres as a numeric is a runtime
 * error that would refuse every send on a deployment with no caps set.
 */
import { parseReservationRow, capParam } from "./repository";

let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail = ""): void {
  if (ok) passed++;
  else failures.push(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

/* ---------- capParam ---------- */

const CAPS: Array<[number, number | null]> = [
  [500, 500],
  [0.5, 0.5],
  // "No cap" is how the deployment ships. It must reach the RPC as null.
  [Infinity, null],
  [-Infinity, null],
  [NaN, null],
];

for (const [input, expected] of CAPS) {
  check(
    `capParam(${input}) = ${expected}`,
    capParam(input) === expected,
    `got ${capParam(input)}`,
  );
}

/* ---------- parseReservationRow: the yes ---------- */

const ALLOWED = { allowed: true, transaction_id: "tx-1", already: 25 };

check(
  "a plain allowed row reserves",
  (() => {
    const r = parseReservationRow(ALLOWED);
    return r.ok && r.transactionId === "tx-1" && r.already === 25;
  })(),
);

check(
  "supabase's one-element array form is read identically",
  (() => {
    const r = parseReservationRow([ALLOWED]);
    return r.ok && r.transactionId === "tx-1";
  })(),
);

check(
  "numeric comes back from postgres as a string and is still a number",
  (() => {
    const r = parseReservationRow({ ...ALLOWED, already: "25.5" });
    return r.ok && r.already === 25.5;
  })(),
);

/* ---------- parseReservationRow: the refusals, kept distinct ---------- */

check(
  "over the cap is over_cap, and carries the total for the message",
  (() => {
    const r = parseReservationRow({ allowed: false, transaction_id: null, already: 480 });
    return !r.ok && r.reason === "over_cap" && r.already === 480;
  })(),
);

// Everything below must be "unavailable", not "over_cap". Reporting a database
// problem as "you have spent too much today" is a false statement about
// someone's money, and it tells them to wait 24 hours for something a retry
// would fix.
const UNAVAILABLE: Array<[string, unknown]> = [
  ["null data", null],
  ["undefined data", undefined],
  ["an empty array", []],
  ["a scalar", 42],
  ["a string", "nope"],
  // Allowed, but with no row to complete or roll back — incoherent, since the
  // function inserts before it answers yes.
  ["allowed with no transaction id", { allowed: true, transaction_id: null, already: 0 }],
  ["allowed with an empty transaction id", { allowed: true, transaction_id: "", already: 0 }],
  ["allowed with a non-string transaction id", { allowed: true, transaction_id: 7, already: 0 }],
];

for (const [label, input] of UNAVAILABLE) {
  const r = parseReservationRow(input);
  check(
    `refuses as unavailable: ${label}`,
    !r.ok && r.reason === "unavailable",
    `got ${JSON.stringify(r)}`,
  );
}

/* ---------- truthiness must not stand in for allowance ---------- */

// `allowed` is compared against the literal true. A string "false", which is
// what a mis-shaped response could carry, is truthy — and would otherwise
// authorize a transfer the database refused.
const NOT_TRUE: unknown[] = ["false", "true", 1, 0, {}, [], null];

for (const value of NOT_TRUE) {
  const r = parseReservationRow({ allowed: value, transaction_id: "tx-1", already: 0 });
  check(
    `allowed: ${JSON.stringify(value)} does not authorize a send`,
    !r.ok,
    `got ${JSON.stringify(r)}`,
  );
}

// A malformed `already` must not become NaN — every downstream comparison
// against it is a `>` test, and NaN compares false against everything.
check(
  "an unreadable total falls back to 0 rather than NaN",
  (() => {
    const r = parseReservationRow({ allowed: false, transaction_id: null, already: "lots" });
    return !r.ok && r.reason === "over_cap" && r.already === 0;
  })(),
);

const total = CAPS.length + 3 + 1 + UNAVAILABLE.length + NOT_TRUE.length + 1;

console.log(`reservation: ${passed}/${total} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
