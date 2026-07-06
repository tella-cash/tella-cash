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
      "tella is a messaging-based payment interface that lives inside WhatsApp. You hold, send, and receive USDC - a dollar-pegged stablecoin - right from a chat. No separate app, no dashboard, no learning curve. Just send a message and confirm.",
  },
  {
    id: "what-is-usdc",
    question: "What is USDC?",
    answer:
      "USDC is a stablecoin pegged to the US dollar - one USDC is always worth one dollar. tella lets you hold, send, and receive it as easily as sending a WhatsApp message.",
  },
  {
    id: "how-it-works",
    question: "How does it work?",
    answer:
      "Tell tella what you want to do in plain language. You see a clear summary before anything happens, you confirm, and tella's platform settles the transaction on Arc - usually within seconds. WhatsApp carries the conversation; the platform does the work behind the scenes.",
  },
  {
    id: "fees",
    question: "Are there any fees?",
    answer:
      "tella shows any applicable fee before you confirm - no hidden charges, no surprises. The amount you see when you confirm is the amount that applies. You can ask tella about fees any time before you commit.",
  },
  {
    id: "settlement",
    question: "How fast is it?",
    answer:
      "Usually within seconds. tella settles on Arc - the stablecoin network built by Circle for near-instant finality. Most transactions complete before you can put your phone down.",
  },
  {
    id: "getting-started",
    question: "How do I get started?",
    answer:
      "Tap any \"Try tella\" button on this page to open a WhatsApp chat. tella walks you through a quick setup, and you're ready to send and receive in minutes.",
  },
  {
    id: "no-app",
    question: "Do I need to download an app?",
    answer:
      "No. tella runs entirely inside WhatsApp - the app you already use every day. Nothing new to install, no extra password to remember, and no dashboard to learn.",
  },
  {
    id: "lost-phone",
    question: "What if I lose my phone?",
    answer:
      "Sign in from any other WhatsApp device and freeze your tella account in two taps - all activity pauses immediately. You can also use the \"Block account\" link in the footer of this page from a browser. Recovery is guided and requires identity verification.",
  },
];
