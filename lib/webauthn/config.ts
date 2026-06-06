/**
 * WebAuthn relying-party config.
 *
 * The relying-party ID (rpID) is the domain a passkey is bound to; the
 * expected origin is the full URL the ceremony runs on. Both are derived
 * from APP_BASE_URL — the same origin the confirm page (and therefore the
 * browser ceremony) is served from — so the credential domain always
 * matches what the browser reports. Falls back to localhost for dev.
 */
export interface RpConfig {
  rpName: string;
  rpID: string;
  origin: string;
}

export function getRpConfig(): RpConfig {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const url = new URL(base);
  return {
    rpName: "tella",
    rpID: url.hostname, // e.g. "www.tella.cash" or "localhost"
    origin: url.origin, // e.g. "https://www.tella.cash"
  };
}
