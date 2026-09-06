// set-telegram-commands.ts
//
// Registers the bot's command list with Telegram.
//
// THIS IS THE FIX FOR "the menu button opens and then nothing happens".
//
// Telegram's ☰ Menu button, to the left of the compose bar, is bound by
// default to whatever setMyCommands last registered. Nothing in this
// repository had ever called it, so the list was empty: tapping Menu opened
// a sheet, showed a spinner while it fetched nothing, and closed again. From
// the user's side that is indistinguishable from a broken button, and it is
// the first thing anyone taps on a bot they have just linked — which the
// linking message makes worse by ending with "Try /help to see what I do
// here", pointing at a menu that could not answer.
//
// setWebhook was documented in migrations/README.md and setMyCommands was
// not, so this is a deployment step that never existed rather than one that
// regressed.
//
// EVERY COMMAND BELOW IS VERIFIED TO RESOLVE. A command in this menu is one
// tap away, so an entry that falls through to "I didn't understand" is worse
// than no entry at all. The first six resolve in lib/agent/fast-path.ts
// (tier 0, no network); freeze and unfreeze are matched even earlier, by the
// local detectors in lib/agent/handler.ts, which is deliberate — the kill
// switch must not depend on the decoder being up. See fast-path.test.ts.
//
// Deliberately NOT listed: /faucet, which only resolves through the decoder
// and is testnet-only, and /reset, which isResetRequest does not match as a
// bare word.
//
// Idempotent — safe to re-run after changing the list. Run with env loaded:
//   pnpm tsx --env-file=.env set-telegram-commands.ts

// Marks this file a module rather than a global script. The root-level
// helpers here share one scope otherwise, and create-content-templates.ts
// also declares a top-level `main` — tsc reports that as a duplicate
// implementation across two files that never run together.
export {};

const API_BASE = "https://api.telegram.org";

interface BotCommand {
  /** Lowercase, 1–32 chars, letters/digits/underscore only. Telegram's rule. */
  command: string;
  /** 1–256 chars. Shown beside the command in the menu. */
  description: string;
}

// Ordered by how often someone needs them, because this is the order the menu
// draws. Money-stopping commands sit at the bottom rather than beside
// "balance": a mis-tap on /freeze costs an unfreeze, which needs a factor
// that predates the freeze, which most accounts do not have.
const COMMANDS: BotCommand[] = [
  { command: "balance", description: "Check your USDC balance" },
  { command: "address", description: "Get your wallet address to receive USDC" },
  { command: "send", description: "Send USDC to a number, address, or saved name" },
  { command: "history", description: "See your recent transactions" },
  { command: "cancel", description: "Cancel a send that hasn't gone out yet" },
  { command: "help", description: "See everything I can do" },
  { command: "freeze", description: "Stop all outgoing money right now" },
  { command: "unfreeze", description: "Lift a freeze (needs your PIN or Face ID)" },
];

const TELEGRAM_COMMAND_PATTERN = /^[a-z0-9_]{1,32}$/;

async function callTelegram(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as {
    ok: boolean;
    result?: unknown;
    description?: string;
  };

  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description ?? "unknown error"}`);
  }
  return data.result;
}

async function main(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error(
      "Missing TELEGRAM_BOT_TOKEN.\n" +
        "Run with env loaded: pnpm tsx --env-file=.env set-telegram-commands.ts",
    );
    process.exit(1);
  }

  // Checked here rather than discovered as a 400 from Telegram, which reports
  // the failure without naming which entry caused it.
  for (const c of COMMANDS) {
    if (!TELEGRAM_COMMAND_PATTERN.test(c.command)) {
      throw new Error(
        `"${c.command}" is not a valid Telegram command (lowercase letters, digits and underscore, 1-32 chars)`,
      );
    }
  }

  await callTelegram(token, "setMyCommands", { commands: COMMANDS });

  // Bind the ☰ button to the command list explicitly. Its default is already
  // "commands", but a bot whose menu button was ever pointed at a Web App
  // keeps that setting forever, and this is the one line that puts it back.
  await callTelegram(token, "setChatMenuButton", { menu_button: { type: "commands" } });

  const registered = (await callTelegram(token, "getMyCommands", {})) as BotCommand[];

  console.log(`✓ Registered ${registered.length} commands:\n`);
  for (const c of registered) {
    console.log(`  /${c.command.padEnd(10)} ${c.description}`);
  }
  console.log("\nThe ☰ Menu button in Telegram now lists these.");
  console.log("It can take a minute to appear, and existing chats may need reopening.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
