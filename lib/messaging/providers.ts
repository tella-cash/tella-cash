import type { Choice } from "@/lib/agent/menus";
import type { MessageProvider } from "./processed-messages";
import type { FreezeSource } from "@/lib/supabase/types";
import {
  sendWhatsAppMessage as twilioText,
  sendWhatsAppImage as twilioImage,
  sendWhatsAppChoices as twilioChoices,
  sendWhatsAppLink as twilioLink,
} from "@/lib/twilio/client";
import {
  sendWhatsAppMessage as metaText,
  sendWhatsAppImage as metaImage,
  sendWhatsAppButtons as metaButtons,
  sendWhatsAppList as metaList,
  sendWhatsAppLink as metaLink,
} from "@/lib/meta/client";
import {
  sendTelegramMessage,
  sendTelegramImage,
  sendTelegramChoices,
  sendTelegramLink,
} from "@/lib/telegram/client";

/**
 * Every channel tella can be reached on, described the same way.
 *
 * WHAT THIS FILE REPLACED, because the shape of the old code explains the
 * shape of this one.
 *
 * The agent used to return `interactive: "buttons" | "list"` and
 * `confirm: { token }` — two fields naming Meta widget types and a Meta
 * template variable. Every inbound route then re-implemented the same
 * claim → resolve → handle → render → side-effect pipeline against those
 * names. Telegram, which has neither widget, got a hand-written 200-line
 * command allowlist instead of the product, and it drifted from the real
 * handlers within weeks.
 *
 * So the core now describes what it MEANS — some choices, a link — and
 * every provider says what it can draw. A channel that cannot draw
 * something returns null and lib/messaging/render.ts degrades it to text.
 * Nothing in lib/agent knows a provider exists.
 *
 * ADDING A SOCIAL is a client module with sendText, an entry here, and an
 * inbound route that verifies its signature and calls handleInbound. The
 * new channel gets balance, sends, freeze, onboarding and every future
 * feature on the day it is added, because none of those were ever written
 * against a channel.
 *
 * THE ONE ASYMMETRY, and it is not a preference: `selfEnrolling`.
 *
 * A tella account is phone-rooted. tella_users.whatsapp_number is the
 * unique key, the Circle wallet provisions against it, recovery links
 * deliver to it, and sends resolve recipients through it. An inbound
 * WhatsApp message therefore carries enough to create an account; a
 * Telegram chat id does not, because there is no phone number inside one.
 * Non-self-enrolling channels are linked from an already-authenticated
 * channel, which is also what proves control of both ends at once.
 *
 * After linking there is no difference. Same handler, same copy, same
 * capabilities.
 */

export interface TextArgs {
  to: string;
  body: string;
}

export interface ImageArgs {
  to: string;
  imageUrl: string;
  caption?: string;
}

export interface ChoicesArgs extends TextArgs {
  choices: Choice[];
}

export interface LinkArgs extends TextArgs {
  label: string;
  url: string;
}

export interface Provider {
  id: MessageProvider;
  /** Human-readable, for copy that has to name the channel. */
  label: string;
  /** Can an inbound message from an unrecognised id create an account? */
  selfEnrolling: boolean;
  /**
   * What tella_users.frozen_source records for a freeze that came in here.
   *
   * The agent is channel-blind by design, but "which channel did this freeze
   * arrive on" is audit data, not behaviour — and it is the first question
   * asked after an incident. Declared per provider so a new social records
   * itself honestly instead of inheriting whatever the last one said.
   */
  freezeSource: FreezeSource;
  /** Wire identifier → the form stored in tella_user_channel.external_id. */
  normalizeId(raw: string): string;
  sendText(args: TextArgs): Promise<string>;
  sendImage(args: ImageArgs): Promise<string>;
  /**
   * Draw a set of options. Return null for "I can't draw this one" — the
   * renderer falls back to text rather than the caller guessing. Absent
   * entirely means the channel has no widget at all.
   */
  sendChoices?(args: ChoicesArgs): Promise<string | null>;
  /** Draw a tap-to-open link. Same null contract as sendChoices. */
  sendLink?(args: LinkArgs): Promise<string | null>;
}

export const PROVIDERS: Record<MessageProvider, Provider> = {
  twilio: {
    id: "twilio",
    label: "WhatsApp",
    selfEnrolling: true,
    freezeSource: "whatsapp",
    // Twilio's own `whatsapp:+E164`, which is the form the users table has
    // always stored, so it is the canonical one and everything else
    // normalizes towards it.
    normalizeId: (raw) => (raw.startsWith("whatsapp:") ? raw : `whatsapp:${raw}`),
    sendText: twilioText,
    sendImage: twilioImage,
    sendChoices: twilioChoices,
    sendLink: twilioLink,
  },
  meta: {
    id: "meta",
    label: "WhatsApp",
    selfEnrolling: true,
    freezeSource: "whatsapp",
    // Meta delivers bare digits. Stored in Twilio's form so one user row
    // matches whichever provider the message arrived through.
    normalizeId: (raw) => {
      const bare = raw.replace(/^whatsapp:/, "").replace(/^\+/, "");
      return `whatsapp:+${bare}`;
    },
    sendText: metaText,
    sendImage: metaImage,
    // Three is the Cloud API's hard cap on quick replies; more than that
    // has to be a list picker, and a list picker for two options is a
    // worse experience than two buttons.
    sendChoices: ({ to, body, choices }) =>
      choices.length <= 3
        ? metaButtons({ to, body, choices })
        : metaList({ to, body, choices }),
    sendLink: metaLink,
  },
  telegram: {
    id: "telegram",
    label: "Telegram",
    selfEnrolling: false,
    freezeSource: "telegram",
    normalizeId: (raw) => raw,
    sendText: sendTelegramMessage,
    sendImage: sendTelegramImage,
    sendChoices: sendTelegramChoices,
    sendLink: sendTelegramLink,
  },
};

export function providerFor(id: MessageProvider): Provider {
  return PROVIDERS[id];
}
