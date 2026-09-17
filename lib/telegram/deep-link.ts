/**
 * The t.me deep link that completes a Telegram link, or null when the bot
 * username is not configured.
 *
 * Normalised rather than trusted. BotFather displays the username as
 * "@cashtellaBot" and that is what gets pasted into env, but t.me links take
 * the bare name — https://t.me/@name is a dead link, and the failure is a
 * user tapping something that goes nowhere rather than an error anybody sees.
 * Also tolerates someone pasting the whole t.me URL.
 */
export function telegramDeepLink(token: string): string | null {
  const botUsername = (process.env.TELEGRAM_BOT_USERNAME ?? "")
    .trim()
    .replace(/^https?:\/\/t\.me\//i, "")
    .replace(/^@/, "");

  if (!botUsername) return null;
  return `https://t.me/${botUsername}?start=${token}`;
}
