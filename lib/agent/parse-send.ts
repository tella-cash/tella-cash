// Structured-send shape produced by mapDecodedSend() (lib/agent/map-decoded-send.ts)
// from a sendam-ai /decode result. Intent parsing itself now lives in
// sendam-ai — this file only keeps the shape both sides agree on.
export interface ParsedSendIntent {
  amount: string;
  token: "USDC";
  recipient:
    | { kind: "phone"; whatsappNumber: string }
    | { kind: "address"; address: string }
    | { kind: "label"; label: string };
}