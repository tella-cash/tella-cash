import { createHmac } from "node:crypto";

// HTTP client for sendam-ai — a separate, already-deployed service that
// turns free-form chat text into a structured, closed-world intent. This
// service never knows which chain tella runs on; it only ever proposes
// structure and phrasing. See its docs/INTEGRATION.md for the full
// contract this client implements.
const BASE_URL = process.env.SENDAM_AI_BASE_URL;
const SIGNING_SECRET = process.env.SENDAM_AI_SIGNING_SECRET;

// Opt-in body logging for local debugging. Never enable in a deployed
// environment — see the note in post() for what these bodies contain.
const DEBUG_BODIES =
  process.env.SENDAM_DEBUG === "true" && process.env.NODE_ENV !== "production";

export type SendamIntent =
  | "SEND"
  | "BALANCE"
  | "CREATE_WALLET"
  | "LIST_CONTACTS"
  | "HELP"
  | "GREETING"
  | "ADDRESS"
  | "HISTORY"
  | "ABOUT"
  | "HOW_IT_WORKS"
  | "FEES"
  | "SECURITY"
  | "THANKS"
  | "GOODBYE"
  | "AFFIRM"
  | "CANCEL"
  | "FAUCET"
  | "UNKNOWN";

export interface DecodedIntent {
  intent: SendamIntent;
  amount: string | null;
  asset: string | null;
  recipient: string | null;
  confidence: number;
  // Ready-to-send, tone-matched reply. Only ever populated for GREETING —
  // every other intent leaves it null and still needs a template on our
  // side. Optional because older decoder deploys don't return this field.
  reply?: string | null;
}

export interface AwaitingSlot {
  slot: string;
  type: "CONFIRMATION" | "FREE_TEXT";
  description: string;
}

export type FollowUpSlots = Record<string, string | boolean | null>;

export type FollowUpResult =
  | { status: "COMPLETE"; flow: string; intent: null; slots: FollowUpSlots; confidence: number }
  | { status: "IN_PROGRESS"; flow: string; token: string; slots: FollowUpSlots };

function signRequest(rawBody: string, secret: string, nowMs: number): Record<string, string> {
  return {
    "X-Sendam-Signature": createHmac("sha256", secret).update(rawBody).digest("hex"),
    "X-Sendam-Timestamp": String(Math.floor(nowMs / 1000)),
  };
}

/**
 * Time budget per call.
 *
 * Everything here runs inside after(), behind a 200 the provider already has,
 * under a 60s ceiling. A fetch with no timeout does not respect any of that:
 * it hangs until the platform kills the whole invocation, and the user gets
 * no reply, no error, and no retry, because nothing ever noticed. That was
 * the single worst failure in the inbound path and it was silent.
 *
 * /decode is on the critical path of every message, so it gets the tighter
 * budget. /flow/start is only reached mid-conversation.
 */
const TIMEOUT_MS: Record<string, number> = {
  "/decode": 4000,
  "/flow/start": 3000,
};
const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Circuit breaker.
 *
 * Without one, an outage costs every single message its full timeout before
 * falling through — so a dead service does not just fail, it makes the whole
 * bot slow while failing. After a few consecutive failures we stop asking for
 * a while and let the caller fall through immediately.
 *
 * Per-process and therefore per-instance, which on serverless means it resets
 * on cold start. That is fine: this is a latency guard, not a correctness
 * one, and every instance learns the same lesson within a few messages.
 */
const BREAKER_THRESHOLD = 4;
const BREAKER_COOLDOWN_MS = 30_000;
let consecutiveFailures = 0;
let breakerOpenedAt = 0;

function breakerIsOpen(): boolean {
  if (consecutiveFailures < BREAKER_THRESHOLD) return false;
  if (Date.now() - breakerOpenedAt > BREAKER_COOLDOWN_MS) {
    // Cooldown elapsed. Let one call through to test the water; if it fails
    // the counter is still high and the breaker re-opens immediately.
    consecutiveFailures = BREAKER_THRESHOLD - 1;
    return false;
  }
  return true;
}

function recordFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= BREAKER_THRESHOLD) breakerOpenedAt = Date.now();
}

function recordSuccess(): void {
  consecutiveFailures = 0;
}

