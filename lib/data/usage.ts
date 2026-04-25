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
    title: "Freelance payout, paid out",
    description: "Client settled in USDC. Offramped to Naira with UPAY and paid the landlord — all before lunch.",
    amount: "₦412,500",
    recipient: "GTBank",
    scene: "street-food",
  },
  {
    id: "market",
    title: "Market run, sorted",
    description: "Offramped just enough USDC for the weekend groceries. Rate locked, Naira in the account before you hit the gate.",
    amount: "₦49,500",
    recipient: "Access Bank",
    scene: "market",
  },
  {
    id: "split-bill",
    title: "Split the client payout",
    description: "Agency paid in USDC. UPAY converted and sent each co-freelancer their share — no awkward IOUs.",
    amount: "₦82,500",
    recipient: "OPay",
    scene: "split-bill",
  },
  {
    id: "barber",
    title: "Quick account top-up",
    description: "Running low between paydays? Voice-note UPAY to offramp a little USDC — topped up before the next appointment.",
    amount: "₦33,000",
    recipient: "UBA",
    scene: "barber",
  },
];
