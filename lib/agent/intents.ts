/**
 * Free, deterministic intent classification — no LLM.
 *
 * Each rule lists trigger words/phrases for one intent. Scoring is an
 * IDF-weighted bag-of-words model built once from `RULES` at module load:
 * words that appear across many intents' example phrases (generic
 * connectors like "how", "is", "do") score low, words unique to one
 * intent's phrasing (e.g. "commission", "scam", "wallet") score high. A
 * full curated phrase match still outranks scattered incidental word
 * overlap via a multiplier, and an exact full-message match against
 * `rule.exact` is a strong, mostly-unambiguous 100-point signal kept as
 * a flat bonus on top of all of this. Rules are listed in priority order
 * so that on a genuine score tie, the earlier (more specific) intent wins
 * — same deterministic tie-break as before, it just fires less often now
 * that scores are properly differentiated instead of flat integer counts.
 *
 * Word order within a phrase is deliberately NOT required for a match —
 * this is a bag-of-words model, so "does it cost how much" credits the
 * same as "how much does it cost". That's intentional: it makes matching
 * more robust to paraphrasing at the cost of being slightly less precise,
 * which is an acceptable trade for a classifier whose only job is routing
 * to a canned reply (never authorizing money movement — sends are parsed
 * separately and explicitly by `parseSendIntent`).
 *
 * Typo correction (`fuzzyClassify`) runs whenever the primary pass scores
 * zero across every rule, over every token in the message (not just
 * single-token messages) — so a typo anywhere in a multi-word message can
 * still be corrected, not just a single mistyped command word.
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
  /** Word/phrase triggers, scored via the IDF bag-of-words model below. */
  keywords?: string[];
}

/** Priority order: earlier rules win ties. */
const RULES: IntentRule[] = [
  {
    intent: "cancel",
    exact: ["cancel", "stop", "nvm", "nevermind"],
    keywords: [
      "cancel", "abort", "never mind", "nevermind", "forget it", "call it off",
      "drop it", "skip that", "leave it",
    ],
  },
  {
    intent: "fees",
    keywords: [
      "fee", "fees", "charge", "charges", "charged", "commission",
      "how much do you cost", "how much does it cost", "cost to send",
      "gas", "do you charge", "any charges", "hidden fees", "free to use",
      "whats the fee", "what's the fee", "service charge", "transaction fee",
      "extra charges",
    ],
  },
  {
    intent: "security",
    exact: ["safe", "secure", "is it safe", "is this safe"],
    keywords: [
      "safe", "secure", "security", "scam", "legit", "legitimate", "trust",
      "trustworthy", "is this real", "hacked", "protect", "protected",
      "safety", "can i trust", "fraud", "stolen", "money secure", "money safe",
      "can you be trusted", "is it legit",
    ],
  },
  {
    intent: "about",
    keywords: [
      "what is tella", "what's tella", "whats tella", "who are you",
      "what are you", "about tella", "what is this", "what's this",
      "whats this", "tell me about", "what do you do", "what can you do",
      "who r u", "wat can u do", "what r u",
    ],
  },
  {
    intent: "how_it_works",
    keywords: [
      "how does this work", "how do you work", "how it works",
      "how does it work", "how do i use", "how does tella work",
      "how do i get started", "how to use", "how this works", "explain how",
      "how do i start",
    ],
  },
  {
    intent: "balance",
    exact: ["balance", "bal", "my balance"],
    keywords: [
      "balance", "how much do i have", "how much have i got", "funds",
      "my money", "wallet total", "holdings", "do i have", "whats in my wallet",
      "what's in my wallet", "check balance", "available", "my total",
      "how much usdc", "wallet balance", "show my balance",
    ],
  },
  {
    intent: "address",
    exact: ["address", "wallet", "my address", "my wallet"],
    keywords: [
      "address", "receive", "receiving", "deposit", "my wallet",
      "wallet address", "fund my", "top up", "top-up", "where do i send",
      "account number", "get paid", "my account", "public key", "qr",
      "how do i fund", "how do i top up", "send me your address",
    ],
  },
  {
    intent: "send",
    exact: ["send", "transfer", "pay"],
    keywords: [
      "send", "transfer", "sending", "paying", "move money", "give",
      "wire", "remit", "send money", "send some", "send usdc", "transfer to",
      "pay someone", "send to", "i wanna send", "need to send", "wanna send money",
    ],
  },
  {
    intent: "history",
    exact: ["history", "transactions", "my transactions", "transaction history"],
    keywords: [
      "history", "transactions", "past transactions", "previous transactions",
      "recent transactions", "transaction log", "my history", "transaction history",
      "show my transactions", "past sends", "what did i send",
    ],
  },
  {
    intent: "thanks",
    exact: ["thanks", "thank you", "thx", "ty", "tysm", "cheers", "thank u", "tanks"],
    keywords: ["thank", "thanks", "thx", "appreciate", "grateful", "much love", "kudos", "tanks", "much appreciated"],
  },
  {
    intent: "goodbye",
    exact: ["bye", "goodbye", "cya", "later", "gn", "good night"],
    keywords: [
      "bye", "goodbye", "see you", "see ya", "take care", "goodnight", "good night",
      "catch you", "gtg", "gotta go", "peace out",
    ],
  },
  {
    intent: "help",
    exact: ["help", "menu", "start", "commands", "options"],
    keywords: [
      "help", "options", "menu", "commands", "guide", "lost", "confused",
      "get started", "what now", "stuck", "what can i do", "show me options",
    ],
  },
  {
    intent: "greeting",
    exact: [
      "hi", "hey", "hello", "yo", "hiya", "sup", "howdy", "hey there",
      "good morning", "good afternoon", "good evening", "gm", "ge", "wassup",
      "whats up", "what's up",
    ],
    keywords: ["hello", "good morning", "good afternoon", "good evening", "howdy", "morning"],
  },
  {
    intent: "affirm",
    exact: [
      "yes", "y", "yeah", "yep", "yup", "ok", "okay", "k", "sure", "cool",
      "nice", "great", "alright", "fine", "got it", "perfect", "yh", "yea", "aight",
    ],
    keywords: [
      "yes", "yeah", "yep", "yup", "okay", "sure", "cool", "alright",
      "sounds good", "got it", "perfect", "awesome", "lets go", "go ahead",
      "yh", "yea",
    ],
  },
];

