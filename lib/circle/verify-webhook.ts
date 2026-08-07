import crypto from "node:crypto";

/**
 * Signature verification for Circle notification webhooks.
 *
 * Circle signs each notification with an ECDSA P-256 key and sends:
 *   X-Circle-Signature — base64, DER-encoded ECDSA signature over the raw body
 *   X-Circle-Key-Id    — id of the public key that signed it
 *
 * The key is fetched from Circle's /v2/notifications/publicKey/{keyId} and
 * cached per keyId. The DCW SDK client (@circle-fin/developer-controlled-wallets)
 * exposes no signature helper — it only wraps getToken / createTransaction /
 * createWallets / getWalletTokenBalance / requestTestnetTokens — so this is
 * hand-rolled against the documented header format.
 *
 * Everything here fails CLOSED. An unverifiable notification is one an
 * attacker can forge, and a forged inbound event makes the bot tell a real
 * user that money they never got has arrived.
 */

const CIRCLE_API_BASE = process.env.CIRCLE_API_BASE ?? "https://api.circle.com";

/** Cached DER/SPKI public keys by keyId. Same shape as tokenSymbolCache in lib/wallet/circle.ts. */
const publicKeyCache = new Map<string, crypto.KeyObject>();

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

/**
 * Verify a Circle webhook. `rawBody` must be the exact bytes received —
 * re-serialising the parsed JSON changes key order and whitespace and will
 * never match the signature.
 */
export async function verifyCircleWebhook(
  rawBody: string,
  headers: Headers,
): Promise<VerifyResult> {
  if (isVerificationDisabled()) {
    console.warn(
      "[circle-webhook] verification disabled via CIRCLE_WEBHOOK_VERIFY_DISABLED",
    );
    return { ok: true };
  }

  const signature = headers.get("x-circle-signature");
  const keyId = headers.get("x-circle-key-id");

  if (!signature || !keyId) {
    return { ok: false, reason: "missing signature headers" };
  }

  let publicKey: crypto.KeyObject;
  try {
    publicKey = await getPublicKey(keyId);
  } catch (err) {
    // Circle unreachable, key unknown, key malformed — all indistinguishable
    // from an attacker naming a key that doesn't exist. Refuse.
    console.error("[circle-webhook] public key fetch failed", { keyId, err });
    return { ok: false, reason: "public key unavailable" };
  }

  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(signature, "base64");
  } catch {
    return { ok: false, reason: "signature is not base64" };
  }
  if (signatureBytes.length === 0) {
    return { ok: false, reason: "empty signature" };
  }

  let verified = false;
  try {
    verified = crypto.verify(
      "sha256",
      Buffer.from(rawBody, "utf8"),
      publicKey,
      signatureBytes,
    );
  } catch (err) {
    // A malformed DER signature makes crypto.verify throw rather than
    // return false.
    console.warn("[circle-webhook] signature verify threw", { keyId, err });
    return { ok: false, reason: "malformed signature" };
  }

  return verified ? { ok: true } : { ok: false, reason: "signature mismatch" };
}

/**
 * Local-dev escape hatch. Opt-in only, and never on in production regardless
 * of the flag — the whole point of this module is that the bypass can't be
 * reached by forgetting to configure something.
 */
function isVerificationDisabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.CIRCLE_WEBHOOK_VERIFY_DISABLED === "true";
}

async function getPublicKey(keyId: string): Promise<crypto.KeyObject> {
  const cached = publicKeyCache.get(keyId);
  if (cached) return cached;

  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) throw new Error("Missing CIRCLE_API_KEY");

  const res = await fetch(
    `${CIRCLE_API_BASE.replace(/\/$/, "")}/v2/notifications/publicKey/${encodeURIComponent(keyId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    },
  );

  if (!res.ok) {
    throw new Error(`publicKey fetch returned ${res.status}`);
  }

  const json = (await res.json()) as {
    data?: { publicKey?: string; algorithm?: string };
  };
  const encoded = json.data?.publicKey;
  if (!encoded) throw new Error("publicKey missing from response");

  const key = crypto.createPublicKey({
    key: toPem(encoded),
    format: "pem",
  });

  publicKeyCache.set(keyId, key);
  return key;
}

/**
 * Circle returns the key as bare base64 SPKI (no PEM armour). createPublicKey
 * wants either DER bytes or a full PEM block, so wrap it.
 */
function toPem(base64Key: string): string {
  const trimmed = base64Key.trim();
  if (trimmed.startsWith("-----BEGIN")) return trimmed;
  const lines = trimmed.replace(/\s+/g, "").match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----\n`;
}

/** Test seam — drops the cached keys. */
export function __clearPublicKeyCache(): void {
  publicKeyCache.clear();
}
