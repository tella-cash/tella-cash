// register-entity-secret.ts
//
// The two safe halves of Circle setup: register an entity secret, create a
// wallet set. Nothing here moves money, touches a faucet, or creates a user
// wallet, so it is the one setup script that can be pointed at a live API key.
//
// Run it with the environment you are setting up:
//
//   pnpm tsx --env-file=.env.production register-entity-secret.ts
//
// Then paste the two printed values into that same file and into Vercel.
//
// WHY NOT create-wallet.ts
//
// That script is testnet onboarding: it drips from the faucet and moves 5
// USDC between two throwaway wallets, which on mainnet would be real money.
//
// WHAT AN ENTITY SECRET IS
//
// A 32-byte secret you generate. Circle never sees it — only a ciphertext of
// it, re-encrypted per request — so it cannot be looked up later. Lose it
// without the recovery file and every wallet created under it is unusable.
// The recovery file this writes is the only way back. Keep it somewhere that
// outlives this laptop.

// Marks this file a module rather than a global script, so its top-level
// declarations do not collide with the other root scripts.
export {};

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  registerEntitySecretCiphertext,
  initiateDeveloperControlledWalletsClient,
} from "@circle-fin/developer-controlled-wallets";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "output");

async function main() {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "CIRCLE_API_KEY is required. Run with --env-file=.env.production, or set it in the environment.",
    );
  }

  // Refused rather than overwritten. Registering a second entity secret makes
  // every wallet created under the first one unusable, and the failure would
  // only show up later, when a transfer could not be signed.
  if (process.env.CIRCLE_ENTITY_SECRET) {
    throw new Error(
      "CIRCLE_ENTITY_SECRET is already set in this environment. Registering another one would orphan every wallet created under the current one. Clear it first if you really mean to re-register.",
    );
  }

  const live = apiKey.startsWith("LIVE");
  console.log(
    live
      ? "Using a LIVE Circle key. Wallets created under this entity secret will hold real money."
      : "Using a TEST Circle key (sandbox / testnet).",
  );

  const walletSetName = process.argv[2] ?? (live ? "tella mainnet" : "tella testnet");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const entitySecret = crypto.randomBytes(32).toString("hex");

  console.log("\nRegistering entity secret…");
  await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: OUTPUT_DIR,
  });
  console.log(`Registered. Recovery file written to ${OUTPUT_DIR}/`);

  console.log(`\nCreating wallet set "${walletSetName}"…`);
  const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  const walletSet = (await client.createWalletSet({ name: walletSetName })).data?.walletSet;
  if (!walletSet?.id) {
    // The secret IS registered at this point, so it must still be printed:
    // losing it here would mean re-registering and orphaning this one.
    console.error(
      `\nWallet set creation failed, but the entity secret is registered. Save it now:\n\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`,
    );
    throw new Error("createWalletSet returned no wallet set id");
  }

  console.log("\nDone. Put these in .env.production and in Vercel:\n");
  console.log(`CIRCLE_ENTITY_SECRET=${entitySecret}`);
  console.log(`CIRCLE_WALLET_SET_ID=${walletSet.id}`);
  console.log(
    [
      "",
      "Then:",
      `  1. Move ${OUTPUT_DIR}/recovery_file_*.dat somewhere durable and private.`,
      "     It is the only way to recover the entity secret.",
      "  2. Never commit either value. Both belong in the environment only.",
      "  3. Once users hold wallets under this wallet set, neither value can be",
      "     swapped without re-provisioning every one of them.",
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error("\nFailed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
