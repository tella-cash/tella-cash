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
  created_at: string;
  updated_at: string;
}

export type PendingActionKind = "flow";

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
  payload: FlowPendingPayload;
  expires_at: string;
  created_at: string;
}

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
}

/** Payload for a pending flow conversation: the flow name (backend-defined,
 *  opaque to sendam-ai) and the signed continuation token to forward on the
 *  user's next reply. */
export interface FlowPendingPayload {
  flow: string;
  token: string;
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
