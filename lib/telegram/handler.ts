import type { tellaUser } from "@/lib/supabase/types";
import { gateWalletReady } from "@/lib/users/wallet-gate";
import { getWalletBalances } from "@/lib/wallet/circle";
import { listRecentTransactions } from "@/lib/transactions/repository";
import { listHoldingForUser } from "@/lib/held_sends/repository";
import { freezeAccount } from "@/lib/users/freeze";
import { isFrozen } from "@/lib/users/wallet-gate";
import { isFreezeRequest } from "@/lib/agent/detect-freeze-request";

/**
 * Telegram's command surface. Read-only, plus the kill switch.
 *
 * THIS IS DELIBERATELY NOT handleIncomingMessage, AND THAT IS THE WHOLE
 * DESIGN OF THIS FILE.
 *
 * Routing Telegram into the WhatsApp agent and trusting that the send branch
 * stays unreachable would make "read-only" a property of nobody touching it.
 * That function can start sends, mint confirm links and open sendam-ai flows,
 * and any future edit to it silently inherits those capabilities on a channel
 * that was never meant to have them. An explicit allowlist makes read-only a
 * property of the code's shape instead: adding a write here requires writing
 * one, which is a decision someone has to make on purpose.
 *
 * Telegram is also phone-rooted, exactly like WhatsApp, so linking it adds
 * reach and not security. It must never become a second recovery path.
 *
 * /freeze is the one deliberate exception to read-only. Freezing has to be
 * reachable from everywhere and is safe in every direction — see
 * migrations/0012_account_freeze.sql.
 */

export interface TelegramReply {
  text: string;
}

const HELP = [
  "Here's what I can do on Telegram:",
  "",
  "/balance — your USDC balance",
  "/address — your wallet address",
  "/history — recent transactions",
  "/pending — transfers waiting to go out",
  "/freeze — stop everything leaving your wallet",
  "",
  "Sending money stays on WhatsApp for now.",
].join("\n");

export async function handleTelegramCommand({
  user,
  text,
}: {
  user: tellaUser;
  text: string;
}): Promise<TelegramReply> {
  const trimmed = text.trim();
  const command = trimmed.split(/\s+/)[0]?.toLowerCase().replace(/@.*$/, "") ?? "";

  // Matched before the command table so the phrases people actually type when
  // it is happening to them work here too, not just the slash command.
  if (isFreezeRequest(trimmed)) return freeze(user);

  switch (command) {
    case "/start":
    case "/help":
      return { text: HELP };
    case "/balance":
      return balance(user);
    case "/address":
      return address(user);
    case "/history":
      return history(user);
    case "/pending":
      return pending(user);
    case "/freeze":
    case "/stop":
      return freeze(user);
    default:
      // No fallthrough to any agent. An unrecognised message on this channel
      // gets the menu, never an interpretation.
      return {
        text: [
          "I only handle a few things here.",
          "",
          HELP,
        ].join("\n"),
      };
  }
}

async function balance(user: tellaUser): Promise<TelegramReply> {
  const gate = gateWalletReady(user);
  if (!gate.ok) return { text: "Your wallet isn't ready yet." };

  try {
    const balances = await getWalletBalances(gate.walletId);
    const nonZero = balances.filter((b) => parseFloat(b.amount) > 0);

    if (nonZero.length === 0) {
      return { text: "Your balance is empty right now." };
    }

    const frozenNote = isFrozen(user)
      ? "\n\n🔒 Your account is frozen, so nothing can leave this wallet."
      : "";

    return {
      text: `Your balance:\n${nonZero.map((b) => `• ${b.amount} ${b.symbol}`).join("\n")}${frozenNote}`,
    };
  } catch (err) {
    console.error("[telegram] balance failed", { userId: user.id, err });
    return { text: "I couldn't reach your balance just now. Try again in a moment." };
  }
}

function address(user: tellaUser): TelegramReply {
  const gate = gateWalletReady(user);
  if (!gate.ok || !user.wallet_address) {
    return { text: "Your wallet isn't ready yet." };
  }
  // Address on its own line so a long-press copies exactly it.
  return { text: `Your wallet address:\n\n${user.wallet_address}` };
}

async function history(user: tellaUser): Promise<TelegramReply> {
  const transactions = await listRecentTransactions(user.id, 10);
  if (transactions.length === 0) {
    return { text: "No transactions yet." };
  }

  const lines = transactions.map((t) => {
    const arrow = t.direction === "sent" ? "↗" : "↙";
    const who = t.counterparty_label ?? "an external wallet";
    return `${arrow} ${t.amount_usdc} USDC ${t.direction === "sent" ? "to" : "from"} ${who}`;
  });

  return { text: `Recent transactions:\n${lines.join("\n")}` };
}

async function pending(user: tellaUser): Promise<TelegramReply> {
  const holds = await listHoldingForUser(user.id);
  if (holds.length === 0) {
    return { text: "Nothing is waiting to go out." };
  }

  const lines = holds.map((h) => {
    const when = new Date(h.release_at).toLocaleString("en-NG", {
      timeZone: "Africa/Lagos",
      day: "2-digit",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    return `• ${h.payload.amount} USDC to ${h.payload.recipientName ?? h.payload.recipientAddress} — ${when}`;
  });

  return {
    text: [
      "Waiting to go out:",
      ...lines,
      "",
      "Reply /freeze to stop all of them, or cancel one on WhatsApp.",
    ].join("\n"),
  };
}

async function freeze(user: tellaUser): Promise<TelegramReply> {
  if (isFrozen(user)) {
    return { text: "🔒 Your account is already frozen. Nothing can leave your wallet." };
  }

  try {
    const { cancelledSends, cancelledHolds } = await freezeAccount({
      userId: user.id,
      source: "telegram",
      reason: "user requested via telegram",
    });

    const stopped: string[] = [];
    if (cancelledSends > 0) stopped.push(`${cancelledSends} pending send${cancelledSends > 1 ? "s" : ""}`);
    if (cancelledHolds > 0) stopped.push(`${cancelledHolds} queued transfer${cancelledHolds > 1 ? "s" : ""}`);

    return {
      text: [
        "🔒 Frozen. Nothing can leave your wallet.",
        "",
        stopped.length > 0
          ? `I also stopped ${stopped.join(" and ")}.`
          : "You had nothing waiting to go out.",
        "",
        "You can still receive money. Message tella on WhatsApp when you want it lifted.",
      ].join("\n"),
    };
  } catch (err) {
    // Never claim safety we did not achieve.
    console.error("[telegram] freeze failed", { userId: user.id, err });
    return {
      text: "I couldn't freeze your account just then, and I don't want to tell you it's safe when I'm not sure. Try /freeze again right now.",
    };
  }
}
