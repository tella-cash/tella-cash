/**
 * Panic-code format and normalisation tests. Runner-free — run with
 * `pnpm test`. Exits non-zero on any failure.
 *
 * Hashing and verification are covered by the PIN module this reuses; what
 * is tested here is the part that is new and the part that decides whether a
 * frightened person retyping a code off paper gets in.
 */

import { generatePanicCode, normalizeCode } from "./panic-code";
import { hashPin, verifyPin } from "@/lib/auth/pin";

const CHECKS: Array<[string, () => boolean]> = [
  [
    "generated codes are 4 groups of 4",
    () => /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/.test(generatePanicCode()),
  ],
  [
    "generated codes exclude the confusable letters I, L, O and U",
    () => {
      for (let i = 0; i < 200; i++) {
        if (/[ILOU]/.test(generatePanicCode())) return false;
      }
      return true;
    },
  ],
  [
    "generated codes are not repeating",
    () => new Set(Array.from({ length: 200 }, generatePanicCode)).size === 200,
  ],
  [
    "normalising a generated code strips the separators",
    () => normalizeCode(generatePanicCode()).length === 16,
  ],
  // The forgiving cases. Each of these is somebody retyping correctly by any
  // reasonable standard, and each would fail a strict comparison.
  ["lowercase is accepted", () => normalizeCode("a1b2-c3d4") === "A1B2C3D4"],
  ["spaces instead of dashes", () => normalizeCode("A1B2 C3D4") === "A1B2C3D4"],
  ["no separators at all", () => normalizeCode("A1B2C3D4") === "A1B2C3D4"],
  ["extra whitespace", () => normalizeCode("  A1B2-C3D4  ") === "A1B2C3D4"],
  ["letter O read as zero", () => normalizeCode("AOB2") === "A0B2"],
  ["letter I read as one", () => normalizeCode("AIB2") === "A1B2"],
  ["letter L read as one", () => normalizeCode("ALB2") === "A1B2"],
  [
    "the same code typed three plausible ways normalises identically",
    () => {
      const a = normalizeCode("A1B2-C3D4-E5F6-G7H8");
      const b = normalizeCode("a1b2 c3d4 e5f6 g7h8");
      const c = normalizeCode("A1B2C3D4E5F6G7H8");
      return a === b && b === c;
    },
  ],
  // And the case that must NOT be forgiven.
  ["a different code does not normalise to the same value", () =>
    normalizeCode("A1B2-C3D4") !== normalizeCode("A1B2-C3D5")],
];

/**
 * The round trip that actually matters. Normalisation is only useful if it
 * survives hashing — a forgiving comparison that happens before the hash but
 * not after would still reject the frightened user retyping from paper.
 */
const ASYNC_CHECKS: Array<[string, () => Promise<boolean>]> = [
  [
    "a code verifies against its own hash",
    async () => {
      const code = generatePanicCode();
      const hash = await hashPin(normalizeCode(code));
      return verifyPin(normalizeCode(code), hash);
    },
  ],
  [
    "retyped lowercase with spaces still verifies",
    async () => {
      const code = generatePanicCode();
      const hash = await hashPin(normalizeCode(code));
      const retyped = code.toLowerCase().replace(/-/g, " ");
      return verifyPin(normalizeCode(retyped), hash);
    },
  ],
  [
    "retyped with no separators still verifies",
    async () => {
      const code = generatePanicCode();
      const hash = await hashPin(normalizeCode(code));
      return verifyPin(normalizeCode(code.replace(/-/g, "")), hash);
    },
  ],
  [
    "a different code does NOT verify",
    async () => {
      const hash = await hashPin(normalizeCode(generatePanicCode()));
      return !(await verifyPin(normalizeCode(generatePanicCode()), hash));
    },
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

const total = CHECKS.length + ASYNC_CHECKS.length;

async function main() {
  for (const [name, check] of ASYNC_CHECKS) {
    let ok = false;
    try {
      ok = await check();
    } catch (err) {
      failures.push(`  ✗ ${name} threw: ${(err as Error).message}`);
      continue;
    }
    if (ok) passed++;
    else failures.push(`  ✗ ${name}`);
  }

  console.log(`panic-code: ${passed}/${total} passed`);
  if (failures.length) {
    console.error("\nFailures:\n" + failures.join("\n"));
    process.exit(1);
  }
}

void main();
