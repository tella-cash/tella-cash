/**
 * Image-notification tests. Runner-free — run with `npm test`.
 *
 * A "money received" alert is an image, and a failed image used to mean no
 * alert at all: the caller's text fallback sat behind a catch that nothing
 * could reach. These pin the two halves of the fix — the per-channel text
 * fallback, and Telegram's upload of bytes it fetched itself.
 */
import { sendImageOrText } from "./notify";
import { sendTelegramImage, TelegramBlockedError } from "@/lib/telegram/client";

interface Sent {
  kind: "image" | "text";
  body?: string;
}

function fake(imageFails: unknown): { provider: Parameters<typeof sendImageOrText>[0]; sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    provider: {
      id: "telegram",
      sendImage: async ({ caption }) => {
        if (imageFails) throw imageFails;
        sent.push({ kind: "image", body: caption });
        return "1";
      },
      sendText: async ({ body }) => {
        sent.push({ kind: "text", body });
        return "2";
      },
    },
  };
}

const failures: string[] = [];
let passed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) passed++;
  else failures.push(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

async function rejects(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  return undefined;
}

async function main() {
  const args = { to: "1", imageUrl: "https://e/i.png", caption: "cap", fallbackBody: "words" };

  {
    const { provider, sent } = fake(null);
    await sendImageOrText(provider, args);
    check("image is sent when it can be", sent.length === 1 && sent[0].kind === "image");
  }

  {
    const { provider, sent } = fake(new Error("failed to get HTTP URL content"));
    await sendImageOrText(provider, args);
    check(
      "a failed image falls back to the fallback body",
      sent.length === 1 && sent[0].kind === "text" && sent[0].body === "words",
    );
  }

  {
    const { provider, sent } = fake(new Error("boom"));
    await sendImageOrText(provider, { ...args, fallbackBody: undefined });
    check("fallback defaults to the caption", sent[0]?.body === "cap");
  }

  {
    const { provider, sent } = fake(new Error("boom"));
    const err = await rejects(() =>
      sendImageOrText(provider, { ...args, caption: undefined, fallbackBody: undefined }),
    );
    check("nothing to fall back to rethrows the image error", err instanceof Error && sent.length === 0);
  }

  {
    const { provider, sent } = fake(new TelegramBlockedError("bot was blocked by the user"));
    const err = await rejects(() => sendImageOrText(provider, args));
    check(
      "a blocked chat is rethrown, not retried as text",
      err instanceof TelegramBlockedError && sent.length === 0,
    );
  }

  // Telegram: bytes are fetched here and uploaded as multipart.
  const realFetch = globalThis.fetch;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";

  {
    const calls: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, body: init?.body });
      if (u.startsWith("https://app.test/")) {
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }));
    }) as typeof fetch;

    const id = await sendTelegramImage({
      to: "42",
      imageUrl: "https://app.test/card.png",
      caption: "💰 *5 USDC*",
    });
    const upload = calls[1];
    const form = upload?.body;
    check("telegram image resolves to the message id", id === "7");
    check("telegram image fetches the source itself", calls[0]?.url === "https://app.test/card.png");
    check(
      "telegram image is uploaded to sendPhoto as multipart",
      upload?.url.endsWith("/sendPhoto") && form instanceof FormData,
    );
    check(
      "upload carries the file and the chat, not a URL",
      form instanceof FormData &&
        form.get("photo") instanceof Blob &&
        form.get("chat_id") === "42",
    );
    check(
      "caption is HTML-formatted",
      form instanceof FormData &&
        form.get("caption") === "💰 <b>5 USDC</b>" &&
        form.get("parse_mode") === "HTML",
    );
  }

  {
    let uploaded = false;
    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url).includes("api.telegram.org")) uploaded = true;
      return new Response("<html>oops</html>", { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const err = await rejects(() => sendTelegramImage({ to: "42", imageUrl: "https://app.test/x" }));
    check("a non-image 200 is refused before upload", err instanceof Error && !uploaded);
  }

  {
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    const err = await rejects(() => sendTelegramImage({ to: "42", imageUrl: "https://app.test/x" }));
    check("a failed render is an error, not a silent skip", err instanceof Error);
  }

  globalThis.fetch = realFetch;

  const total = passed + failures.length;
  console.log(`notify: ${passed}/${total} passed`);
  if (failures.length) {
    console.error("\nFailures:\n" + failures.join("\n"));
    process.exit(1);
  }
}

void main();
