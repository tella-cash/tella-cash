export type OnboardingStep = "awaiting_name" | "completed";

export interface UpayUser {
  id: string;
  whatsapp_number: string;
  profile_name: string | null;
  onboarding_step: OnboardingStep;
  created_at: string;
  updated_at: string;
}