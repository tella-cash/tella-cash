export type OnboardingStep = "awaiting_name" | "completed";
export type WalletStatus = "none" | "pending" | "active" | "failed";

export interface tellaUser {
  id: string;
  whatsapp_number: string;
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

export interface PendingAction {
  id: string;
  user_id: string;
  kind: "send";
  payload: SendPayload;
  expires_at: string;
  created_at: string;
}

export interface SendPayload {
  amount: string;
  token: "USDC";
  recipientUserId: string | null;
  recipientName: string | null;
  recipientAddress: string;
}