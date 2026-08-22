// Structured-send shape produced by mapDecodedSend() (lib/agent/map-decoded-send.ts)
// from a sendam-ai /decode result. Intent parsing itself now lives in
// sendam-ai — this file only keeps the shape both sides agree on.
export interface ParsedSendIntent {
  amount: string;
  token: "USDC";
  recipient:
    | { kind: "phone"; whatsappNumber: string }
    | { kind: "address"; address: string }
    | { kind: "label"; label: string }
    /**
     * Looked like a phone number and wasn't a valid one. Distinct from
     * `label` because the reply has to be different: telling someone
     * "I don't have a beneficiary called +23480123" when they typed a
     * number reports a decode problem as an address-book problem, and
     * sends them looking in the wrong place.
     */
    | { kind: "invalid_phone"; typed: string };
}