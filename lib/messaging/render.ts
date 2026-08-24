import type { HandlerResult } from "@/lib/agent/handler";
import type { Provider } from "./providers";

/**
 * Turn one channel-neutral HandlerResult into whatever this channel can draw.
 *
 * THE DEGRADE RULE LIVES HERE AND NOWHERE ELSE. That is the whole value of
 * the file: every provider gets the same fallback behaviour without any of
 * them implementing it, so a new social that only knows how to send text is
 * fully functional on the day it is added — the options simply arrive as a
 * line of text the user can type back, which the tier-0 classifier already
 * understands (see lib/agent/fast-path.ts).
 *
 * A provider signals "I can't draw this particular thing" by returning null,
 * not by throwing and not by silently sending something else. Twilio does
 * exactly that for any option set it has no Content Template for.
 */
export async function renderResult({
  provider,
  to,
  result,
}: {
  provider: Provider;
  to: string;
  result: HandlerResult;
}): Promise<void> {
  const { reply, choices, link, followUp } = result;

  let sent: string | null = null;

  if (link) {
    sent = provider.sendLink
      ? await provider.sendLink({ to, body: reply, label: link.label, url: link.url })
      : null;

    if (sent === null) {
      await provider.sendText({ to, body: `${reply}\n\n${link.url}` });
    }
  } else if (choices && choices.length > 0) {
    sent = provider.sendChoices
      ? await provider.sendChoices({ to, body: reply, choices })
      : null;

    if (sent === null) {
      await provider.sendText({ to, body: withChoiceList(reply, result) });
    }
  } else {
    await provider.sendText({ to, body: reply });
  }

  // Its own message, nothing else in the bubble, so a long-press → Copy
  // grabs exactly this — a wallet address, usually — and nothing mixed in
  // from the sentence above it.
  if (followUp) {
    await provider.sendText({ to, body: followUp });
  }
}

/**
 * The text fallback for a tappable option set.
 *
 * Titles, not ids, because the title is what the tier-0 classifier matches
 * and therefore what the user has to be able to type. Descriptions are
 * dropped: this is a prompt, not a menu, and a six-line list at the bottom
 * of every reply is worse than no list at all.
 */
function withChoiceList(reply: string, result: HandlerResult): string {
  const titles = (result.choices ?? []).map((c) => c.title);
  if (titles.length === 0) return reply;
  return `${reply}\n\nReply: ${titles.join(" · ")}`;
}
