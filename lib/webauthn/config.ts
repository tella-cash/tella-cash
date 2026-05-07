/**
 * Reads WebAuthn relying-party configuration from env.
 *
 * `rpID` MUST be the bare hostname (no protocol, no port). Credentials are
 * bound to this value — change it and every existing credential becomes
 * useless. Pin it to the prod domain before any real users register.
 *
 * `origin` MUST match the page origin where the ceremony runs, including
 * protocol. WebAuthn rejects mismatches.
 */
export interface WebAuthnConfig {
  rpName: string;
  rpID: string;
  origin: string;
  appBaseUrl: string;
}

export function getWebAuthnConfig(): WebAuthnConfig {
  const rpName = process.env.WEBAUTHN_RP_NAME ?? "UPay";
  const rpID = process.env.WEBAUTHN_RP_ID;
  const origin = process.env.WEBAUTHN_ORIGIN;
  const appBaseUrl = process.env.APP_BASE_URL ?? origin;

  if (!rpID || !origin || !appBaseUrl) {
    throw new Error(
      "Missing WEBAUTHN_RP_ID, WEBAUTHN_ORIGIN, or APP_BASE_URL env vars",
    );
  }

  return { rpName, rpID, origin, appBaseUrl };
}

/**
 * Build the user-facing confirm URL embedded in the WhatsApp message.
 * Token is the pending action's UUID — UUIDv4 has 122 bits of entropy
 * which is sufficient for an unguessable single-use link.
 */
export function buildConfirmUrl(token: string): string {
  const { appBaseUrl } = getWebAuthnConfig();
  return `${appBaseUrl.replace(/\/$/, "")}/confirm/${token}`;
}
