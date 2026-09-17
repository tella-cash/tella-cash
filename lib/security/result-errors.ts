/**
 * Error messages for /security/result, looked up by code.
 *
 * The page used to print whatever text arrived in `?m=`, so anyone could put
 * their own sentence on tella's domain — "your wallet is locked, message
 * this number" — and send someone the link. React escaped it, so it was never
 * script injection; it was a phishing page we hosted for free. Only codes
 * travel in the URL now, and every word shown is one written here.
 */
export const RESULT_ERRORS = {
  cancelled: "Sign-in was cancelled.",
  incomplete: "Sign-in didn't complete. Try again.",
  state_expired: "That sign-in link expired. Start again.",
  google_unverified: "Couldn't verify that Google account. Try again.",
  no_admin_access: "That account doesn't have dashboard access.",
  google_not_linked:
    "That Google account isn't connected to a tella wallet. Ask tella on WhatsApp to link it first.",
  account_missing: "Couldn't find that account.",
  no_factor:
    "This account has no PIN or passkey set, so I can't safely unfreeze it from here. Message tella on WhatsApp and we'll sort it out.",
  link_expired: "That link expired. Ask tella on WhatsApp for a new one.",
  link_unconfirmed:
    "That link is invalid, expired, or hasn't been confirmed yet. Open the link tella sent you and confirm with your Face ID, fingerprint or PIN first.",
  google_taken: "That Google account is already connected to another tella wallet.",
  link_used: "That link has already been used.",
  link_paused:
    "Your PIN, passkeys or linked accounts changed recently, so new links are paused for now. Try again later.",
} as const;

export type ResultErrorCode = keyof typeof RESULT_ERRORS;

export function resultErrorMessage(code: string | undefined): string {
  if (code && Object.prototype.hasOwnProperty.call(RESULT_ERRORS, code)) {
    return RESULT_ERRORS[code as ResultErrorCode];
  }
  return "Something went wrong. Try again.";
}
