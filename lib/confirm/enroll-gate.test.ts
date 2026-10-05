/**
 * Who may enroll a passkey from a confirm link, and what it costs them.
 * Runner-free — run with `pnpm test`.
 *
 * The rule under test: holding the link proves possession of the LINK, not of
 * the account. So a passkey may be added with no proof only while the account
 * has no factor at all; a PIN-only account must prove that PIN, through the
 * same limiter a PIN confirm uses; anything else is refused.
 */

import type { tellaUser } from "@/lib/supabase/types";
import { enrollmentGateFor, type FactorSet } from "@/lib/auth/factors";
import { authorizeEnrollment, type EnrollmentDeps } from "./enroll-gate";

const factors = (over: Partial<FactorSet> = {}): FactorSet => ({
  pin: false,
  passkey: false,
  totp: false,
  ...over,
});

const user = (over: Partial<tellaUser> = {}): tellaUser =>
  ({ id: "u1", pin_hash: null, ...over }) as unknown as tellaUser;

interface Calls {
  attempts: number;
  resets: number;
  verified: string[];
}

/** Deps with a scripted outcome, recording what the gate touched. */
function deps(opts: {
  factors: FactorSet;
  pinOk?: boolean;
  allowed?: boolean;
  retryAfterSeconds?: number;
}): { d: EnrollmentDeps; calls: Calls } {
  const calls: Calls = { attempts: 0, resets: 0, verified: [] };
  const d: EnrollmentDeps = {
    listFactors: async () => opts.factors,
    recordAuthAttempt: (async () => {
      calls.attempts++;
      return opts.allowed === false
        ? { allowed: false, retryAfterSeconds: opts.retryAfterSeconds ?? 60 }
        : { allowed: true };
    }) as unknown as EnrollmentDeps["recordAuthAttempt"],
    resetAuthAttempts: (async () => {
      calls.resets++;
    }) as unknown as EnrollmentDeps["resetAuthAttempts"],
    verifyPin: async (pin) => {
      calls.verified.push(pin);
      return opts.pinOk ?? false;
    },
  };
  return { d, calls };
}

type Check = [string, () => boolean | Promise<boolean>];

