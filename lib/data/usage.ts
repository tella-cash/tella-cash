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
    description: "Client paid in USDC. Cashed out to the bank with tella and covered rent — all before lunch.",
    amount: "₦412,500",
    recipient: "GTBank",
    scene: "street-food",
  },
  {
    id: "market",
    title: "Market run, sorted",
    description: "Paid out just enough for the weekend groceries. Rate locked, money in the account before you hit the gate.",
    amount: "₦49,500",
    recipient: "Access Bank",
    scene: "market",
  },
  {
    id: "split-bill",
    title: "Split the client payout",
    description: "Agency paid in USDC. tella split it and sent each co-freelancer their share — no awkward IOUs.",
    amount: "₦82,500",
    recipient: "OPay",
    scene: "split-bill",
  },
  {
    id: "barber",
    title: "Quick account top-up",
    description: "Running low between paydays? Voice-note tella to cash out a little — topped up before the next appointment.",
    amount: "₦33,000",
    recipient: "UBA",
    scene: "barber",
  },
];
