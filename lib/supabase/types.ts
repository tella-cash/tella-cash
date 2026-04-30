export type OnboardingStep = "awaiting_name" | "completed";
export type WalletStatus = "none" | "pending" | "active" | "failed";

export interface UpayUser {
  id: string;
  whatsapp_number: string;
  profile_name: string | null;
  onboarding_step: OnboardingStep;
  circle_wallet_id: string | null;
  wallet_address: string | null;
  wallet_status: WalletStatus;
  created_at: string;
  updated_at: string;
}