import { createHmac } from "node:crypto";

// HTTP client for sendam-ai — a separate, already-deployed service that
// turns free-form chat text into a structured, closed-world intent. This
// service never knows which chain tella runs on; it only ever proposes
// structure and phrasing. See its docs/INTEGRATION.md for the full
// contract this client implements.
const BASE_URL = process.env.SENDAM_AI_BASE_URL;
const SIGNING_SECRET = process.env.SENDAM_AI_SIGNING_SECRET;

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
  | "UNKNOWN";

export interface DecodedIntent {
  intent: SendamIntent;
  amount: string | null;
  asset: string | null;
  recipient: string | null;
  confidence: number;
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

async function post<T>(path: string, body: unknown): Promise<T> {
  if (!BASE_URL) throw new Error("Missing SENDAM_AI_BASE_URL");
  if (!SIGNING_SECRET) throw new Error("Missing SENDAM_AI_SIGNING_SECRET");

  const rawBody = JSON.stringify(body);
  console.log(`[sendam-ai] -> ${path}`, rawBody);

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...signRequest(rawBody, SIGNING_SECRET, Date.now()),
    },
    body: rawBody,
  });

  const resText = await res.text();

  if (!res.ok) {
    console.error(`[sendam-ai] <- ${path} (${res.status})`, resText);
    throw new Error(`sendam-ai ${path} failed (${res.status}): ${resText}`);
  }

  console.log(`[sendam-ai] <- ${path} (${res.status})`, resText);
  return JSON.parse(resText) as T;
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
