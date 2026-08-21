/**
 * Whether an inbound WhatsApp webhook with a bad or missing signature may be
 * processed anyway.
 *
 * Both webhooks used to gate their signature check on
 * `NODE_ENV === "production"`, which meant the check was off by default and
 * on only by accident of how the process happened to be started. That is the
 * wrong polarity for an authentication control: forgetting to configure
 * something should fail closed, not open.
 *
 * Now the check always runs, and skipping it requires deliberately setting
 * WHATSAPP_ALLOW_UNSIGNED=true in a non-production environment. It is
 * ignored outright when NODE_ENV is "production", so the flag can't be set
 * in a deployed environment to any effect.
 */
export function allowUnsignedWebhooks(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.WHATSAPP_ALLOW_UNSIGNED === "true";
}

/**
 * Reduce a phone number to something that can correlate log lines without
 * identifying anyone: "+2349043580863" → "+234…0863".
 *
 * Both webhooks used to log the full number, the WhatsApp profile name, and
 * the first 80 characters of the message on every single inbound message.
 */
export function redactNumber(raw: string | null | undefined): string {
  if (!raw) return "(none)";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return "(short)";
  return `+${digits.slice(0, 3)}…${digits.slice(-4)}`;
}
