/**
 * WebAuthn relying-party config.
 *
 * The relying-party ID (rpID) is the domain a passkey is bound to; the
 * expected origin is the full URL the ceremony runs on. Both are derived
 * from APP_BASE_URL — the same origin the confirm page (and therefore the
 * browser ceremony) is served from — so the credential domain always
 * matches what the browser reports.
 *
 * There is deliberately no fallback. A missing APP_BASE_URL used to silently
 * yield rpID "localhost", which produces passkeys bound to the wrong relying
 * party — they register without complaint and then fail to authenticate
 * forever, with nothing in the logs to say why. Better to refuse to start
 * the ceremony at all.
 */
export interface RpConfig {
  rpName: string;
  rpID: string;
  origin: string;
}

export function getRpConfig(): RpConfig {
  const base = process.env.APP_BASE_URL;
  if (!base) {
    throw new Error(
      "Missing APP_BASE_URL — required to derive the WebAuthn relying-party ID",
    );
  }
  const url = new URL(base);
  return {
    rpName: "tella",
    rpID: url.hostname, // e.g. "www.tella.cash" or "localhost"
    origin: url.origin, // e.g. "https://www.tella.cash"
  };
}
