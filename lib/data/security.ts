/**
 * Security feature cards rendered in the security section grid.
 * Each card pairs a short headline with a one-paragraph description and
 * an illustration component reference.
 */

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
      "Set a PIN during onboarding and decide when it's required — every transaction, only above a threshold, or for new recipients only. You're always in control.",
    illustration: "passcode",
  },
  {
    id: "certified",
    title: "Certified, encrypted, audited",
    body:
      "Our infrastructure follows industry data protection standards and is audited annually. Your chats use the same end-to-end encryption that secures the rest of WhatsApp.",
    illustration: "certified",
  },
  {
    id: "biometric",
    title: "Biometric lock for the chat itself",
    body:
      "Hide your Pago thread inside WhatsApp's locked chats folder — face or fingerprint required to even open it. Privacy down to the conversation level.",
    illustration: "biometric",
  },
];
