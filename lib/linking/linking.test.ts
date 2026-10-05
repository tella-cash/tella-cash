/**
 * Joining a new WhatsApp number to an existing Telegram account: the question,
 * the handshake message, and the rule for which account may be thrown away.
 * Runner-free — run with `pnpm test`.
 */

import type { tellaUser } from "@/lib/supabase/types";
import {
  channelCheckPrompt,
  classifyChannelAnswer,
  connectExistingText,
  otherAppFor,
} from "./channel-check";
import {
  isWhatsappLinkRequest,
  looksUnused,
  parseWhatsappLinkHandoff,
  whatsappHandoffMessage,
} from "./whatsapp-link";
import { LINK_TELEGRAM_TEXT, whatsappMessageLink } from "@/lib/whatsapp/deep-link";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const SECRET = "abcdefghijklmnopqrstuvwx";
const HANDOFF = `${ID}_${SECRET}`;

function user(over: Partial<tellaUser> = {}): tellaUser {
  return {
    id: "u1",
    onboarding_step: "awaiting_channel_check",
    wallet_status: "none",
    circle_wallet_id: null,
    wallet_address: null,
    pin_hash: null,
    profile_name: null,
    whatsapp_number: "2348000000000",
    ...over,
  } as unknown as tellaUser;
}

type Check = [string, () => boolean];

const CHECKS: Check[] = [
  // the answer
  ["yes, in the ways people say it", () => ["yes", "Yes", "yeah", "yep", "I do", "I have", "yes I do", "sure", "Yes."].every((t) => classifyChannelAnswer(t) === "yes")],
  ["no, in the ways people say it", () => ["no", "No", "nope", "nah", "new", "I'm new", "im new", "none", "I don't", "no thanks", "start fresh"].every((t) => classifyChannelAnswer(t) === "no")],
  ["anything else asks again", () => ["", "maybe", "what is telegram", "hello", "10", "send 5 to bob"].every((t) => classifyChannelAnswer(t) === "other")],
  ["a tap on the Yes and No buttons classifies", () => classifyChannelAnswer("Yes") === "yes" && classifyChannelAnswer("No") === "no"],

  // the question is asked in both directions
  ["a WhatsApp number is asked about Telegram, a Telegram chat about WhatsApp", () =>
    otherAppFor("meta") === "Telegram" && otherAppFor("telegram") === "WhatsApp"],
  ["the prompt names the app it asks about", () =>
    channelCheckPrompt("WhatsApp").includes("account on WhatsApp") && channelCheckPrompt("Telegram").includes("account on Telegram")],
  ["connecting from Telegram points at WhatsApp and offers a way out", () => {
    const t = connectExistingText("WhatsApp");
    return t.includes("WhatsApp") && t.includes("Telegram chat joins") && t.includes("Reply *new*");
  }],
  ["connecting from WhatsApp is unchanged", () => connectExistingText("Telegram").includes("Your number joins your existing wallet")],
  ["the Telegram side's prefilled WhatsApp message is a plain link telegram", () => {
    const url = whatsappMessageLink(LINK_TELEGRAM_TEXT);
    return LINK_TELEGRAM_TEXT === "link telegram" && url.startsWith("https://wa.me/") && url.endsWith("?text=link%20telegram");
  }],

  // the typed command
  ["link whatsapp, however it is phrased", () => ["link whatsapp", "connect WhatsApp", "add whatsapp", "use whatsapp", "whatsapp link", "link my whatsapp"].every(isWhatsappLinkRequest)],
  ["unrelated text is not a link request", () => !["balance", "send 5 to bob", "hello", "", "link telegram", "x".repeat(200)].some(isWhatsappLinkRequest)],

  // the handshake message
  ["a handoff message parses", () => parseWhatsappLinkHandoff(whatsappHandoffMessage(HANDOFF)) === HANDOFF],
  ["case and padding are tolerated", () => parseWhatsappLinkHandoff(`  LINK ${HANDOFF}  `) === HANDOFF],
  ["a bare token id is not a handoff", () => parseWhatsappLinkHandoff(`link ${ID}`) === null],
  ["a short secret is not a handoff", () => parseWhatsappLinkHandoff(`link ${ID}_abc`) === null],
  ["extra words around it are not a handoff", () => parseWhatsappLinkHandoff(`please link ${HANDOFF}`) === null && parseWhatsappLinkHandoff(`link ${HANDOFF} now`) === null],
  ["ordinary messages are never handoffs", () => ["link telegram", "link whatsapp", "balance", ""].every((t) => parseWhatsappLinkHandoff(t) === null)],
  ["the prefilled WhatsApp link carries the message, encoded", () => {
    const url = whatsappMessageLink(whatsappHandoffMessage(HANDOFF));
    return url.startsWith("https://wa.me/") && url.includes("?text=link%20") && url.endsWith(HANDOFF);
  }],

  // which account may be thrown away
  ["a never-used placeholder looks unused", () => looksUnused(user())],
  ["a placeholder past the question, before a name, looks unused", () => looksUnused(user({ onboarding_step: "awaiting_name" }))],
  ["a finished onboarding is never unused", () => !looksUnused(user({ onboarding_step: "completed" }))],
  ["a wallet in any state is never unused", () =>
    !looksUnused(user({ wallet_status: "pending" })) && !looksUnused(user({ wallet_status: "failed" })) &&
    !looksUnused(user({ circle_wallet_id: "w" })) && !looksUnused(user({ wallet_address: "0x1" }))],
  ["a PIN means it is not unused", () => !looksUnused(user({ pin_hash: "x" }))],
  ["a name means it is not unused", () => !looksUnused(user({ profile_name: "Ada" }))],
];

let failed = 0;
for (const [name, fn] of CHECKS) {
  let ok = false;
  try {
    ok = fn();
  } catch (err) {
    console.error("  threw:", err);
  }
  if (!ok) {
    failed++;
    console.error(`FAIL  ${name}`);
  }
}
if (failed) {
  console.error(`${failed} of ${CHECKS.length} linking checks failed`);
  process.exit(1);
}
console.log(`linking: ${CHECKS.length} checks passed`);
