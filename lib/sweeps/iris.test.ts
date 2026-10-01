/**
 * Iris delivery reading. Runner-free — run with `pnpm test`.
 *
 * Adapted from the xebra project's delivery tests. The reader must never
 * throw on a body it does not recognise, and must never call something
 * delivered that Circle has not said is.
 */

import { readDelivery } from "./iris";

const msg = (m: Record<string, unknown>) => ({ messages: [m] });

type Check = [string, () => boolean];

const CHECKS: Check[] = [
  ["no messages is waiting", () => readDelivery({ messages: [] }).state === "waiting"],
  ["garbage is waiting, not an error", () => readDelivery("nope").state === "waiting" && readDelivery(null).state === "waiting"],
  ["pending confirmations is waiting", () => readDelivery(msg({ status: "pending_confirmations", attestation: "PENDING" })).state === "waiting"],
  [
    "attested with a forward in progress is forwarding",
    () => readDelivery(msg({ status: "complete", attestation: "0xabc", forwardState: "PENDING" })).state === "forwarding",
  ],
  [
    "a completed forward is delivered, with the Arc hash",
    () => {
      const d = readDelivery(msg({ status: "complete", attestation: "0xabc", forwardState: "COMPLETE", forwardTxHash: "0xarc" }));
      return d.state === "delivered" && d.forwardTxHash === "0xarc";
    },
  ],
  [
    "a failed forward carries Circle's reason",
    () => {
      const d = readDelivery(msg({ status: "complete", attestation: "0xabc", forwardState: "FAILED", forwardErrorCode: "INSUFFICIENT_FEE" }));
      return d.state === "failed" && d.reason === "INSUFFICIENT_FEE";
    },
  ],
  [
    "a failure is reported even before the attestation is final",
    () => readDelivery(msg({ status: "pending_confirmations", forwardState: "FAILED" })).state === "failed",
  ],
  [
    "attested with no forward state at all is claimable",
    () => readDelivery(msg({ status: "complete", attestation: "0xabc" })).state === "claimable",
  ],
  [
    "the forward state is read case-insensitively",
    () => readDelivery(msg({ status: "complete", attestation: "0xabc", forwardState: "complete", forwardTxHash: "0x1" })).state === "delivered",
  ],
];

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

console.log(`sweeps/iris: ${passed}/${CHECKS.length} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
