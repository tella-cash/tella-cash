export interface SecurityCard {
  id: string;
  title: string;
  body: string;
  illustration: "passcode" | "certified" | "biometric";
}

export const SECURITY_CARDS: SecurityCard[] = [
  {
    id: "passcode",
    title: "A PIN on every payment",
    body:
      "Set a PIN during onboarding and decide when it's required — every transaction, only above a threshold, or for new bank accounts only. Nothing moves without your sign-off.",
    illustration: "passcode",
  },
  {
    id: "certified",
    title: "Settled on Arc, encrypted, verifiable",
    body:
      "Your payments settle on Arc — a network with near-zero second finality and independently verifiable transactions. The WhatsApp layer uses the same end-to-end encryption that secures every other message you send.",
    illustration: "certified",
  },
  {
    id: "biometric",
    title: "Biometric lock on the chat itself",
    body:
      "Hide your tella thread inside WhatsApp's locked chats folder — face or fingerprint required to even open it. Security down to the conversation level, not just the transaction.",
    illustration: "biometric",
  },
];
