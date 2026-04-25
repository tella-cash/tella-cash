/**
 * "Where Pago fits into everyday life" — small contextual scenarios shown
 * as a 4-up gallery. Each one mocks up a quick chat receipt to feel real.
 */

export interface UsageScene {
  id: string;
  title: string;
  description: string;
  amount: string;
  recipient: string;
  scene: "street-food" | "market" | "split-bill" | "barber";
}

export const USAGE_SCENES: UsageScene[] = [
  {
    id: "street-food",
    title: "Lunch at the buka",
    description: "Pay for the plate of jollof in seconds. No cash on you, no app to open.",
    amount: "₦2,500",
    recipient: "Iya Sikira",
    scene: "street-food",
  },
  {
    id: "market",
    title: "Settling at the market",
    description: "Tap, type the amount, send. The vendor's phone buzzes before you walk away.",
    amount: "₦20,000",
    recipient: "Mama Ngozi",
    scene: "market",
  },
  {
    id: "split-bill",
    title: "Splitting with friends",
    description: "Drop your share to the host instantly — no awkward \"I'll send it later\" debt.",
    amount: "₦10,000",
    recipient: "Chuks",
    scene: "split-bill",
  },
  {
    id: "barber",
    title: "Cuts and beauty runs",
    description: "Get styled, voice-note the amount, and pay before you stand up from the chair.",
    amount: "₦5,000",
    recipient: "Iyanu Barber",
    scene: "barber",
  },
];
