export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-().]/g, "");

  if (/^\+\d{8,15}$/.test(cleaned)) return cleaned;

  if (/^00\d{8,15}$/.test(cleaned)) return `+${cleaned.slice(2)}`;

  return null;
}

export function isEvmAddress(input: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(input.trim());
}
/**
 * A phone number (or a "whatsapp:+…" address) cut down to its last four
 * digits, for logs. A full number is personal data, and log drains keep it
 * for far longer than the conversation needed it.
 */
export function maskPhoneForLog(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `…${digits.slice(-4)}`;
}
