"use client";

import { useState } from "react";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";

type Stage =
  | { kind: "form" }
  | { kind: "working" }
  | { kind: "ready"; next: string }
  | { kind: "error"; message: string };

const COPY = {
  telegram: {
    heading: "Connect Telegram",
    intro: "Confirm it's you before this Telegram account gets access to your wallet.",
    cta: "Open Telegram",
    after: "Tap below, then press Start in Telegram to finish.",
  },
  google: {
    heading: "Connect Google",
    intro: "Confirm it's you before a Google account is connected to your wallet.",
    cta: "Continue with Google",
    after: "Sign in with the Google account you want to connect.",
  },
} as const;

/**
 * Prove the account's PIN or passkey, then hand over the link.
 *
 * The next URL only exists after the server has checked the factor, so there
 * is nothing on this page an attacker holding the chat can skip past.
 */
export function LinkClient({
  token,
  kind,
  hasPin,
  hasPasskey,
}: {
  token: string;
  kind: "telegram" | "google";
  hasPin: boolean;
  hasPasskey: boolean;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const [pin, setPin] = useState("");
  const copy = COPY[kind];

  const canUsePasskey = hasPasskey && browserSupportsWebAuthn();

  async function authorize(body: Record<string, unknown>) {
    const res = await fetch("/api/security/link/authorize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data.next !== "string") {
      throw new Error(data.error ?? "That didn't work.");
    }
    setStage({ kind: "ready", next: data.next });
  }

  async function withPin() {
    if (pin.length < 4) {
      setStage({ kind: "error", message: "Enter your PIN." });
      return;
    }
    setStage({ kind: "working" });
    try {
      await authorize({ pin });
    } catch (err) {
      setStage({ kind: "error", message: (err as Error).message });
    }
  }

  async function withPasskey() {
    setStage({ kind: "working" });
    try {
      const res = await fetch("/api/security/link/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const options = await res.json();
      if (!res.ok) throw new Error(options.error ?? "That link is invalid or expired.");

      const assertion = await startAuthentication({ optionsJSON: options });
      await authorize({ assertion });
    } catch (err) {
      const message =
        err instanceof Error && err.name === "NotAllowedError"
          ? "That was cancelled or timed out. Try again, or use your PIN."
          : (err as Error).message;
      setStage({ kind: "error", message });
    }
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-ink-200/70 bg-surface-0 shadow-card">
      <div className="px-7 pt-8 pb-2">
        <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink-400">
          Account security
        </div>
        <h1 className="mt-4 font-display text-3xl text-ink-900">{copy.heading}</h1>
      </div>

      <div className="space-y-4 px-7 pb-7 pt-4">
        {stage.kind === "ready" ? (
          <>
            <p className="text-sm leading-relaxed text-ink-900">Confirmed. {copy.after}</p>
            <a
              href={stage.next}
              className="block w-full rounded-2xl bg-accent-500 px-6 py-4 text-center text-base font-medium text-white transition-all hover:bg-accent-600 active:scale-[0.98]"
            >
              {copy.cta}
            </a>
            <p className="text-xs leading-relaxed text-ink-400">
              For the next 48 hours, sends from your wallet wait 24 hours before they go out.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-ink-500">{copy.intro}</p>

            {stage.kind === "error" && (
              <p className="text-sm text-red-600" role="alert">
                {stage.message}
              </p>
            )}

            {canUsePasskey && (
              <button
                onClick={withPasskey}
                disabled={stage.kind === "working"}
                className="w-full rounded-2xl bg-accent-500 px-6 py-4 text-base font-medium text-white transition-all hover:bg-accent-600 active:scale-[0.98] disabled:opacity-60"
              >
                Confirm with Face ID or fingerprint
              </button>
            )}

            {hasPin && (
              <div className="space-y-2">
                <label htmlFor="link-pin" className="block text-sm font-medium text-ink-900">
                  Your PIN
                </label>
                <input
                  id="link-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  className="w-full rounded-2xl border border-ink-200 bg-surface-50 px-4 py-3.5 text-center text-lg tracking-[0.3em] text-ink-900 outline-none focus:border-accent-500"
                />
                <button
                  onClick={withPin}
                  disabled={stage.kind === "working"}
                  className="w-full rounded-2xl border border-ink-200 px-6 py-3.5 text-sm font-medium text-ink-900 transition-colors hover:bg-surface-50 disabled:opacity-60"
                >
                  {stage.kind === "working" ? "Checking…" : "Confirm with PIN"}
                </button>
              </div>
            )}

            {!hasPin && !hasPasskey && (
              <p className="text-sm leading-relaxed text-ink-500">
                This account has no PIN or passkey yet. Start a send in the chat to set one up,
                then ask for a new link.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
