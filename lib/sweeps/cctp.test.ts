/**
 * Pure CCTP builders and micro-USDC maths. Runner-free — run with `pnpm test`.
 *
 * What is pinned here is what decides where money goes and what it costs: the
 * mint recipient, the forwarding hook, the fee ceiling, the message the user's
 * wallet signs, and the arithmetic that must never touch a float.
 */

import {
  addressToBytes32,
  computeMaxFee,
  evmChainIdFor,
  forwardHookData,
  parseRouteFees,
  receiveAuthorizationTypedData,
  splitSignature,
  stepIdempotencyKey,
  ZERO_BYTES32,
} from "./cctp";
import { feeCeil, formatMicro, parseMicro, parseMicroTruncating, toMilliBps } from "./micro";

const B = (n: number) => BigInt(n);

const QUOTE = [
  { finalityThreshold: 1000, minimumFee: 0.325, forwardFee: { low: 16975, med: 17338, high: 19221 } },
  { finalityThreshold: 2000, minimumFee: 0, forwardFee: { low: 16975, med: 17338, high: 19221 } },
];

const ADDR = "0x1234567890AbcdEF1234567890aBcdef12345678";
const SIG = "0x" + "11".repeat(32) + "22".repeat(32) + "1b";

type Check = [string, () => boolean];

const CHECKS: Check[] = [
  // --- micro ---
  ["parses a whole number", () => parseMicro("12") === B(12_000_000)],
  ["parses six places exactly", () => parseMicro("0.000001") === B(1)],
  ["refuses a seventh place rather than trimming it", () => parseMicro("1.0000001") === null],
  ["refuses a negative", () => parseMicro("-1") === null],
  ["refuses an exponent", () => parseMicro("1e6") === null],
  ["truncates Circle's eighteen places down, never rounding up", () => parseMicroTruncating("25.999543733") === B(25_999_543)],
  ["formats without trailing zeros", () => formatMicro(B(12_500_000)) === "12.5"],
  ["formats a whole amount without a point", () => formatMicro(B(3_000_000)) === "3"],
  ["formats a sub-cent amount with leading zeros kept", () => formatMicro(B(1_050)) === "0.00105"],
  ["round-trips", () => formatMicro(parseMicro("123.456789")!) === "123.456789"],
  ["0.325 bps is 325 milli-bps", () => toMilliBps(0.325) === B(325)],
  ["a fee is rounded UP to the next micro-unit", () => feeCeil(B(1_000_000), B(325)) === B(33)],
  ["a zero rate costs nothing", () => feeCeil(B(1_000_000), B(0)) === B(0)],

  // --- addresses / hook ---
  [
    "an address is left-padded to 32 bytes, lowercased",
    () => addressToBytes32(ADDR) === "0x000000000000000000000000" + ADDR.slice(2).toLowerCase(),
  ],
  ["a malformed address is refused", () => { try { addressToBytes32("0x12"); return false; } catch { return true; } }],
  [
    "the forwarding hook is 32 bytes and starts with the cctp-forward tag",
    () => {
      const h = forwardHookData();
      return h.length === 2 + 64 && h.startsWith("0x636374702d666f7277617264") && h.endsWith("00".repeat(8));
    },
  ],
  ["the destination caller is zero", () => ZERO_BYTES32 === "0x" + "0".repeat(64)],

  // --- idempotency ---
  [
    "a step's idempotency key is a stable v4-shaped uuid",
    () => {
      const a = stepIdempotencyKey("sweep-1", "pull");
      return a === stepIdempotencyKey("sweep-1", "pull") &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a);
    },
  ],
  [
    "each step and each sweep gets its own key",
    () => new Set([
      stepIdempotencyKey("s1", "pull"), stepIdempotencyKey("s1", "approve"),
      stepIdempotencyKey("s1", "burn"), stepIdempotencyKey("s2", "pull"),
    ]).size === 4,
  ],

  // --- typed data ---
  [
    "the authorisation names the sweeper as recipient and carries uint256s as strings",
    () => {
      const d = JSON.parse(receiveAuthorizationTypedData({
        usdc: "0xusdc", chainId: 8453, from: ADDR, to: "0xsweeper",
        value: B(5_000_000), validAfter: 0, validBefore: 1_800_000_000, nonce: "0x" + "ab".repeat(32),
      }));
      return d.primaryType === "ReceiveWithAuthorization" &&
        d.message.to === "0xsweeper" && d.message.value === "5000000" &&
        d.domain.chainId === 8453 && d.domain.verifyingContract === "0xusdc" &&
        d.domain.name === "USD Coin" && d.domain.version === "2";
    },
  ],
  [
    "a signature splits into v, r, s",
    () => { const p = splitSignature(SIG); return p.v === 27 && p.r === "0x" + "11".repeat(32) && p.s === "0x" + "22".repeat(32); },
  ],
  ["a recovery id of 0/1 is lifted to 27/28", () => splitSignature("0x" + "11".repeat(64) + "01").v === 28],
  ["a short signature is refused", () => { try { splitSignature("0x1234"); return false; } catch { return true; } }],
  ["Base is sweepable, an unknown chain is not", () => evmChainIdFor("BASE") === 8453 && evmChainIdFor("MYSTERY") === null],

  // --- fee quote ---
  [
    "reads Circle's quote for the fast tier",
    () => { const r = parseRouteFees(QUOTE, 1000); return r.ok && r.fees.milliBps === B(325) && r.fees.forwardHigh === B(19221); },
  ],
  [
    "accepts `medium` where the live API says `med`",
    () => parseRouteFees([{ finalityThreshold: 1000, minimumFee: 1, forwardFee: { low: 1, medium: 2, high: 3 } }], 1000).ok,
  ],
  ["refuses a body that is not a list", () => !parseRouteFees({}, 1000).ok],
  ["refuses when the tier is not quoted", () => !parseRouteFees([QUOTE[1]], 1000).ok],
  ["refuses a missing forward fee rather than assuming free", () => !parseRouteFees([{ finalityThreshold: 1000, minimumFee: 1 }], 1000).ok],
  ["refuses a non-integer forward fee", () => !parseRouteFees([{ finalityThreshold: 1000, minimumFee: 1, forwardFee: { low: 1.5, med: 2, high: 3 } }], 1000).ok],
  ["refuses an absurd forward fee", () => !parseRouteFees([{ finalityThreshold: 1000, minimumFee: 1, forwardFee: { low: 1, med: 2, high: 5_000_000 } }], 1000).ok],

  // --- max fee ---
  [
    "10 USDC: fast fee plus the high forward tier",
    () => {
      const q = parseRouteFees(QUOTE, 1000);
      if (!q.ok) return false;
      const r = computeMaxFee(B(10_000_000), q.fees);
      // ceil(10_000_000 * 0.325bps) = 325, + 19_221
      return r.ok && r.maxFee === B(19_546) && r.net === B(10_000_000 - 19_546);
    },
  ],
  [
    "a sweep whose fee would exceed 10% is refused as too small",
    () => {
      const q = parseRouteFees(QUOTE, 1000);
      return q.ok && !computeMaxFee(B(100_000), q.fees).ok;
    },
  ],
  [
    "a sweep smaller than its own fee is refused",
    () => { const q = parseRouteFees(QUOTE, 1000); return q.ok && !computeMaxFee(B(10_000), q.fees).ok; },
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

console.log(`sweeps/cctp: ${passed}/${CHECKS.length} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
