/**
 * returnTarget tests. Runner-free — run with `npm test`.
 *
 * The bug this guards is specific and was live: a user who started a send in
 * Telegram, tapped through to the confirm page and succeeded was redirected
 * into WhatsApp — a different app, possibly with no tella conversation in
 * it, and not the one their receipt was about to land in.
 */
import { returnTarget, asProvider } from "./return-link";
import type { tellaUser } from "@/lib/supabase/types";

process.env.TELEGRAM_BOT_USERNAME = "@cashtellaBot";
process.env.META_WHATSAPP_DISPLAY_NUMBER = "+234 904 358 0863";
process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";

const user = { whatsapp_channel: "meta" } as tellaUser;

const failures: string[] = [];
let passed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) passed++;
  else failures.push(`  ✗ ${label}${detail ? ` — got ${detail}` : ""}`);
}

// The whole point: origin wins over the user's WhatsApp column.
{
  const t = returnTarget(user, "telegram");
  check("telegram origin returns to telegram", t.url === "https://t.me/cashtellaBot", String(t.url));
  check("telegram label", t.label === "Telegram", t.label);
}

// The @ in the env var is the trap: https://t.me/@name is a dead link.
{
  process.env.TELEGRAM_BOT_USERNAME = "cashtellaBot";
  check("bare username works too", returnTarget(user, "telegram").url === "https://t.me/cashtellaBot");
  process.env.TELEGRAM_BOT_USERNAME = "https://t.me/cashtellaBot";
  check("a pasted URL is tolerated", returnTarget(user, "telegram").url === "https://t.me/cashtellaBot");
  process.env.TELEGRAM_BOT_USERNAME = "@cashtellaBot";
}

{
  const t = returnTarget(user, "meta");
  check("meta strips non-digits", t.url === "https://wa.me/2349043580863", String(t.url));
  check("meta label is WhatsApp", t.label === "WhatsApp", t.label);
}

{
  const t = returnTarget(user, "twilio");
  check("twilio strips the whatsapp: prefix", t.url === "https://wa.me/14155238886", String(t.url));
}

// No origin recorded — links minted before this existed. Falls back to the
// user row, which is exactly the old behaviour.
{
  const t = returnTarget(user, null);
  check("null origin falls back to the user row", t.url === "https://wa.me/2349043580863", String(t.url));
  const twilioUser = { whatsapp_channel: "twilio" } as tellaUser;
  check(
    "fallback follows the user's own channel",
    returnTarget(twilioUser, undefined).url === "https://wa.me/14155238886",
  );
}

// An unconfigured channel yields null, not a bare deep link that opens the
// app with no conversation and looks like a working button.
{
  const saved = process.env.TELEGRAM_BOT_USERNAME;
  delete process.env.TELEGRAM_BOT_USERNAME;
  check("unconfigured telegram is null", returnTarget(user, "telegram").url === null);
  check("label survives a null url", returnTarget(user, "telegram").label === "Telegram");
  process.env.TELEGRAM_BOT_USERNAME = saved;
}

// jsonb is untrusted input.
{
  check("asProvider accepts known ids", asProvider("telegram") === "telegram");
  check("asProvider rejects junk", asProvider("myspace") === null);
  check("asProvider rejects non-strings", asProvider(42) === null);
  check("asProvider rejects undefined", asProvider(undefined) === null);
  // A prototype key is a string that is "in" a plain object.
  check("asProvider rejects prototype keys", asProvider("constructor") === null);
}

const total = passed + failures.length;
console.log(`return-link: ${passed}/${total} passed`);
if (failures.length) { console.error("\nFailures:\n" + failures.join("\n")); process.exit(1); }
