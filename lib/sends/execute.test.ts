/**
 * Tests for the pure parts of the send path. Runner-free — run with
 * `pnpm test`. Exits non-zero on any failure.
 *
 * The classification below decides whether a user is told "your balance is
 * unchanged" or "I can't tell whether that went through". Getting it wrong
 * in the safe direction costs a balance check; getting it wrong in the
 * other direction means telling someone their money didn't move when it
 * did, and they send again. That asymmetry is the whole design here, so
 * these cases are worth pinning down.
 */

import {
  isAmbiguousFailure,
  formatSendResultForChat,
  sendFailureStatus,
} from "./execute";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failures.push(
      `  ✗ ${name}\n      got:      ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`,
    );
  }
}

/* ---------- isAmbiguousFailure ---------- */

// Definite rejections: Circle answered and said no. Nothing was submitted.
check("400 is a definite rejection", isAmbiguousFailure({ status: 400 }), false);
check("401 is a definite rejection", isAmbiguousFailure({ status: 401 }), false);
check("403 is a definite rejection", isAmbiguousFailure({ status: 403 }), false);
check("404 is a definite rejection", isAmbiguousFailure({ status: 404 }), false);
check("422 is a definite rejection", isAmbiguousFailure({ status: 422 }), false);

// Ambiguous: the request may have been accepted before things went wrong.
check("500 is ambiguous", isAmbiguousFailure({ status: 500 }), true);
check("502 is ambiguous", isAmbiguousFailure({ status: 502 }), true);
check("503 is ambiguous", isAmbiguousFailure({ status: 503 }), true);
check(
  "429 is ambiguous (a burst's first request may have landed)",
  isAmbiguousFailure({ status: 429 }),
  true,
);

// No status at all — a timeout, a socket reset, a thrown TypeError. We
// learned nothing about Circle's side, so it must not be called a failure.
check("timeout with no status is ambiguous", isAmbiguousFailure(new Error("ETIMEDOUT")), true);
check("null error is ambiguous", isAmbiguousFailure(null), true);
check("undefined error is ambiguous", isAmbiguousFailure(undefined), true);
check("string error is ambiguous", isAmbiguousFailure("socket hang up"), true);
check(
  "non-numeric status is ambiguous",
  isAmbiguousFailure({ status: "500" }),
  true,
);

/* ---------- formatSendResultForChat ---------- */

const unchanged = "Your balance is unchanged";

check(
  "a definite failure may say the balance is unchanged",
  formatSendResultForChat({ ok: false, reason: "transfer_failed" }).includes(unchanged),
  true,
);
check(
  "an ambiguous failure must NOT say the balance is unchanged",
  formatSendResultForChat({ ok: false, reason: "transfer_unknown" }).includes(unchanged),
  false,
);
check(
  "an ambiguous failure tells the user to check their balance",
  formatSendResultForChat({ ok: false, reason: "transfer_unknown" })
    .toLowerCase()
    .includes("balance"),
  true,
);
check(
  "a duplicate confirm says it did not send twice",
  formatSendResultForChat({ ok: false, reason: "already_used" }).includes("twice"),
  true,
);
check(
  "an over-cap send explains the cap",
  formatSendResultForChat({
    ok: false,
    reason: "limit",
    failure: { kind: "over_per_tx", cap: 100, requested: 250 },
  }).includes("100"),
  true,
);
check(
  "insufficient balance reports what is actually available",
  formatSendResultForChat({
    ok: false,
    reason: "limit",
    failure: { kind: "insufficient", available: 3.5, requested: 10 },
  }).includes("3.5"),
  true,
);
check(
  "a failed balance check does not claim the balance is unchanged",
  formatSendResultForChat({
    ok: false,
    reason: "limit",
    failure: { kind: "check_failed" },
  }).includes(unchanged),
  false,
);

/* ---------- sendFailureStatus ---------- */

check("limit breaches are 422, not 502", sendFailureStatus("limit"), 422);
check("a reused link is 409", sendFailureStatus("already_used"), 409);
check("an inactive wallet is 409", sendFailureStatus("wallet_inactive"), 409);
check("a definite transfer failure is 502", sendFailureStatus("transfer_failed"), 502);
check("an ambiguous transfer failure is 502", sendFailureStatus("transfer_unknown"), 502);

const total = passed + failures.length;
console.log(`execute: ${passed}/${total} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
