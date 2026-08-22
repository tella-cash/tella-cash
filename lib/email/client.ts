/**
 * Security email.
 *
 * The point is not the medium, it is the recipient. Every other channel this
 * app has is rooted in the phone number: WhatsApp, Telegram, the SMS the SIM
 * carries. An attacker holding the SIM holds all of them. The linked Google
 * address is the one place a notice can land that they do not automatically
 * control, which is what makes it worth the dependency.
 *
 * Provider-agnostic on purpose: one POST shaped like Resend's API, which
 * Postmark and several others accept with only a URL change. Configure
 * EMAIL_API_URL, EMAIL_API_KEY and EMAIL_FROM, or leave them unset.
 *
 * Unset degrades to a structured console.error rather than throwing, exactly
 * as raiseAlert does with ALERT_WEBHOOK_URL: every call site stays correct
 * either way, wiring up delivery is a config change rather than a code
 * change, and a missing email provider never breaks a freeze.
 */

export type SecurityEmailKind =
  | "account_frozen"
  | "account_unfrozen"
  | "pin_reset"
  | "factor_added"
  | "channel_linked"
  | "google_linked"
  | "transfer_held";

interface SecurityEmail {
  to: string;
  kind: SecurityEmailKind;
  subject: string;
  lines: string[];
}

/**
 * Never throws and never blocks. A notification failing must not change what
 * happened to the account, and the caller is usually mid-way through
 * something more important.
 */
export async function sendSecurityEmail({
  to,
  kind,
  subject,
  lines,
}: SecurityEmail): Promise<boolean> {
  const url = process.env.EMAIL_API_URL;
  const key = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM;

  const body = [...lines, "", "— tella"].join("\n");

  if (!url || !key || !from) {
    // Structured so a log drain can alert on it, same reasoning as alerts.ts.
    console.error("[email] not configured, would have sent", { kind, subject });
    return false;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ from, to, subject, text: body }),
    });

    if (!res.ok) {
      console.error("[email] delivery failed", { kind, status: res.status });
      return false;
    }

    console.log("[email] sent", { kind });
    return true;
  } catch (err) {
    console.error("[email] delivery threw", { kind, err });
    return false;
  }
}
