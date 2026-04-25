export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export const FAQS: FaqItem[] = [
  {
    id: "what-is-upay",
    question: "What exactly is UPAY?",
    answer:
      "UPAY is a WhatsApp bot that converts USDC to Nigerian Naira and sends the Naira straight to your bank account. No crypto exchange account, no separate app — just send a message, confirm the rate, and your bank is credited in seconds.",
  },
  {
    id: "what-is-usdc",
    question: "What is USDC and why would I need to offramp it?",
    answer:
      "USDC is a dollar-pegged stablecoin — one USDC is always worth one US dollar. If you earn, receive, or hold USDC and need Nigerian Naira for everyday spending, that's an offramp. UPAY makes it as simple as sending a WhatsApp message.",
  },
  {
    id: "how-it-works",
    question: "How does the offramp actually work?",
    answer:
      "Tell UPAY how much USDC you want to sell. It quotes you the live market rate with our competitive spread, you confirm, and UPAY settles the transaction on ARC — a blockchain built for near-zero second finality. The Naira lands in your registered Nigerian bank account within seconds.",
  },
  {
    id: "rates",
    question: "What rate do I get?",
    answer:
      "UPAY uses live market rates with a competitive spread — no hidden fees, no markups buried in a surprise number. The rate shown when you confirm is the rate you get. You can also ask UPAY \"what's the rate?\" any time to check before you commit.",
  },
  {
    id: "settlement",
    question: "How fast does it settle?",
    answer:
      "Near-zero second finality. UPAY settles on ARC, a blockchain purpose-built for instant transactions. Most offramps complete before you can put your phone down. Your Naira does not queue.",
  },
  {
    id: "getting-started",
    question: "How do I get started?",
    answer:
      "Tap any \"Try UPAY\" button on this page to open a WhatsApp chat. UPAY walks you through a quick setup — link your USDC wallet address and add your Nigerian bank account details. Once that's done, you're ready to offramp anytime.",
  },
  {
    id: "banks",
    question: "Which Nigerian banks are supported?",
    answer:
      "All of them. GTBank, Access, UBA, First Bank, Zenith, Kuda, OPay, Moniepoint, Palmpay, FCMB, Fidelity — every licensed bank and fintech with a valid Nigerian account number. If it has an account number, UPAY can credit it.",
  },
  {
    id: "lost-phone",
    question: "What if I lose my phone?",
    answer:
      "Sign in from any other WhatsApp device and freeze your UPAY account in two taps — all activity pauses immediately. You can also use the \"Block account\" link in the footer of this page from a browser. Recovery is guided and requires identity verification.",
  },
];
