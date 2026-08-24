/**
 * renderResult degrade-path tests. Runner-free — run with `npm test`.
 *
 * This is the file that decides whether a new social works on the day it is
 * added. A provider that implements only sendText must still deliver every
 * message the app can produce, with the options reachable by typing. Each
 * case below is a fake provider recording what it was asked to send.
 */
import { renderResult } from "./render";
import type { Provider } from "./providers";
import { QUICK_CHOICES } from "@/lib/agent/menus";

interface Sent {
  kind: "text" | "choices" | "link";
  body: string;
}

function fake(opts: {
  choices?: "ok" | "refuses" | "absent";
  link?: "ok" | "refuses" | "absent";
}): { provider: Provider; sent: Sent[] } {
  const sent: Sent[] = [];
  const provider = {
    id: "meta",
    label: "test",
    selfEnrolling: true,
    normalizeId: (r: string) => r,
    sendText: async ({ body }: { body: string }) => {
      sent.push({ kind: "text", body });
      return "1";
    },
    sendImage: async () => "1",
    ...(opts.choices === "absent"
      ? {}
      : {
          sendChoices: async ({ body }: { body: string }) => {
            if (opts.choices === "refuses") return null;
            sent.push({ kind: "choices", body });
            return "1";
          },
        }),
    ...(opts.link === "absent"
      ? {}
      : {
          sendLink: async ({ body }: { body: string }) => {
            if (opts.link === "refuses") return null;
            sent.push({ kind: "link", body });
            return "1";
          },
        }),
  } as unknown as Provider;
  return { provider, sent };
}

const failures: string[] = [];
let passed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) passed++;
  else failures.push(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  // Plain text, no widgets involved.
  {
    const { provider, sent } = fake({});
    await renderResult({ provider, to: "x", result: { reply: "hello" } });
    check("plain text sends once", sent.length === 1 && sent[0].kind === "text");
  }

  // A provider that can draw options uses its widget and does not also
  // append the fallback list.
  {
    const { provider, sent } = fake({});
    await renderResult({
      provider,
      to: "x",
      result: { reply: "pick", choices: QUICK_CHOICES },
    });
    check("choices use the widget", sent.length === 1 && sent[0].kind === "choices");
    check("widget body is untouched", sent[0]?.body === "pick");
  }

  // A provider that refuses THIS set (Twilio without a matching template)
  // and one with no widget at all must both degrade the same way.
  for (const mode of ["refuses", "absent"] as const) {
    const { provider, sent } = fake({ choices: mode });
    await renderResult({
      provider,
      to: "x",
      result: { reply: "pick", choices: QUICK_CHOICES },
    });
    check(`choices degrade to text (${mode})`, sent.length === 1 && sent[0].kind === "text");
    check(
      `degraded text lists the titles (${mode})`,
      sent[0]?.body.includes("Balance") &&
        sent[0]?.body.includes("My address") &&
        sent[0]?.body.includes("Send"),
      sent[0]?.body,
    );
  }

  // The link is the one that must never be lost: it is how a send gets
  // authorized, so a channel with no button has to put the URL in the text.
  {
    const { provider, sent } = fake({});
    await renderResult({
      provider,
      to: "x",
      result: { reply: "confirm", link: { label: "Confirm send", url: "https://e/c/1" } },
    });
    check("link uses the button", sent.length === 1 && sent[0].kind === "link");
  }
  for (const mode of ["refuses", "absent"] as const) {
    const { provider, sent } = fake({ link: mode });
    await renderResult({
      provider,
      to: "x",
      result: { reply: "confirm", link: { label: "Confirm send", url: "https://e/c/1" } },
    });
    check(`link degrades to text (${mode})`, sent.length === 1 && sent[0].kind === "text");
    check(
      `degraded link keeps the URL (${mode})`,
      sent[0]?.body.includes("https://e/c/1"),
      sent[0]?.body,
    );
  }

  // A link outranks choices: the confirm prompt carries both a CTA and a
  // "reply no to cancel", and drawing two widgets is not an option anywhere.
  {
    const { provider, sent } = fake({});
    await renderResult({
      provider,
      to: "x",
      result: {
        reply: "confirm",
        choices: QUICK_CHOICES,
        link: { label: "Confirm send", url: "https://e/c/1" },
      },
    });
    check("link wins over choices", sent.length === 1 && sent[0].kind === "link");
  }

  // followUp is always its own bubble, whatever the first message was.
  {
    const { provider, sent } = fake({});
    await renderResult({
      provider,
      to: "x",
      result: { reply: "here", choices: QUICK_CHOICES, followUp: "0xabc" },
    });
    check("followUp is a separate message", sent.length === 2);
    check("followUp is plain text", sent[1]?.kind === "text" && sent[1]?.body === "0xabc");
  }

  // An empty choice array is not a widget.
  {
    const { provider, sent } = fake({});
    await renderResult({ provider, to: "x", result: { reply: "hi", choices: [] } });
    check("empty choices send plain text", sent.length === 1 && sent[0].kind === "text");
    check("empty choices add no list", sent[0]?.body === "hi");
  }

  const total = passed + failures.length;
  console.log(`render: ${passed}/${total} passed`);
  if (failures.length) {
    console.error("\nFailures:\n" + failures.join("\n"));
    process.exit(1);
  }
}

void main();
