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

import { request as httpsRequest } from "node:https";

const API_HOST = "api.telegram.org";

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

/**
 * node:https with family: 4, rather than fetch.
 *
 * api.telegram.org publishes an AAAA record, and on a network with no route to
 * it Node's fetch sits on the v6 address until it times out and reports the
 * whole thing as "fetch failed" — no host, no address family, no reason. curl
 * gets through because it tries both and keeps whichever answers first.
 *
 * dns.setDefaultResultOrder("ipv4first") was the obvious fix and did not work
 * here: it steers the resolver, and undici does not reliably follow it. Setting
 * `family: 4` on the socket is not a hint, so this stops depending on the
 * resolver's preference being honoured.
 *
 * Only this script. The deployed app talks to Telegram from Vercel, where the
 * route is fine, and lib/telegram/client.ts is unchanged.
 */
function callTelegram<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const payload = JSON.stringify(body ?? {});

  return new Promise<T>((resolve, reject) => {
    const req = httpsRequest(
      {
        host: API_HOST,
        path: `/bot${token}/${method}`,
        method: "POST",
        family: 4,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 30_000,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let data: { ok: boolean; result?: T; description?: string };
          try {
            data = JSON.parse(raw);
          } catch {
            reject(new Error(`Telegram ${method}: unreadable response (HTTP ${res.statusCode})`));
            return;
          }
          if (!data.ok) {
            reject(new Error(`Telegram ${method} failed: ${data.description ?? "unknown error"}`));
            return;
          }
          resolve(data.result as T);
        });
      },
    );

    req.on("timeout", () => req.destroy(new Error(`Telegram ${method}: timed out`)));
    // Named explicitly, because "fetch failed" with no host attached is what
    // made this take as long as it did to work out.
    req.on("error", (err) => reject(new Error(`Telegram ${method}: ${err.message} (${API_HOST}, IPv4)`)));
    req.end(payload);
  });
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

  // REFUSE RATHER THAN SEND A URL TELEGRAM WILL NOT TAKE.
  //
  // setWebhook does not reject-and-leave-things-alone: handing it a non-HTTPS
  // URL fails AND clears the existing webhook, so the bot stops receiving
  // anything at all. That is a live outage caused by a script someone ran to
  // fix a button.
  //
  // It is an easy mistake to make, because the obvious way to run this is
  // `--env-file=.env` and a local .env quite reasonably has
  // APP_BASE_URL=http://localhost:3000. So the check is here rather than in
  // anyone's memory.
  if (!/^https:\/\//i.test(url) || /^https:\/\/(localhost|127\.|\[::1\])/i.test(url)) {
    console.error(
      `\nRefusing to register ${url}\n\n` +
        "Telegram requires a public HTTPS URL, and a rejected setWebhook CLEARS the\n" +
        "existing one — so sending this would take the bot offline rather than leave\n" +
        "it as it is.\n\n" +
        `APP_BASE_URL is currently ${baseUrl}. Point it at the deployed origin for\n` +
        "this run, e.g.\n\n" +
        "  APP_BASE_URL=https://www.tella.cash pnpm tsx --env-file=.env set-telegram-webhook.ts\n\n" +
        "(the explicit variable wins over the one in .env)",
    );
    process.exit(1);
  }

  // Keeping the URL it already has, when that is what we are about to send,
  // makes a re-run visibly a no-op rather than a re-registration.
  if (before.url && before.url !== url) {
    console.log(`\n  note: changing the webhook URL\n    from ${before.url}\n    to   ${url}`);
  }

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
