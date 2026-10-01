import { isMainnet } from "@/lib/wallet/network";
import { parseRouteFees, ARC_CCTP_DOMAIN, type FeeParse } from "./cctp";

/**
 * Circle's Iris API: what a route costs, and where a burn has got to.
 *
 * The parsing half is adapted from the xebra project's cctp-client
 * (delivery.ts), which has watched real mainnet burns through Circle's
 * Forwarding Service. It is deliberately defensive for the same reason: the
 * error fields are not in Circle's published schema and the state names have
 * drifted before, so nothing here may throw on a body it does not recognise.
 *
 * The network half is a plain fetch with a timeout. Iris rate-limits by IP and
 * blocks for minutes on a breach; a sweep polls a handful of burns at a
 * time, well inside the documented limit, so xebra's budgeting layer is not
 * carried over. If sweeps ever run at a scale where that matters, that is the
 * place to look.
 */

export function irisBaseUrl(): string {
  return process.env.CCTP_IRIS_BASE_URL?.replace(/\/$/, "") ||
    (isMainnet() ? "https://iris-api.circle.com" : "https://iris-api-sandbox.circle.com");
}

const TIMEOUT_MS = 10_000;

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // A non-JSON body is treated as no body; the status carries the meaning.
  }
  return { status: res.status, body };
}

/** The price of sending USDC from `sourceDomain` to Arc, with forwarding. */
export async function fetchRouteFees(
  sourceDomain: number,
  finality: number,
): Promise<FeeParse> {
  const url = `${irisBaseUrl()}/v2/burn/USDC/fees/${sourceDomain}/${ARC_CCTP_DOMAIN}?forward=true`;
  let res;
  try {
    res = await getJson(url);
  } catch {
    return { ok: false, reason: "Circle's fee service did not answer" };
  }
  if (res.status !== 200) return { ok: false, reason: `Circle's fee service returned ${res.status}` };
  return parseRouteFees(res.body, finality);
}

/**
 * Where a burn has got to, in the terms a person acts on rather than Iris's
 * own vocabulary.
 *
 *   waiting     Iris has no attestation yet. Nothing to do.
 *   forwarding  Attested; Circle has not reported the Arc mint. Usually
 *               minutes. forwardState LAGS the real mint, so a long stay here
 *               is a reason to look at Arc, not proof of failure.
 *   delivered   Circle reports the forward complete.
 *   failed      Circle reports the forward failed (INSUFFICIENT_FEE, ...).
 *               The burn is attested and can be minted by hand: the
 *               destination caller is zero.
 *   claimable   Attested and NOT forwarded — the hook was not honoured.
 *               Same remedy as failed.
 */
export type DeliveryState = "waiting" | "forwarding" | "delivered" | "failed" | "claimable";

export interface Delivery {
  state: DeliveryState;
  /** The Arc transaction, once Circle reports it. */
  forwardTxHash: string | null;
  /** Circle's reason when it gave one. Display text for a person, never for the user. */
  reason: string | null;
}

const WAITING: Delivery = { state: "waiting", forwardTxHash: null, reason: null };

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Reads the body of `GET /v2/messages/{domain}?transactionHash=…`. Never throws. */
export function readDelivery(body: unknown): Delivery {
  const messages = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages) || messages.length === 0) return WAITING;
  const m = messages[0] as Record<string, unknown> | null;
  if (!m || typeof m !== "object") return WAITING;

  const attested = m.status === "complete" && text(m.attestation) !== null;
  const fwd = text(m.forwardState)?.toUpperCase() ?? null;
  const forwardTxHash = text(m.forwardTxHash);

  // A failure is visible before the attestation is final, and it is the thing
  // to act on.
  if (fwd === "FAILED") {
    const code = text(m.forwardErrorCode);
    const details = text(m.forwardErrorDetails);
    return {
      state: "failed",
      forwardTxHash: null,
      reason: [code, details].filter(Boolean).join(": ") || null,
    };
  }
  if (fwd === "COMPLETE") return { state: "delivered", forwardTxHash, reason: null };
  if (!attested) return WAITING;
  if (fwd === null) return { state: "claimable", forwardTxHash: null, reason: null };
  return { state: "forwarding", forwardTxHash, reason: null };
}

/**
 * Ask Iris about a burn. A 404 is normal for the first while after a burn
 * (Iris has not indexed it) and reads as `waiting`; only a transport failure
 * or a 5xx throws, so the caller can tell "nothing yet" from "could not ask".
 */
export async function fetchDelivery(sourceDomain: number, burnTxHash: string): Promise<Delivery> {
  const url = `${irisBaseUrl()}/v2/messages/${sourceDomain}?transactionHash=${burnTxHash}`;
  const { status, body } = await getJson(url);
  if (status === 404) return WAITING;
  if (status !== 200) throw new Error(`Iris returned ${status}`);
  return readDelivery(body);
}
