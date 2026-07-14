/**
 * Free, deterministic intent classification — no LLM.
 *
 * Each rule lists trigger words/phrases for one intent. We normalize the
 * message, score every rule by how many triggers it hits (exact full-message
 * matches score highest), and return the best. Rules are listed in priority
 * order so that on a score tie, the earlier (more specific) intent wins.
 *
 * Structured sends ("send 5 usdc to …") are parsed upstream by
 * `parseSendIntent` and never reach here; the `send` intent below is only
 * for send-ish messages we couldn't parse, so we can reply with the format.
 */

export type Intent =
  | "greeting"
  | "help"
  | "balance"
  | "address"
  | "send"
  | "history"
  | "about"
  | "how_it_works"
  | "fees"
  | "security"
  | "thanks"
  | "goodbye"
  | "affirm"
  | "cancel"
  | "unknown";

interface IntentRule {
  intent: Intent;
  /** Full normalized message equals one of these → strong signal. */
  exact?: string[];
  /** Substring (multi-word) or whole-word (single token) triggers. */
  keywords?: string[];
}

/** Priority order: earlier rules win ties. */
const RULES: IntentRule[] = [
  {
    intent: "cancel",
    exact: ["cancel", "stop", "nvm", "nevermind"],
    keywords: ["cancel", "abort", "never mind", "nevermind", "forget it", "call it off"],
  },
  {
    intent: "fees",
    keywords: [
      "fee", "fees", "charge", "charges", "charged", "commission",
      "how much do you cost", "how much does it cost", "cost to send",
      "gas", "do you charge", "any charges", "hidden fees", "free to use",
    ],
  },
  {
    intent: "security",
    exact: ["safe", "secure", "is it safe", "is this safe"],
    keywords: [
      "safe", "secure", "security", "scam", "legit", "legitimate", "trust",
      "trustworthy", "is this real", "hacked", "protect", "protected",
      "safety", "can i trust", "fraud", "stolen", "money secure", "money safe",
    ],
  },
  {
    intent: "about",
    keywords: [
      "what is tella", "what's tella", "whats tella", "who are you",
      "what are you", "about tella", "what is this", "what's this",
      "whats this", "tell me about", "what do you do", "what can you do",
    ],
  },
  {
    intent: "how_it_works",
    keywords: [
      "how does this work", "how do you work", "how it works",
      "how does it work", "how do i use", "how does tella work",
      "how do i get started", "how to use", "how this works", "explain how",
    ],
  },
  {
    intent: "balance",
    exact: ["balance", "bal", "my balance"],
    keywords: [
      "balance", "how much do i have", "how much have i got", "funds",
      "my money", "wallet total", "holdings", "do i have", "whats in my wallet",
      "what's in my wallet", "check balance", "available", "my total",
      "how much usdc",
    ],
  },
  {
    intent: "address",
    exact: ["address", "wallet", "my address", "my wallet"],
    keywords: [
      "address", "receive", "receiving", "deposit", "my wallet",
      "wallet address", "fund my", "top up", "top-up", "where do i send",
      "account number", "get paid", "my account", "public key", "qr",
    ],
  },
  {
    intent: "send",
    exact: ["send", "transfer", "pay"],
    keywords: [
      "send", "transfer", "sending", "paying", "move money", "give",
      "wire", "remit", "send money", "send some", "send usdc", "transfer to",
      "pay someone", "send to",
    ],
  },
  {
    intent: "history",
    exact: ["history", "transactions", "my transactions", "transaction history"],
    keywords: [
      "history", "transactions", "past transactions", "previous transactions",
      "recent transactions", "transaction log", "my history", "transaction history",
    ],
  },
  {
    intent: "thanks",
    exact: ["thanks", "thank you", "thx", "ty", "tysm", "cheers", "thank u"],
    keywords: ["thank", "thanks", "thx", "appreciate", "grateful", "much love", "kudos"],
  },
  {
    intent: "goodbye",
    exact: ["bye", "goodbye", "cya", "later", "gn", "good night"],
    keywords: ["bye", "goodbye", "see you", "see ya", "take care", "goodnight", "good night", "catch you"],
  },
  {
    intent: "help",
    exact: ["help", "menu", "start", "commands", "options"],
    keywords: [
      "help", "options", "menu", "commands", "guide", "lost", "confused",
      "get started", "what now", "stuck",
    ],
  },
  {
    intent: "greeting",
    exact: [
      "hi", "hey", "hello", "yo", "hiya", "sup", "howdy", "hey there",
      "good morning", "good afternoon", "good evening", "gm", "ge", "wassup",
      "whats up", "what's up",
    ],
    keywords: ["hello", "good morning", "good afternoon", "good evening", "howdy"],
  },
  {
    intent: "affirm",
    exact: [
      "yes", "y", "yeah", "yep", "yup", "ok", "okay", "k", "sure", "cool",
      "nice", "great", "alright", "fine", "got it", "perfect",
    ],
    keywords: [
      "yes", "yeah", "yep", "yup", "okay", "sure", "cool", "alright",
      "sounds good", "got it", "perfect", "awesome", "lets go", "go ahead",
    ],
  },
];

const PUNCT = /[^\p{L}\p{N}\s']/gu;

function normalize(input: string): string {
  return input.toLowerCase().replace(PUNCT, " ").replace(/\s+/g, " ").trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hit(msg: string, keyword: string): boolean {
  if (keyword.includes(" ")) return msg.includes(keyword);
  return new RegExp(`\\b${escapeRegex(keyword)}\\b`).test(msg);
}

export function classifyIntent(input: string): Intent {
  const msg = normalize(input);
  if (!msg) return "unknown";

  let best: { intent: Intent; score: number } = { intent: "unknown", score: 0 };

  for (const rule of RULES) {
    let score = 0;
    if (rule.exact?.includes(msg)) score += 100;
    for (const kw of rule.keywords ?? []) {
      if (hit(msg, kw)) score += kw.includes(" ") ? 3 : 2;
    }
    // Strictly-greater keeps the higher-priority rule on ties.
    if (score > best.score) best = { intent: rule.intent, score };
  }

  if (best.score > 0) return best.intent;

  // Fuzzy fallback: a single mistyped command word ("balnce", "addres").
  const tokens = msg.split(" ");
  if (tokens.length === 1) {
    const fuzzy = fuzzyIntent(tokens[0]);
    if (fuzzy) return fuzzy;
  }

  return "unknown";
}

const FUZZY: Array<{ token: string; intent: Intent }> = [
  { token: "balance", intent: "balance" },
  { token: "address", intent: "address" },
  { token: "send", intent: "send" },
  { token: "transfer", intent: "send" },
  { token: "deposit", intent: "address" },
  { token: "receive", intent: "address" },
  { token: "history", intent: "history" },
  { token: "transactions", intent: "history" },
  { token: "help", intent: "help" },
  { token: "menu", intent: "help" },
  { token: "hello", intent: "greeting" },
  { token: "thanks", intent: "thanks" },
  { token: "cancel", intent: "cancel" },
];

function fuzzyIntent(token: string): Intent | null {
  let best: { intent: Intent; dist: number } | null = null;
  for (const f of FUZZY) {
    const dist = levenshtein(token, f.token);
    const tolerance = f.token.length <= 4 ? 1 : 2;
    if (dist <= tolerance && (!best || dist < best.dist)) {
      best = { intent: f.intent, dist };
    }
  }
  return best?.intent ?? null;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}
