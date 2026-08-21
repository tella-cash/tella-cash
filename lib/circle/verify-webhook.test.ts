/**
 * verifyCircleWebhook tests. Runner-free — run with `pnpm test`. Exits
 * non-zero on any failure.
 *
 * This is the control that stops anyone who finds the webhook URL from
 * telling a real user that money arrived, so every failure mode here has to
 * end in "refused" — including the ones that look like infrastructure
 * problems rather than attacks (Circle unreachable, key not found, garbage
 * key material). A verifier that fails open under load is not a verifier.
 */

import crypto from "node:crypto";
import { verifyCircleWebhook, __clearPublicKeyCache } from "./verify-webhook";

const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});

const SPKI_BASE64 = publicKey
  .export({ type: "spki", format: "der" })
  .toString("base64");

const BODY = JSON.stringify({
  notificationType: "transactions.inbound",
  notification: { state: "COMPLETE", amounts: ["5.00"] },
});

function sign(body: string, key: crypto.KeyObject = privateKey): string {
  return crypto.sign("sha256", Buffer.from(body, "utf8"), key).toString("base64");
}

function headers(extra: Record<string, string>): Headers {
  return new Headers(extra);
}

type FetchImpl = typeof globalThis.fetch;
const realFetch = globalThis.fetch;

/** Stand in for Circle's /v2/notifications/publicKey/{keyId}. */
function stubKeyEndpoint(behaviour: "ok" | "404" | "network" | "garbage") {
  globalThis.fetch = (async () => {
    if (behaviour === "network") throw new Error("ECONNREFUSED");
    if (behaviour === "404") return new Response("", { status: 404 });
    const publicKeyValue = behaviour === "garbage" ? "not-a-key" : SPKI_BASE64;
    return new Response(JSON.stringify({ data: { publicKey: publicKeyValue } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as FetchImpl;
}

let passed = 0;
const failures: string[] = [];

async function check(
  name: string,
  run: () => Promise<boolean>,
): Promise<void> {
  __clearPublicKeyCache();
  let ok = false;
  try {
    ok = await run();
  } catch (err) {
    failures.push(`  ✗ ${name} — threw: ${String(err)}`);
    return;
  }
  if (ok) passed++;
  else failures.push(`  ✗ ${name}`);
}

async function main() {
  process.env.CIRCLE_API_KEY = "test-key";
  // The dev bypass must not be reachable during these tests.
  delete process.env.CIRCLE_WEBHOOK_VERIFY_DISABLED;

  await check("accepts a correctly signed body", async () => {
    stubKeyEndpoint("ok");
    const res = await verifyCircleWebhook(
      BODY,
      headers({ "x-circle-signature": sign(BODY), "x-circle-key-id": "key-1" }),
    );
    return res.ok === true;
  });

  await check("refuses when signature headers are absent", async () => {
    stubKeyEndpoint("ok");
    const res = await verifyCircleWebhook(BODY, headers({}));
    return res.ok === false;
  });

  await check("refuses a body signed by a different key", async () => {
    stubKeyEndpoint("ok");
    const other = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    }).privateKey;
    const res = await verifyCircleWebhook(
      BODY,
      headers({
        "x-circle-signature": sign(BODY, other),
        "x-circle-key-id": "key-1",
      }),
    );
    return res.ok === false;
  });

  await check("refuses when the body is tampered with after signing", async () => {
    stubKeyEndpoint("ok");
    const signature = sign(BODY);
    const tampered = BODY.replace('"5.00"', '"500000.00"');
    const res = await verifyCircleWebhook(
      tampered,
      headers({ "x-circle-signature": signature, "x-circle-key-id": "key-1" }),
    );
    return res.ok === false;
  });

  await check("refuses a malformed (non-DER) signature", async () => {
    stubKeyEndpoint("ok");
    const res = await verifyCircleWebhook(
      BODY,
      headers({
        "x-circle-signature": Buffer.from("nonsense").toString("base64"),
        "x-circle-key-id": "key-1",
      }),
    );
    return res.ok === false;
  });

  await check("refuses an empty signature", async () => {
    stubKeyEndpoint("ok");
    const res = await verifyCircleWebhook(
      BODY,
      headers({ "x-circle-signature": "", "x-circle-key-id": "key-1" }),
    );
    return res.ok === false;
  });

  await check("fails closed when the key endpoint 404s", async () => {
    stubKeyEndpoint("404");
    const res = await verifyCircleWebhook(
      BODY,
      headers({ "x-circle-signature": sign(BODY), "x-circle-key-id": "ghost" }),
    );
    return res.ok === false;
  });

  await check("fails closed when the key fetch throws", async () => {
    stubKeyEndpoint("network");
    const res = await verifyCircleWebhook(
      BODY,
      headers({ "x-circle-signature": sign(BODY), "x-circle-key-id": "key-1" }),
    );
    return res.ok === false;
  });

  await check("fails closed on unparseable key material", async () => {
    stubKeyEndpoint("garbage");
    const res = await verifyCircleWebhook(
      BODY,
      headers({ "x-circle-signature": sign(BODY), "x-circle-key-id": "key-1" }),
    );
    return res.ok === false;
  });

  await check("fails closed when CIRCLE_API_KEY is missing", async () => {
    stubKeyEndpoint("ok");
    const saved = process.env.CIRCLE_API_KEY;
    delete process.env.CIRCLE_API_KEY;
    const res = await verifyCircleWebhook(
      BODY,
      headers({ "x-circle-signature": sign(BODY), "x-circle-key-id": "key-1" }),
    );
    process.env.CIRCLE_API_KEY = saved;
    return res.ok === false;
  });

  await check("caches the key across calls (one fetch for two bodies)", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ data: { publicKey: SPKI_BASE64 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as FetchImpl;

    const a = await verifyCircleWebhook(
      BODY,
      headers({ "x-circle-signature": sign(BODY), "x-circle-key-id": "key-1" }),
    );
    const secondBody = BODY.replace("COMPLETE", "SENT");
    const b = await verifyCircleWebhook(
      secondBody,
      headers({
        "x-circle-signature": sign(secondBody),
        "x-circle-key-id": "key-1",
      }),
    );
    return a.ok && b.ok && calls === 1;
  });

  await check("ignores the dev bypass when NODE_ENV is production", async () => {
    stubKeyEndpoint("ok");
    const savedEnv = process.env.NODE_ENV;
    // NODE_ENV is readonly in the Next types; the runtime value is what the
    // bypass actually reads.
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.CIRCLE_WEBHOOK_VERIFY_DISABLED = "true";
    const res = await verifyCircleWebhook(BODY, headers({}));
    delete process.env.CIRCLE_WEBHOOK_VERIFY_DISABLED;
    (process.env as Record<string, string>).NODE_ENV = savedEnv ?? "test";
    return res.ok === false;
  });

  globalThis.fetch = realFetch;

  const total = passed + failures.length;
  console.log(`verify-webhook: ${passed}/${total} passed`);
  if (failures.length) {
    console.error("\nFailures:\n" + failures.join("\n"));
    process.exit(1);
  }
}

void main();
