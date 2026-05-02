export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-().]/g, "");

  if (/^\+\d{8,15}$/.test(cleaned)) return cleaned;

  if (/^00\d{8,15}$/.test(cleaned)) return `+${cleaned.slice(2)}`;

  return null;
}

export function isEvmAddress(input: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(input.trim());
}