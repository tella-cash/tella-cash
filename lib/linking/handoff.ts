import type { tellaUser } from "@/lib/supabase/types";
import { emailLinkedGoogle } from "@/lib/email/security-notice";
import { notifyUser } from "@/lib/messaging/notify";
import { consumeResetToken, loadAuthorizedLink } from "@/lib/security/reset-tokens";
import { FACTOR_CHANGE_HOLD_HOURS, inFactorChangeWindow } from "@/lib/sends/tiers";
import { isFrozen } from "@/lib/users/wallet-gate";
import { isAbandonableAccount, mergePlaceholderIntoAccount } from "./whatsapp-link";

/**
 * The WhatsApp half of "link whatsapp": a message of the form
 * `link <token>_<secret>` arriving from the number being linked.
 *
 * Consuming the token HERE is the point, exactly as it is for Telegram's
 * /start handler. The Telegram account proved its PIN or passkey on the web to
 * get the handoff; this message proves the sender controls the WhatsApp
 * number. Whoever completes both demonstrably holds both ends.
 *
 * Returns the reply text for the sender. Never throws on a refusal.
 */
export async function handleWhatsappLinkHandoff(args: {
  sender: tellaUser;
  handoff: string;
}): Promise<string> {
  const { sender, handoff } = args;

  const ctx = await loadAuthorizedLink(handoff, "link_whatsapp");
  if (!ctx) {
    return "That link is invalid, expired, or hasn't been confirmed yet. Open Telegram, say *link whatsapp* there, confirm it's you, then tap Open WhatsApp.";
  }
  const target = ctx.user;

  if (target.id === sender.id) {
    return "This WhatsApp number is already connected to your wallet.";
  }

  // Same refusals as the web step and the Telegram handler. A token confirmed
  // just before a freeze or a PIN reset must not complete just after it.
  if (isFrozen(target)) {
    return "That wallet is frozen, so nothing new can be connected to it right now.";
  }
  if (inFactorChangeWindow(target.factors_changed_at)) {
    return `That wallet's PIN, passkeys or linked accounts changed recently, so new links are paused for ${FACTOR_CHANGE_HOLD_HOURS} hours after that. Try again later.`;
  }

  // BEFORE the token is spent: refusing because this number already has a
  // wallet of its own should not cost the person a fresh link.
  if (!(await isAbandonableAccount(sender))) {
    return [
      "This WhatsApp number already has its own tella wallet, so I can't connect it to another one.",
      "",
      "To use that wallet from Telegram instead, say *link telegram* here.",
    ].join("\n");
  }

  const consumed = await consumeResetToken(ctx.token.id);
  if (!consumed) return "That link has already been used.";

  const merged = await mergePlaceholderIntoAccount({ placeholder: sender, target });
  if (!merged.ok) {
    console.error("[link-whatsapp] merge refused", { reason: merged.reason });
    return merged.reason === "phone_taken"
      ? "That wallet already has a WhatsApp number connected."
      : "I couldn't finish connecting this number just now. Ask for a new link on Telegram and try again.";
  }

  // Announced everywhere, not just where it happened: whoever linked this holds
  // one chat and could delete a notice sent only there. The Google address is
  // the one they don't automatically control.
  await Promise.allSettled([
    notifyUser({
      user: target,
      body: [
        "🔗 A WhatsApp number was just linked to your tella wallet.",
        "",
        "If this wasn't you, reply *freeze* immediately.",
      ].join("\n"),
    }).catch((err) => console.error("[link-whatsapp] notification failed", { userId: target.id, err })),
    emailLinkedGoogle({
      userId: target.id,
      kind: "channel_linked",
      subject: "A WhatsApp number was linked to your tella wallet",
      lines: [
        "A WhatsApp number was just linked to your tella wallet. It can check the balance, send and freeze.",
        "",
        "If this wasn't you, freeze your wallet now: message tella and say freeze, or use the freeze page with this Google account.",
      ],
    }),
  ]);

  console.log("[link-whatsapp] number linked", { userId: target.id });
  return [
    "✅ Linked. This WhatsApp number is now connected to your tella wallet.",
    "",
    "It works just like Telegram: balance, sends and freeze. You'll get alerts in both places, and people can now pay you by phone number.",
  ].join("\n");
}
