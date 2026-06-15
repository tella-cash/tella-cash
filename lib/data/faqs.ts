export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export const FAQS: FaqItem[] = [
  {
    id: "what-is-tella",
    question: "What exactly is tella?",
    answer:
      "tella is a messaging-based payment interface that lives inside WhatsApp. You hold and send USDC right from a chat, and when you want to spend locally, you cash out to your own Nigerian bank account. WhatsApp is just the interface — tella's platform does the work and settles on Arc. No separate app, no dashboard, just send a message and confirm.",
  },
  {
    id: "what-is-usdc",
    question: "What is USDC?",
    answer:
      "USDC is a dollar-pegged stablecoin — one USDC is always worth one US dollar. If you earn, receive, or hold USDC and want its value in your Nigerian bank account for everyday spending, tella makes it as simple as sending a WhatsApp message.",
  },
  {
    id: "how-it-works",
    question: "How does cashing out work?",
    answer:
      "Tell tella how much you'd like to cash out. You see a clear rate upfront, you confirm, and the value lands in your registered Nigerian bank account — usually within seconds. WhatsApp carries the conversation; tella's platform does the work and settles on Arc.",
  },
  {
    id: "rates",
    question: "What rate do I get?",
    answer:
      "tella shows you a clear rate before you confirm — no hidden fees, no markups buried in a surprise number. The rate shown when you confirm is the rate you get. You can also ask tella \"what's the rate?\" any time to check before you commit.",
  },
  {
    id: "settlement",
    question: "How fast does a payout arrive?",
    answer:
      "Usually within seconds. tella settles transactions on Arc — the stablecoin network built by Circle for near-instant finality — and the credit reaches your bank right away. Most cash-outs land before you can put your phone down.",
  },
  {
    id: "getting-started",
    question: "How do I get started?",
    answer:
      "Tap any \"Try tella\" button on this page to open a WhatsApp chat. tella walks you through a quick setup — connect your USDC wallet and add your Nigerian bank account details. Once that's done, you're ready to send and get paid out anytime.",
  },
  {
    id: "banks",
    question: "Which Nigerian banks are supported?",
    answer:
      "All of them. GTBank, Access, UBA, First Bank, Zenith, Kuda, OPay, Moniepoint, Palmpay, FCMB, Fidelity — every licensed bank and fintech with a valid Nigerian account number. If it has an account number, tella can credit it.",
  },
  {
    id: "lost-phone",
    question: "What if I lose my phone?",
    answer:
      "Sign in from any other WhatsApp device and freeze your tella account in two taps — all activity pauses immediately. You can also use the \"Block account\" link in the footer of this page from a browser. Recovery is guided and requires identity verification.",
  },
];