/** Thrown when the breaker is open, so callers can tell it apart from a 4xx. */
export class SendamUnavailableError extends Error {
  constructor(message = "sendam-ai is unavailable") {
    super(message);
    this.name = "SendamUnavailableError";
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  if (!BASE_URL) throw new Error("Missing SENDAM_AI_BASE_URL");
  if (!SIGNING_SECRET) throw new Error("Missing SENDAM_AI_SIGNING_SECRET");

  if (breakerIsOpen()) {
    console.warn(`[sendam-ai] breaker open, skipping ${path}`);
    throw new SendamUnavailableError();
  }

  const rawBody = JSON.stringify(body);
  const startedAt = Date.now();

  // Bodies are NOT logged by default. Every request here carries the literal
  // text a user typed into WhatsApp — "send 40 usdc to my landlord", their
  // phone number, their contacts — and responses echo the parsed slots back.
  // That is the most sensitive data in the system, and it was going to
  // stdout in full on every message, from where it ships to whatever
  // aggregator reads the platform logs.
  if (DEBUG_BODIES) console.log(`[sendam-ai] -> ${path}`, rawBody);

  const timeoutMs = TIMEOUT_MS[path] ?? DEFAULT_TIMEOUT_MS;

  // Retried at most once, and only for failures that a retry can plausibly
  // fix. A 4xx is a considered rejection — a bad signature retried is just a
  // second bad signature — so it fails immediately and does not count toward
  // the breaker either, since the service is up and answering.
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...signRequest(rawBody, SIGNING_SECRET, Date.now()),
        },
        body: rawBody,
        signal: controller.signal,
      });

      const resText = await res.text();
      const ms = Date.now() - startedAt;

      if (res.status >= 400 && res.status < 500) {
        console.error(`[sendam-ai] <- ${path} ${res.status} (${ms}ms)`);
        if (DEBUG_BODIES) console.error(`[sendam-ai] <- ${path} body`, resText);
        recordSuccess();
        throw new Error(`sendam-ai ${path} failed (${res.status}): ${resText}`);
      }

      if (!res.ok) {
        console.error(`[sendam-ai] <- ${path} ${res.status} (${ms}ms)`);
        if (DEBUG_BODIES) console.error(`[sendam-ai] <- ${path} body`, resText);
        if (attempt === 0) continue;
        recordFailure();
        throw new Error(`sendam-ai ${path} failed (${res.status}): ${resText}`);
      }

      console.log(`[sendam-ai] <- ${path} ${res.status} (${ms}ms)`);
      if (DEBUG_BODIES) console.log(`[sendam-ai] <- ${path} body`, resText);
      recordSuccess();
      return JSON.parse(resText) as T;
    } catch (err) {
      // A 4xx above throws a plain Error; don't retry or penalise those.
      if (err instanceof Error && err.message.startsWith("sendam-ai ")) throw err;

      const aborted = err instanceof Error && err.name === "AbortError";
      console.error(`[sendam-ai] <- ${path} ${aborted ? "timeout" : "network error"}`, {
        attempt,
        timeoutMs,
      });

      if (attempt === 0) continue;
      recordFailure();
      throw new SendamUnavailableError(
        aborted ? `sendam-ai ${path} timed out` : `sendam-ai ${path} unreachable`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // Unreachable: the loop either returns or throws on its second pass.
  recordFailure();
  throw new SendamUnavailableError();
}

/** Classifies one message. Throws on any failure — the caller decides the
 *  fallback (e.g. the generic "didn't understand" reply), same as any other
 *  external call in this codebase (see lib/meta/client.ts). */
export function decode(text: string, opts?: { userId?: string }): Promise<DecodedIntent> {
  return post<DecodedIntent>("/decode", { text, ...(opts?.userId ? { userId: opts.userId } : {}) });
}

/** Continues a stateless multi-turn flow — interprets `text` in light of
 *  the opaque `token` from a previous /flow/start or /decode response.
 *  `token` must be forwarded byte-for-byte; never parse or construct one. */
export function decodeFollowUp(text: string, token: string): Promise<FollowUpResult> {
  return post<FollowUpResult>("/decode", { text, token });
}

/** Mints a signed continuation token for a flow tella itself is starting
 *  (e.g. "save this recipient as a beneficiary?"), before the user has
 *  replied anything. Pure signing on sendam-ai's side — no model call. */
export function flowStart(
  flow: string,
  slots: FollowUpSlots,
  awaiting: AwaitingSlot[]
): Promise<{ token: string; expiresAt: number }> {
  return post("/flow/start", { flow, slots, awaiting });
}
