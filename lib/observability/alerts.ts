/**
 * Security-event alerting.
 *
 * The controls added across this remediation all fail closed and log — but a
 * log line nobody reads is not a control, it's a record written after the
 * fact. These are the events that mean someone is probing, and they need to
 * reach a person while it's happening:
 *
 *   - webhook signature failures: someone is POSTing forged notifications
 *   - auth lockouts: someone is grinding a PIN against a confirm link
 *   - ambiguous transfers: money whose fate is unknown, needs reconciling
 *
 * Delivery is a POST to ALERT_WEBHOOK_URL (Slack/Discord-compatible JSON).
 * With no URL configured this degrades to a structured console.error, which
 * is what platform log-drain alerting can match on — so the call sites are
 * correct either way and wiring up delivery is a config change, not a code
 * change.
 *
 * Never throws and never blocks: an alert failing must not take down the
 * request that raised it.
 */

export type AlertKind =
  | "webhook_signature_failed"
  | "auth_locked_out"
  | "transfer_unknown"
  | "wallet_provisioning_stuck"
  | "account_frozen"
  | "account_unfrozen"
  | "hold_notification_failed";

interface AlertPayload {
  kind: AlertKind;
  message: string;
  /** Must not contain PII — these go to a third-party chat channel. */
  context?: Record<string, string | number | boolean | null>;
  /**
   * Skip the per-kind suppression window.
   *
   * The window exists so a sustained attack produces one alert rather than a
   * flood that gets muted, which is right for events that repeat by the
   * hundred. It is wrong for events that are individually significant and
   * rare: every account freeze is a distinct person having a bad day, and
   * swallowing the second one because it landed within a minute of the first
   * loses the only signal anyone gets.
   */
  force?: boolean;
}

// Rate limiting so a sustained attack produces an alert, not a flood that
// gets muted. One per kind per window.
const MIN_INTERVAL_MS = 60_000;
const lastSent = new Map<AlertKind, number>();

export function raiseAlert(payload: AlertPayload): void {
  const now = Date.now();
  const previous = lastSent.get(payload.kind) ?? 0;
  const suppressed = !payload.force && now - previous < MIN_INTERVAL_MS;

  console.error(`[alert:${payload.kind}] ${payload.message}`, {
    ...payload.context,
    ...(suppressed ? { alertSuppressed: true } : {}),
  });

  if (suppressed) return;
  lastSent.set(payload.kind, now);

  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;

  // Deliberately not awaited. The caller is usually inside a request that
  // has already decided to reject — waiting on a chat webhook to answer
  // would add its latency to every rejection.
  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: `🚨 tella · ${payload.kind}\n${payload.message}`,
      context: payload.context,
    }),
  }).catch((err) => {
    console.error("[alert] delivery failed", { kind: payload.kind, err });
  });
}
