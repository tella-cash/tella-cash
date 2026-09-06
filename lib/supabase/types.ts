import type { MessageProvider } from "@/lib/messaging/processed-messages";

export type OnboardingStep = "awaiting_name" | "completed";
export type WalletStatus = "none" | "pending" | "active" | "failed";
export type WhatsAppChannel = "twilio" | "meta";

export interface tellaUser {
  id: string;
  whatsapp_number: string;
  whatsapp_channel: WhatsAppChannel;
  profile_name: string | null;
  onboarding_step: OnboardingStep;
  circle_wallet_id: string | null;
  wallet_address: string | null;
  wallet_status: WalletStatus;
  pin_hash: string | null;
  pin_salt: string | null;
  /**
   * When the current PIN was set or last reset.
   *
   * Unfreezing requires a factor that predates the freeze, and without this
   * a PIN could not prove that. See migrations/0019_pin_set_at.sql.
   */
  pin_set_at: string | null;
  /**
   * Set when the account is frozen, cleared when it is lifted. Deliberately
   * NOT a wallet_status value — see migrations/0012_account_freeze.sql for
   * why, and lib/users/wallet-gate.ts for who is allowed to care.
   */
  frozen_at: string | null;
  frozen_reason: string | null;
  frozen_source: FreezeSource | null;
  /** scrypt hash of the freeze-only panic code. Never authorizes anything. */
  panic_code_hash: string | null;
  created_at: string;
  updated_at: string;
}

export type FreezeSource =
  | "whatsapp"
  | "telegram"
  | "panic_code"
  | "web"
  | "operator"
  | "auto";

export type PendingActionKind = "flow" | "confirm" | "send";

/**
 * Backend-initiated multi-turn conversation state — one active conversation
 * per user, upserted on user_id. Runs entirely through sendam-ai's stateless
 * POST /flow/start + POST /decode {token} mechanism (see
 * lib/sendam-ai/client.ts): this row just stores the opaque token between
 * messages and forwards it back, it never parses the token's contents.
 * Pending sends live in their own table (`PendingSend` below) so that
 * starting a new send never collides with this or with another still-
 * pending send.
 */
export interface PendingAction {
  id: string;
  user_id: string;
  kind: PendingActionKind;
  payload: PendingActionPayload;
  expires_at: string;
  created_at: string;
}

/**
 * A destructive action proposed in one message and carried out in the next.
 *
 * Shares the table with `flow` because it shares the property that matters:
 * one per user, upserted, short TTL. It does NOT share the mechanism —
 * nothing about resolving one of these touches sendam-ai, and that is the
 * entire point. The freeze confirmation has to work when the decoder is the
 * thing that is down. See lib/agent/confirm-action.ts.
 */
export interface ConfirmPendingPayload {
  action: "freeze";
  source: FreezeSource;
  reason: string;
}

/**
 * The guided send, held one question at a time.
 *
 * Shares the table with `flow` and `confirm` for the same reason they share it
 * with each other: one per user, upserted, short TTL. Like `confirm` and
 * unlike `flow`, it touches sendam-ai at NO point — the recipient and the
 * amount are parsed locally by lib/agent/send-flow.ts.
 *
 * That is not a performance choice. This is the composition half of a
 * transfer, and the file that decides how much money moves is the last one
 * that should ask a language model to interpret a number. The decoder still
 * handles free-form sends ("send 5 to chidi"), where a wrong reading produces
 * a confirm prompt the user can read and reject; here the user is answering a
 * question we asked, so the answer is parsed with an anchored pattern or not
 * accepted at all.
 *
 * `kind: "send"` was already permitted by the CHECK constraint that migration
 * 0021 rewrote, so this needs no migration.
 */
export interface SendFlowPendingPayload {
  action: "send";
  step: "recipient" | "amount";
  /**
   * Exactly what the user picked or typed at the recipient step, unresolved.
   *
   * Stored raw on purpose. Resolving it to an address here would freeze a
   * lookup for the length of the conversation, and startSendFlow already does
   * that resolution immediately before the limits check — so a beneficiary
   * deleted, or a recipient whose wallet finished provisioning, in the seconds
   * between the two questions is read correctly rather than from a snapshot.
   */
  recipient?: string;
}

