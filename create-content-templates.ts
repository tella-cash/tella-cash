// create-content-templates.ts
//
// One-time setup: creates the two WhatsApp interactive Content Templates the
// agent uses (a 3-button quick-reply menu and a fuller list picker) and prints
// their SIDs. Add the printed SIDs to .env (and Vercel) as:
//
//   TWILIO_MENU_CONTENT_SID=...   (quick-reply buttons)
//   TWILIO_LIST_CONTENT_SID=...   (list picker)
//
// Until those are set, the agent falls back to plain-text menus, so this is
// safe to run whenever you're ready.
//
// Run with env loaded, e.g.:
//   pnpm tsx --env-file=.env create-content-templates.ts

const CONTENT_API = "https://content.twilio.com/v1/Content";

interface CreatedContent {
  sid: string;
  friendly_name: string;
}

async function createContent(body: unknown): Promise<CreatedContent> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error(
      "Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN. Load your .env first.",
    );
  }

  const res = await fetch(CONTENT_API, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Content create failed (${res.status}): ${await res.text()}`);
  }

  return (await res.json()) as CreatedContent;
}

async function main() {
  // Quick-reply buttons. WhatsApp allows max 3. Titles double as the inbound
  // message body when tapped, so they're written to match the intent router.
  console.log("Creating quick-reply menu template…");
  const buttons = await createContent({
    friendly_name: "tella_menu_buttons",
    language: "en",
    variables: { "1": "How can I help?" },
    types: {
      "twilio/quick-reply": {
        body: "{{1}}",
        actions: [
          { title: "Balance", id: "balance" },
          { title: "My address", id: "address" },
          { title: "Send", id: "send" },
        ],
      },
    },
  });
  console.log("  created:", buttons.sid);

  // List picker. Room for more options with descriptions.
  console.log("\nCreating list-picker menu template…");
  const list = await createContent({
    friendly_name: "tella_menu_list",
    language: "en",
    variables: { "1": "What would you like to do?" },
    types: {
      "twilio/list-picker": {
        body: "{{1}}",
        button: "Menu",
        items: [
          { item: "Balance", id: "balance", description: "Check your USDC balance" },
          { item: "My address", id: "address", description: "Get your wallet address" },
          { item: "Send USDC", id: "send", description: "Send to a number or 0x address" },
          { item: "How it works", id: "how", description: "Learn how tella works" },
          { item: "Is it safe?", id: "safe", description: "How your money is protected" },
        ],
      },
    },
  });
  console.log("  created:", list.sid);

  console.log("\nDone! Add these to your .env (and Vercel env vars):\n");
  console.log(`TWILIO_MENU_CONTENT_SID=${buttons.sid}`);
  console.log(`TWILIO_LIST_CONTENT_SID=${list.sid}`);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
