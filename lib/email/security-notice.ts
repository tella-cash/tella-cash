import { getGoogleLink } from "@/lib/google/oauth";
import { sendSecurityEmail, type SecurityEmailKind } from "./client";

/**
 * Email the account's linked Google address, if it has one.
 *
 * Every chat channel is rooted in the phone number, so a notice sent only to
 * chat reaches whoever holds the phone. For the changes an attacker holding
 * the chat would make — a PIN reset, a new channel, a queued transfer — this
 * is the notice that can reach the owner instead.
 *
 * Never throws: a missing link, a lookup failure or an unconfigured provider
 * must not change what happened to the account.
 */
export async function emailLinkedGoogle({
  userId,
  kind,
  subject,
  lines,
}: {
  userId: string;
  kind: SecurityEmailKind;
  subject: string;
  lines: string[];
}): Promise<boolean> {
  try {
    const link = await getGoogleLink(userId);
    if (!link) return false;
    return await sendSecurityEmail({ to: link.google_email, kind, subject, lines });
  } catch (err) {
    console.error("[email] security notice failed", { kind, err });
    return false;
  }
}