export type PendingActionPayload =
  | FlowPendingPayload
  | ConfirmPendingPayload
  | SendFlowPendingPayload;


/**
 * A pending send. No per-user uniqueness — a user can have several of
 * these at once, each with its own confirm link (the link token IS the
 * row id). Deleted on execution or cancellation, or left to expire (5 min
 * TTL) if the user never confirms.
 */
export interface PendingSend {
  id: string;
  user_id: string;
  payload: SendPayload;
  expires_at: string;
  created_at: string;
  /** Set when a confirm won the race and the transfer was handed to Circle. */
  claimed_at: string | null;
  /** How a claimed send resolved. 'unknown' means it may or may not have landed. */
  outcome: "sent" | "failed" | "unknown" | null;
}

export type HeldSendState =
  | "holding"
  | "executing"
  | "sent"
  | "failed"
  | "unknown"
  | "cancelled";

/**
 * A send that was authorized on a normal confirm link and then embargoed.
 *
 * Not an unconfirmed send: the user already proved their factor. Only
 * execution is delayed, which is what makes it safe for a cron job to carry
 * out later without a further gesture. See migrations/0015_held_sends.sql.
 */
export interface HeldSend {
  id: string;
  user_id: string;
  payload: SendPayload;
  authorized_at: string;
  release_at: string;
  state: HeldSendState;
  cancelled_at: string | null;
  cancelled_by: string | null;
  circle_transaction_id: string | null;
  created_at: string;
}

export interface SendPayload {
  /** The USDC amount the user typed and what's transferred on-chain. */
  amount: string;
  /**
   * Naira equivalent at pending-creation time, computed for internal
   * record-keeping only — not shown in any user-facing message.
   */
  amountNgn: string;
  token: "USDC";
  recipientUserId: string | null;
  recipientName: string | null;
  recipientAddress: string;
  recipientWhatsappNumber: string | null;
  /**
   * Which channel this send was started from.
   *
   * Recorded so the confirm page can return the user to the chat they came
   * from. Without it the page falls back to `user.whatsapp_channel`, which
   * is where a Telegram sender used to be thrown — into an app that may hold
   * no tella conversation at all, with the receipt sitting somewhere else.
   *
   * Optional because rows created before this existed do not have it, and
   * a five-minute TTL means "before this existed" stops mattering quickly.
   */
  origin?: MessageProvider;
}

/** Payload for a pending flow conversation: the flow name (backend-defined,
 *  opaque to sendam-ai) and the signed continuation token to forward on the
 *  user's next reply. */
export interface FlowPendingPayload {
  flow: string;
  token: string;
  /**
   * Consecutive decodeFollowUp failures against this token.
   *
   * The row is deliberately kept when a decode fails, so the user's retry
   * hits the same token rather than the flow fabricating progress. But an
   * expired-server-side token throws forever, and while it does, EVERY
   * message the user sends is captured by the flow handler and answered with
   * the same error — for up to the full 15-minute TTL, whatever they
   * actually typed. Counting the failures is what lets the flow give up and
   * hand the conversation back.
   */
  failures?: number;
}

export interface Beneficiary {
  id: string;
  user_id: string;
  label: string;
  recipient_user_id: string | null;
  recipient_address: string;
  recipient_whatsapp_number: string | null;
  created_at: string;
}

export type TransactionDirection = "sent" | "received";
export type TransactionStatus = "submitted" | "complete";

export interface tellaTransaction {
  id: string;
  user_id: string;
  direction: TransactionDirection;
  amount_usdc: string;
  amount_ngn: string;
  token: string;
  counterparty_label: string | null;
  counterparty_address: string | null;
  tx_hash: string | null;
  circle_transaction_id: string | null;
  status: TransactionStatus;
  created_at: string;
}