const PUNCT = /[^\p{L}\p{N}\s']/gu;

function normalize(input: string): string {
  return input.toLowerCase().replace(PUNCT, " ").replace(/\s+/g, " ").trim();
}

function tokenize(phrase: string): string[] {
  const normalized = normalize(phrase);
  return normalized ? normalized.split(" ") : [];
}

// --- Vocabulary + IDF, built once at module load. Pure, synchronous, no
// runtime cost — this is not a network call or a model, just precomputed
// statistics over the RULES table above. ---

const TOTAL_INTENTS = new Set(RULES.map((r) => r.intent)).size;

/** word -> which intents' example phrases (exact + keywords) contain it. */
const vocab = new Map<string, Set<Intent>>();
for (const rule of RULES) {
  for (const phrase of [...(rule.exact ?? []), ...(rule.keywords ?? [])]) {
    for (const word of tokenize(phrase)) {
      if (!vocab.has(word)) vocab.set(word, new Set());
      vocab.get(word)!.add(rule.intent);
    }
  }
}

/**
 * Standalone single-word keyword/exact entries only (e.g. "send",
 * "balance", "cancel") — NOT every word extracted from inside a longer
 * phrase. A word like "send" appears inside other intents' illustrative
 * phrases too (fees' "cost to send", history's "what did i send"), which
 * is fine for phrase-level IDF scoring but wrong for fuzzy-correction
 * targets: a typo'd "sned" should resolve to the send intent specifically,
 * not get smeared across every intent whose example phrase happens to
 * contain the word "send" somewhere.
 */
const singleWordVocab = new Map<string, Set<Intent>>();
for (const rule of RULES) {
  for (const phrase of [...(rule.exact ?? []), ...(rule.keywords ?? [])]) {
    const words = tokenize(phrase);
    if (words.length !== 1) continue;
    const [word] = words;
    if (!singleWordVocab.has(word)) singleWordVocab.set(word, new Set());
    singleWordVocab.get(word)!.add(rule.intent);
  }
}

/** Rare-across-intents words score high; common connector words score low. */
const idf = new Map<string, number>();
for (const [word, intents] of vocab) {
  idf.set(word, Math.log(1 + TOTAL_INTENTS / intents.size));
}

function idfOf(word: string): number {
  return idf.get(word) ?? 0;
}

const PHRASE_MATCH_MULTIPLIER = 1.5;
const FUZZY_DISCOUNT = 0.5;

/**
 * Only `rule.keywords` feed this scoring pass — `rule.exact` phrases are
 * deliberately excluded here (they're scored separately, only as a whole-
 * message equality check). This mirrors the original design: an `exact`
 * entry like "nice" (affirm) shouldn't leak credit into an unrelated
 * message that happens to contain the word "nice" in passing.
 *
 * A multi-word keyword phrase only contributes when ALL of its words are
 * present (order-independent) — no partial credit for a subset. Partial
 * credit was tried and rejected: two generic connector words shared with
 * an unrelated phrase (e.g. "what are" overlapping "what are you" while
 * the actual message was about something else entirely) was enough to
 * spuriously outscore a legitimate single-word match elsewhere. Requiring
 * full coverage keeps every contribution meaningful while still being
 * order-independent and still letting single-word keywords (the bulk of
 * each rule's vocabulary) match on their own.
 */
function scoreRule(rule: IntentRule, msg: string, msgWords: Set<string>): number {
  let score = rule.exact?.includes(msg) ? 100 : 0;

  for (const phrase of rule.keywords ?? []) {
    const words = tokenize(phrase);
    if (!words.every((w) => msgWords.has(w))) continue;

    const wordScore = words.reduce((sum, w) => sum + idfOf(w), 0);
    score += words.length > 1 ? wordScore * PHRASE_MATCH_MULTIPLIER : wordScore;
  }

  return score;
}

export function classifyIntent(input: string): Intent {
  const msg = normalize(input);
  if (!msg) return "unknown";
  const msgWords = new Set(msg.split(" "));

  let best: { intent: Intent; score: number } = { intent: "unknown", score: 0 };

  for (const rule of RULES) {
    const score = scoreRule(rule, msg, msgWords);
    // Strictly-greater keeps the higher-priority rule on ties.
    if (score > best.score) best = { intent: rule.intent, score };
  }

  if (best.score > 0) return best.intent;

  const fuzzy = fuzzyClassify(msgWords);
  if (fuzzy) return fuzzy;

  return "unknown";
}

/**
 * Typo correction over every token in the message (only runs when the
 * primary pass found nothing at all). For each message word, find the
 * closest vocabulary word within tolerance and credit that word's owning
 * intent(s) at a discount — a fuzzy hit is a weaker signal than an exact
 * word match. Short tokens (<3 chars) are skipped: they're too close to
 * too many unrelated words to fuzzy-match safely.
 */
function fuzzyClassify(msgWords: Set<string>): Intent | null {
  const scores = new Map<Intent, number>();

  for (const token of msgWords) {
    if (token.length < 3) continue;

    let bestWord: { word: string; dist: number } | null = null;
    for (const vocabWord of singleWordVocab.keys()) {
      if (vocabWord === token) continue; // exact matches are the primary pass's job
      // Very short vocab words (abbreviations like "thx", "ty", "gm") are
      // too close to too many unrelated common words to fuzzy-target
      // safely — command words like "send"/"help" (4 letters) stay
      // eligible, but 3-letter-and-under abbreviations don't.
      if (vocabWord.length < 4) continue;
      const tolerance = vocabWord.length <= 6 ? 1 : 2;
      const dist = editDistance(token, vocabWord);
      if (dist <= tolerance && (!bestWord || dist < bestWord.dist)) {
        bestWord = { word: vocabWord, dist };
      }
    }
    if (!bestWord) continue;

    const weight = idfOf(bestWord.word) * FUZZY_DISCOUNT;
    for (const intent of singleWordVocab.get(bestWord.word)!) {
      scores.set(intent, (scores.get(intent) ?? 0) + weight);
    }
  }

  let best: { intent: Intent; score: number } | null = null;
  for (const [intent, score] of scores) {
    if (!best || score > best.score) best = { intent, score };
  }
  return best?.intent ?? null;
}

/**
 * Optimal string alignment distance — Levenshtein plus adjacent-character
 * transposition as a single-cost operation. Adjacent-swap typos ("sned"
 * for "send", "form" for "from") are extremely common on mobile keyboards
 * and cost 2 under plain Levenshtein (two substitutions) but should
 * reasonably cost 1, same as a single dropped or doubled letter.
 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const d: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}
