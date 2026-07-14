import { normalizePhone, isEvmAddress } from "@/lib/utils/phone";
import { parseAmount } from "@/lib/agent/parse-amount";

export interface ParsedSendIntent {
  amount: string;
  token: "USDC";
  recipient:
    | { kind: "phone"; whatsappNumber: string }
    | { kind: "address"; address: string }
    | { kind: "label"; label: string };
}

export function parseSendIntent(input: string): ParsedSendIntent | null {
  const trimmed = input.trim();
  if (!/^send\b/i.test(trimmed)) return null;

  // Split "send <amount> to <recipient>" on the first " to ". The amount
  // portion is parsed separately so it can be digits, words, or carry a
  // currency symbol/word; phone numbers and 0x addresses never contain " to ".
  const match = trimmed.match(/^send\s+(.+?)\s+to\s+(.+)$/i);
  if (!match) return null;

  const [, amountRaw, recipientRaw] = match;
  const amount = parseAmount(amountRaw);
  if (!amount) return null;

  const recipientTrimmed = recipientRaw.trim();

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

  // Neither an address nor a phone number — treat it as a saved beneficiary
  // label (e.g. "send 2000 to Chidi"). Resolution against the DB happens
  // downstream; this parser stays pure/sync.
  if (recipientTrimmed) {
    return {
      amount,
      token: "USDC",
      recipient: { kind: "label", label: recipientTrimmed },
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