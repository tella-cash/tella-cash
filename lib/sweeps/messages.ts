import { formatMicro } from "./micro";
import type { Quote } from "./quote";

/**
 * What users are told about a sweep. Plain money words: "move", "Base",
 * "fees". Nothing about bridges, burns or attestations.
 *
 * Fees are shown rounded UP to the cent. A fee displayed a hair low and then
 * charged is a broken promise; one displayed a hair high is a rounding.
 */

const CENT = BigInt(10_000);

export function usdcUpToCent(micro: bigint): string {
  const cents = (micro + CENT - BigInt(1)) / CENT;
  const whole = cents / BigInt(100);
  const frac = (cents % BigInt(100)).toString().padStart(2, "0");
  return `${whole}.${frac}`;
}

function names(legs: { displayName: string }[]): string {
  const n = legs.map((l) => l.displayName);
  return n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}

/** Said before the confirm link, when the send needs a top-up first. */
export function sweepQuoteLines(q: Extract<Quote, { kind: "sweep" }>, recipientLabel: string): string[] {
  const moved = q.legs.reduce((s, l) => s + l.amountMicro, BigInt(0));
  const fees = q.circleFeeMaxMicro + q.sweepFeeMicro + q.sendFeeMicro;
  return [
    `Your Arc balance is short, but you have more on ${names(q.legs)}. I'll move ${formatMicro(moved)} USDC over first, then send ${formatMicro(q.sendMicro)} USDC to ${recipientLabel}.`,
    "",
    `Fees: up to ${usdcUpToCent(fees)} USDC in total. The move takes a few minutes, and the send goes out as soon as it lands.`,
  ];
}

export function sweepInsufficientText(q: Extract<Quote, { kind: "insufficient" }>): string {
  const have = formatMicro(q.unifiedMicro);
  const need = formatMicro(q.neededMicro);
  switch (q.reason) {
    case "balance":
      return [
        `You've got ${have} USDC across your networks, and this send needs ${need} USDC with fees.`,
        "",
        "Try a smaller amount, or top up first.",
      ].join("\n");
    case "route_unavailable":
      return [
        "You have enough across your networks, but I can't price moving it right now.",
        "",
        "Try again in a few minutes.",
      ].join("\n");
    case "cannot_sweep":
      return [
        `You have ${have} USDC across your networks, but I can't move enough of it to Arc for this send (${need} USDC with fees).`,
        "",
        "A smaller amount may work, or top up your Arc balance directly.",
      ].join("\n");
  }
}

export function sweepStartedText(amount: string, recipientLabel: string): string {
  return [
    `⏳ Moving your USDC over to send ${amount} USDC to ${recipientLabel}.`,
    "",
    "This takes a few minutes. I'll send it as soon as the money lands and message you when it's done.",
    "",
    "If you didn't ask for this, freeze your account now: nothing will go out.",
  ].join("\n");
}
