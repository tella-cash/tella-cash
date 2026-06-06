/**
 * Parse a human-written amount into a normalized decimal string.
 *
 * Handles digits with optional currency symbols/words and English number
 * words, so "5", "$5", "5 usdc", "five", "twenty five", "₦2,000" and
 * "a hundred" all normalize to a plain amount. Returns null when no
 * positive amount can be read.
 *
 * The value is treated as a USDC amount as-is — no currency conversion,
 * matching the existing send behaviour (a bare "₦" or "$" is just stripped).
 */

const CURRENCY_NOISE = /\b(usdc|usd|dollars?|bucks?|naira|cents?)\b/gi;

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};

const MAGNITUDE: Record<string, number> = {
  hundred: 100,
  thousand: 1_000,
  million: 1_000_000,
};

export function parseAmount(raw: string): string | null {
  const cleaned = raw
    .toLowerCase()
    .replace(/[$₦£€]/g, " ")
    .replace(CURRENCY_NOISE, " ")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;

  // Plain numeric (optionally with a decimal) — the common case.
  const numeric = cleaned.match(/^(\d+(?:\.\d+)?)$/);
  if (numeric) {
    const n = parseFloat(numeric[1]);
    return isFinite(n) && n > 0 ? String(n) : null;
  }

  // Otherwise interpret English number words.
  const words = wordsToNumber(cleaned);
  return words !== null && words > 0 ? String(words) : null;
}

function wordsToNumber(text: string): number | null {
  const tokens = text.split(" ").filter((t) => t && t !== "and");
  if (tokens.length === 0) return null;

  let total = 0;
  let current = 0;
  let matched = false;

  for (const token of tokens) {
    if (token === "a" || token === "an") {
      current += 1;
      matched = true;
    } else if (token in SMALL) {
      current += SMALL[token];
      matched = true;
    } else if (token === "hundred") {
      current = (current || 1) * 100;
      matched = true;
    } else if (token in MAGNITUDE) {
      total += (current || 1) * MAGNITUDE[token];
      current = 0;
      matched = true;
    } else {
      // Unknown word — bail rather than guess at a money amount.
      return null;
    }
  }

  return matched ? total + current : null;
}
