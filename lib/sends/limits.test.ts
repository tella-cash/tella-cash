/**
 * mergeLimits tests. Runner-free — run with `pnpm test`. Exits non-zero on
 * any failure.
 *
 * The rule under test is small and easy to get subtly wrong, and getting it
 * wrong in the generous direction means a compromised account can spend more
 * than the deployment intended.
 */

import { mergeLimits } from "./limits";

const DEFAULTS = { perTx: 100, daily: 500 };

type Case = [string, ReturnType<typeof mergeLimits>, { perTx: number; daily: number; customised: boolean }];

const CASES: Case[] = [
  [
    "no override row: the defaults, untouched",
    mergeLimits(null, DEFAULTS),
    { perTx: 100, daily: 500, customised: false },
  ],
  [
    "a row of all NULLs still means the defaults, but is marked customised",
    mergeLimits({ per_tx_cap_usdc: null, daily_cap_usdc: null }, DEFAULTS),
    { perTx: 100, daily: 500, customised: true },
  ],
  [
    "a lower per-tx override binds",
    mergeLimits({ per_tx_cap_usdc: 20, daily_cap_usdc: null }, DEFAULTS),
    { perTx: 20, daily: 500, customised: true },
  ],
  [
    "one column may be overridden while the other falls back",
    mergeLimits({ per_tx_cap_usdc: null, daily_cap_usdc: 200 }, DEFAULTS),
    { perTx: 100, daily: 200, customised: true },
  ],
  [
    "both overridden",
    mergeLimits({ per_tx_cap_usdc: 10, daily_cap_usdc: 50 }, DEFAULTS),
    { perTx: 10, daily: 50, customised: true },
  ],

  // The one that matters. An override is a user's own ceiling, never a
  // licence to exceed the deployment cap — so tightening the env var during
  // an incident still binds a user who set themselves a higher limit.
  [
    "a HIGHER per-tx override does not raise the deployment cap",
    mergeLimits({ per_tx_cap_usdc: 5000, daily_cap_usdc: null }, DEFAULTS),
    { perTx: 100, daily: 500, customised: true },
  ],
  [
    "a HIGHER daily override does not raise the deployment cap",
    mergeLimits({ per_tx_cap_usdc: null, daily_cap_usdc: 100000 }, DEFAULTS),
    { perTx: 100, daily: 500, customised: true },
  ],
  [
    "a tightened deployment default overrides a previously-lower user value",
    mergeLimits({ per_tx_cap_usdc: 50, daily_cap_usdc: 400 }, { perTx: 10, daily: 20 }),
    { perTx: 10, daily: 20, customised: true },
  ],

  // Defensive: the CHECK constraint forbids these, but the money path should
  // not depend on a constraint it cannot see from here.
  [
    "a zero override is ignored rather than disabling sending",
    mergeLimits({ per_tx_cap_usdc: 0, daily_cap_usdc: null }, DEFAULTS),
    { perTx: 100, daily: 500, customised: true },
  ],
  [
    "a negative override is ignored",
    mergeLimits({ per_tx_cap_usdc: -5, daily_cap_usdc: null }, DEFAULTS),
    { perTx: 100, daily: 500, customised: true },
  ],
  [
    "a NaN override is ignored",
    mergeLimits({ per_tx_cap_usdc: NaN, daily_cap_usdc: null }, DEFAULTS),
    { perTx: 100, daily: 500, customised: true },
  ],
];

let passed = 0;
const failures: string[] = [];

for (const [name, got, expected] of CASES) {
  const ok =
    got.perTx === expected.perTx &&
    got.daily === expected.daily &&
    got.customised === expected.customised;
  if (ok) passed++;
  else failures.push(`  ✗ ${name}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
}

console.log(`limits: ${passed}/${CASES.length} passed`);
if (failures.length) {
  console.error("\nFailures:\n" + failures.join("\n"));
  process.exit(1);
}
