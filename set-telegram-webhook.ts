// set-telegram-webhook.ts
//
// Registers the Telegram webhook, WITH AN EXPLICIT allowed_updates.
//
// THIS IS THE FIX FOR "tapping a button on Telegram does nothing".
//
// The bot was registered with allowed_updates: ["message"]. Telegram honours
// that literally: it delivers text messages and silently discards every
// callback_query, which is what an inline-keyboard tap is. So no button on
// Telegram has ever worked — not Balance, not My address, not Send, not the
// saved-name buttons in the send flow, and not the "Freeze it" / "Not now"
// confirmation. Nothing reached the app, so nothing appeared in its logs
// either: the failure was invisible from our side and looked like a dead
// button from the user's.
//
// The trap is a single line in Telegram's own documentation:
//
//   allowed_updates — "If not specified, the previous setting will be used."
//
// So a restriction set once is permanent, and every later setWebhook that
// omits the field inherits it. The curl in migrations/README.md omitted it,
// which meant re-registering the webhook — the obvious thing to try when
// buttons do not work — could never have fixed it.
//
// This script therefore always sends the list explicitly. Passing it on every
// call is the entire point; do not "tidy" it away because the default looks
// permissive. It is only permissive on a bot that has never been restricted.
//
// Idempotent — safe to re-run. Run with env loaded:
//   pnpm tsx --env-file=.env set-telegram-webhook.ts

export {};

const API_BASE = "https://api.telegram.org";

/**
 * Every update type this app acts on.
 *
 * `message` carries typed text and the /start deep link. `callback_query` is
 * an inline-keyboard tap — see lib/telegram/client.ts and the contract in
 * lib/agent/menus.ts, which is that a tap must arrive back as text equal to
 * the button's title.
 *
 * Deliberately not a wider list. Everything else Telegram can send is an
 * update this app has no handler for, and receiving it would only cost an
 * invocation to ignore it.
 */
const ALLOWED_UPDATES = ["message", "callback_query"];

interface WebhookInfo {
  url?: string;
  pending_update_count?: number;
  last_error_message?: string;
  last_error_date?: number;
  allowed_updates?: string[];
}

async function callTelegram<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description ?? "unknown error"}`);
  }
  return data.result as T;
}

async function main(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const baseUrl = process.env.APP_BASE_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  const missing = [
    !token && "TELEGRAM_BOT_TOKEN",
    !baseUrl && "APP_BASE_URL",
    !secret && "TELEGRAM_WEBHOOK_SECRET",
  ].filter(Boolean);

  if (missing.length > 0 || !token || !baseUrl || !secret) {
    console.error(
      `Missing ${missing.join(", ")}.\n` +
        "Run with env loaded: pnpm tsx --env-file=.env set-telegram-webhook.ts",
    );
    process.exit(1);
  }

  const before = await callTelegram<WebhookInfo>(token, "getWebhookInfo");
  console.log("Before:");
  console.log("  url            ", before.url || "(none)");
  console.log("  allowed_updates", JSON.stringify(before.allowed_updates ?? "(unset)"));

  const url = `${baseUrl.replace(/\/$/, "")}/api/telegram`;

  await callTelegram(token, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ALLOWED_UPDATES,
    // Deliberately absent: drop_pending_updates. Anything queued is a real
    // user's message and discarding it loses their turn.
  });

  const after = await callTelegram<WebhookInfo>(token, "getWebhookInfo");
  console.log("\nAfter:");
  console.log("  url            ", after.url || "(none)");
  console.log("  allowed_updates", JSON.stringify(after.allowed_updates ?? "(unset)"));

  if (after.last_error_message) {
    console.log(
      "  last error     ",
      after.last_error_message,
      after.last_error_date ? new Date(after.last_error_date * 1000).toISOString() : "",
    );
  }

  const ok = (after.allowed_updates ?? []).includes("callback_query");
  console.log(
    ok
      ? "\n✓ callback_query is enabled — inline-keyboard taps will now reach the app."
      : "\n✗ callback_query is STILL missing. Buttons will not work; check the output above.",
  );
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
