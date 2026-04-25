/**
 * FAQ items for the home page accordion.
 *
 * Each item is keyed by `id` so the accordion can be controlled / linked
 * to from elsewhere (e.g. anchor URLs like #faq-security).
 */

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export const FAQS: FaqItem[] = [
  {
    id: "what-is-pago",
    question: "What exactly is Pago?",
    answer:
      "Pago is an AI money companion that lives inside WhatsApp. You chat with it the same way you'd chat with a friend — type a message, send a voice note, or snap a photo of a bill — and it handles the financial task for you, from sending money to breaking down your spending.",
  },
  {
    id: "how-it-works",
    question: "How does it actually work?",
    answer:
      "Under the hood, Pago uses an AI model that understands natural language, voice, and images. You describe what you want (\"send 5k to my landlord\", \"how much did I spend on transport last week?\") and it figures out the rest. The more you use it, the better it understands your patterns and shortcuts.",
  },
  {
    id: "security",
    question: "Is my money and data safe?",
    answer:
      "Security is non-negotiable. Pago runs on end-to-end encrypted messaging, and every payment requires a PIN you set during onboarding. We follow industry-standard data protection practices, and our infrastructure is independently audited. None of your conversations are used to train external models.",
  },
  {
    id: "getting-started",
    question: "How do I get started?",
    answer:
      "Tap any \"Try Pago\" button on this page and it'll open a WhatsApp chat. The first time you message, Pago walks you through a quick three-step setup — verify your number, link a wallet, and choose a PIN. From there you're ready to send, request, or ask questions.",
  },
  {
    id: "misunderstands",
    question: "What if Pago misunderstands me?",
    answer:
      "If something is unclear, Pago will ask a clarifying question instead of guessing. You can also rephrase, switch to voice, or send a screenshot. Every transaction always shows a confirmation step before any money moves, so misunderstandings can never become accidental payments.",
  },
  {
    id: "lost-phone",
    question: "What happens if I lose my phone?",
    answer:
      "Open Pago from any other WhatsApp device and freeze your account in two taps — payments pause immediately. You can also use the \"Block account\" link in the footer of this page to do it from a browser. Recovery is guided and requires identity verification.",
  },
  {
    id: "languages",
    question: "Does it support voice and other languages?",
    answer:
      "Yes — voice notes work the same as text, and Pago understands several major languages including Pidgin, Yoruba, and Swahili in addition to English. Speak however feels natural and it'll respond in kind.",
  },
];
