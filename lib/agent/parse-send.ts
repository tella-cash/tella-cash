import { normalizePhone, isEvmAddress } from "@/lib/utils/phone";

export interface ParsedSendIntent {
  amount: string;
  token: "USDC";
  recipient:
    | { kind: "phone"; whatsappNumber: string }
    | { kind: "address"; address: string };
}

export function parseSendIntent(input: string): ParsedSendIntent | null {
  const trimmed = input.trim();
  if (!/^send\b/i.test(trimmed)) return null;
  const match = trimmed.match(
    /^send\s+\$?₦?(\d+(?:\.\d+)?)\s*(?:usdc\s+)?to\s+(.+)$/i,
  );
  if (!match) return null;

  const [, amountStr, recipientRaw] = match;
  const amount = amountStr;
  const recipientTrimmed = recipientRaw.trim();

  const amountNum = parseFloat(amount);
  if (!isFinite(amountNum) || amountNum <= 0) return null;

  if (isEvmAddress(recipientTrimmed)) {
    return {
      amount,
      token: "USDC",
      recipient: { kind: "address", address: recipientTrimmed.toLowerCase() },
    };
  }

  const normalized = normalizePhone(recipientTrimmed);
  if (normalized) {
    return {
      amount,
      token: "USDC",
      recipient: { kind: "phone", whatsappNumber: `whatsapp:${normalized}` },
    };
  }

  return null;
}

export function parseConfirmation(input: string): "yes" | "no" | null {
  const t = input.trim().toLowerCase();
  if (/^(yes|y|yep|yeah|yh|sure|ok|okay|go ahead|confirm|send it)\.?$/.test(t)) {
    return "yes";
  }
  if (/^(no|n|nope|nah|cancel|stop|abort)\.?$/.test(t)) {
    return "no";
  }
  return null;
}