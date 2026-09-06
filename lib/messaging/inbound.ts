import type { tellaUser } from "@/lib/supabase/types";
import { handleIncomingMessage, type HandlerResult } from "@/lib/agent/handler";
import { findOrCreateUser, findUserById } from "@/lib/users/repository";
import { findChannel } from "./channels";
import { claimMessage, releaseMessage, type MessageProvider } from "./processed-messages";
import { providerFor, type Provider } from "./providers";
import { renderResult } from "./render";
import { provisionWalletForUser } from "@/lib/wallet/provision";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { QUICK_CHOICES } from "@/lib/agent/menus";
import { SITE } from "@/lib/data/site";

/**
 * The inbound pipeline, once.
 *
 * All three webhook routes used to carry their own copy of this: claim the
 * message, resolve the user, run the agent, render the reply, run the
 * side effect, release on failure. They had already drifted — the Meta route
 * gained a fallback message that the Telegram route never had, and the
 * Telegram route ran a different handler entirely.
 *
 * What stays in a route is what is genuinely that provider's own: verifying
 * its signature, understanding its payload shape, and acking fast. Everything
 * from the claim onwards is here.
 */

export interface InboundMessage {
  provider: MessageProvider;
  /** The raw wire identifier. Normalized by the provider before use. */
  externalId: string;
  text: string;
  /** Provider-unique, for the idempotency claim. */
  messageId: string;
  /**
   * The display name the provider reports for this sender, if it gives one.
   *
   * Both WhatsApp routes have always parsed it and neither could pass it on,
   * because this interface had nowhere to put it — so tella_user_channel
   * .display_name, the column that exists to answer "which account is this",
   * stayed null for every user. Never logged: it is a real person's name.
   */
  profileName?: string | null;
}

const FALLBACK_MESSAGE =
  "⚠️ I'm having a bit of trouble on my end right now. Please try again in a moment — your funds are safe.";

/**
 * Claim, handle, reply. Safe to call for a redelivered message: the claim
 * is what makes it so.
 */
export async function handleInbound(message: InboundMessage): Promise<void> {
  const { provider: providerId, messageId } = message;

  const claimed = await claimMessage({ provider: providerId, messageId });
  if (!claimed) {
    console.log("[inbound] duplicate delivery ignored", { provider: providerId, messageId });
    return;
  }

  try {
    await process(message);
  } catch (err) {
    // Released so a redelivery gets another attempt. Without this a
    // transient failure would burn the message permanently.
    console.error("[inbound] processing error", { provider: providerId, err });
    await releaseMessage({ provider: providerId, messageId });
    throw err;
  }
}

async function process(message: InboundMessage): Promise<void> {
  const provider = providerFor(message.provider);
  const to = provider.normalizeId(message.externalId);

  console.log("[inbound] message", {
    provider: provider.id,
    id: message.messageId,
    chars: message.text.length,
  });

  let resolved: { user: tellaUser; isNew: boolean } | null;
  try {
    resolved = await resolveUser(provider, to, message.profileName);
  } catch (err) {
    console.error("[inbound] user lookup failed", { provider: provider.id, err });
    await safeSend(provider, to, FALLBACK_MESSAGE);
    return;
  }

  if (!resolved) {
    // A channel that cannot create accounts, reached by someone who has not
    // linked one. Not an error — it is the entire population of a new social
    // on day one, so it gets real instructions rather than a shrug.
    await safeSend(provider, to, unlinkedMessage(provider));
    return;
  }

  const { user, isNew } = resolved;

  let result: HandlerResult;
  try {
    result = await handleIncomingMessage({
      user,
      text: message.text,
      isNew,
      origin: provider.id,
    });
  } catch (err) {
    console.error("[inbound] agent error", { provider: provider.id, userId: user.id, err });
    await safeSend(provider, to, FALLBACK_MESSAGE);
    return;
  }

  try {
    await renderResult({ provider, to, result });
  } catch (err) {
    // The channel itself is unreachable. Nothing left to try.
    console.error("[inbound] send reply failed", { provider: provider.id, err });
    return;
  }

  if (result.sideEffect?.kind === "provision_wallet") {
    await provisionWallet(provider, to, result.sideEffect.userId);
  }
}

/**
 * Who sent this, and may they exist yet?
 *
 * The branch is `selfEnrolling` and nothing else — see providers.ts for why
 * that property is a fact about the wallet's identity model rather than a
 * ranking of channels.
 */
async function resolveUser(
  provider: Provider,
  externalId: string,
  profileName?: string | null,
): Promise<{ user: tellaUser; isNew: boolean } | null> {
  if (provider.selfEnrolling) {
    return findOrCreateUser({
      whatsappNumber: externalId,
      profileName,
      // Only WhatsApp providers are self-enrolling, and the column's CHECK
      // constraint (migration 0002) only admits those two, so this cast is
      // exactly as narrow as the branch it sits in.
      channel: provider.id as "twilio" | "meta",
    });
  }

  const channel = await findChannel(provider.id, externalId);
  if (!channel || !channel.verified_at) return null;

  const user = await findUserById(channel.user_id);
  if (!user) return null;

  return { user, isNew: false };
}

/**
 * The reply for someone the app has never seen, on a channel that cannot
 * create accounts.
 *
 * It carries the WhatsApp link rather than just naming WhatsApp, because
 * this is no longer only reached by people mid-setup: the landing page now
 * advertises a "Chat on Telegram" button, so a complete stranger can arrive
 * here first. Telling them to go find another app and type a phrase is a
 * dead end at the top of the funnel; a tappable link is one step.
 *
 * They still have to start on WhatsApp. That is the phone-rooted identity
 * model described in providers.ts, not a preference — and it is the reason
 * this message exists at all rather than an onboarding flow.
 */
function unlinkedMessage(provider: Provider): string {
  return [
    `This ${provider.label} account isn't connected to a tella wallet yet.`,
    "",
    `Start on WhatsApp — ${SITE.whatsappLink}`,
    "",
    `Once you're set up, say "link ${provider.id}" there and I'll send you a link that connects the two.`,
  ].join("\n");
}

/**
 * The wallet-ready announcement, after onboarding.
 *
 * Best-effort by design: the user already has their reply, so a failure here
 * is logged rather than surfaced a second time.
 */
async function provisionWallet(
  provider: Provider,
  to: string,
  userId: string,
): Promise<void> {
  try {
    const success = await provisionWalletForUser(userId);

    if (!success) {
      await provider.sendText({
        to,
        body: "I couldn't set up your wallet just now — I'll retry automatically. You can keep using tella in the meantime.",
      });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("tella_users")
      .select("wallet_address")
      .eq("id", userId)
      .single();

    const address = (data as { wallet_address: string } | null)?.wallet_address;
    if (!address) return;

    await renderResult({
      provider,
      to,
      result: {
        reply: [
          "✅ Your wallet is ready!",
          "",
          `Address: \`${address}\``,
          "",
          "Send USDC to this address on Arc to fund your account, then tap below to get started.",
        ].join("\n"),
        choices: QUICK_CHOICES,
      },
    });
  } catch (err) {
    console.error("[inbound] provisionWallet failed", { provider: provider.id, userId, err });
  }
}

/** A send that must not itself become the reason nothing is sent. */
async function safeSend(provider: Provider, to: string, body: string): Promise<void> {
  try {
    await provider.sendText({ to, body });
  } catch (err) {
    console.error("[inbound] fallback send failed", { provider: provider.id, err });
  }
}