const CHECKS: Check[] = [
  // the pure rule
  ["no factor at all: open", () => enrollmentGateFor(factors()) === "open"],
  ["a PIN and nothing else: needs the PIN", () => enrollmentGateFor(factors({ pin: true })) === "needs_pin"],
  ["a passkey already: refused", () => enrollmentGateFor(factors({ passkey: true })) === "refused"],
  ["a PIN and a passkey: refused", () => enrollmentGateFor(factors({ pin: true, passkey: true })) === "refused"],
  ["any other factor present: refused", () =>
    enrollmentGateFor(factors({ totp: true })) === "refused" &&
    enrollmentGateFor(factors({ pin: true, totp: true })) === "refused"],

  // bootstrap: a new user, nothing to bypass
  ["first enrollment needs no PIN and touches no limiter", async () => {
    const { d, calls } = deps({ factors: factors() });
    const r = await authorizeEnrollment(user(), undefined, d);
    return r.ok && !r.steppedUp && calls.attempts === 0 && calls.verified.length === 0;
  }],

  // the new path
  ["PIN account with the right PIN is let in, and says it was stepped up", async () => {
    const { d, calls } = deps({ factors: factors({ pin: true }), pinOk: true });
    const r = await authorizeEnrollment(user({ pin_hash: "h" }), "1234", d);
    return r.ok && r.steppedUp && calls.verified[0] === "1234" && calls.resets === 1;
  }],
  ["PIN account with no PIN is refused 401, nothing counted or checked", async () => {
    const { d, calls } = deps({ factors: factors({ pin: true }), pinOk: true });
    const r = await authorizeEnrollment(user({ pin_hash: "h" }), undefined, d);
    return !r.ok && r.status === 401 && calls.attempts === 0 && calls.verified.length === 0;
  }],
  ["an empty or non-string PIN is treated as no PIN", async () => {
    const { d } = deps({ factors: factors({ pin: true }), pinOk: true });
    const u = user({ pin_hash: "h" });
    const results = await Promise.all([
      authorizeEnrollment(u, "", d),
      authorizeEnrollment(u, 1234, d),
      authorizeEnrollment(u, null, d),
      authorizeEnrollment(u, ["1234"], d),
    ]);
    return results.every((r) => !r.ok && r.status === 401);
  }],
  ["a wrong PIN is refused 401, counted, and never resets the limiter", async () => {
    const { d, calls } = deps({ factors: factors({ pin: true }), pinOk: false });
    const r = await authorizeEnrollment(user({ pin_hash: "h" }), "0000", d);
    return !r.ok && r.status === 401 && calls.attempts === 1 && calls.resets === 0;
  }],
  ["a locked-out account is refused 429 WITHOUT checking the PIN", async () => {
    const { d, calls } = deps({ factors: factors({ pin: true }), pinOk: true, allowed: false, retryAfterSeconds: 120 });
    const r = await authorizeEnrollment(user({ pin_hash: "h" }), "1234", d);
    return !r.ok && r.status === 429 && r.retryAfter === 120 && calls.verified.length === 0;
  }],
  ["the attempt is counted before the PIN is checked", async () => {
    const order: string[] = [];
    const { d } = deps({ factors: factors({ pin: true }), pinOk: true });
    const wrapped: EnrollmentDeps = {
      ...d,
      recordAuthAttempt: (async (...a: unknown[]) => {
        order.push("count");
        return (d.recordAuthAttempt as (...x: unknown[]) => Promise<unknown>)(...a);
      }) as unknown as EnrollmentDeps["recordAuthAttempt"],
      verifyPin: async (pin, stored) => {
        order.push("verify");
        return d.verifyPin(pin, stored);
      },
    };
    await authorizeEnrollment(user({ pin_hash: "h" }), "1234", wrapped);
    return order.join(",") === "count,verify";
  }],
  ["the attempt uses the SAME limiter scope as a PIN confirm", async () => {
    let scope = "";
    const { d } = deps({ factors: factors({ pin: true }), pinOk: true });
    const wrapped: EnrollmentDeps = {
      ...d,
      recordAuthAttempt: (async (_id: string, s: string) => {
        scope = s;
        return { allowed: true };
      }) as unknown as EnrollmentDeps["recordAuthAttempt"],
    };
    await authorizeEnrollment(user({ pin_hash: "h" }), "1234", wrapped);
    return scope === "pin_verify";
  }],

  // still refused: the link alone must never be enough
  ["an account that already has a passkey is refused 409 even with the right PIN", async () => {
    const { d, calls } = deps({ factors: factors({ pin: true, passkey: true }), pinOk: true });
    const r = await authorizeEnrollment(user({ pin_hash: "h" }), "1234", d);
    return !r.ok && r.status === 409 && calls.attempts === 0 && calls.verified.length === 0;
  }],
  ["a passkey-only account is refused 409", async () => {
    const { d } = deps({ factors: factors({ passkey: true }), pinOk: true });
    const r = await authorizeEnrollment(user(), "1234", d);
    return !r.ok && r.status === 409;
  }],
];

(async () => {
  let failed = 0;
  for (const [name, fn] of CHECKS) {
    let ok = false;
    try {
      ok = await fn();
    } catch (err) {
      console.error("  threw:", err);
    }
    if (!ok) {
      failed++;
      console.error(`FAIL  ${name}`);
    }
  }
  if (failed) {
    console.error(`${failed} of ${CHECKS.length} enrollment-gate checks failed`);
    process.exit(1);
  }
  console.log(`enroll-gate: ${CHECKS.length} checks passed`);
})();
