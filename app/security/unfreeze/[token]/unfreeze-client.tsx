"use client";

import { useState } from "react";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";

type Stage =
  | { kind: "form" }
  | { kind: "working" }
  | { kind: "done" }
  | { kind: "error"; message: string };

/**
 * Prove a factor that existed before the freeze.
 *
 * Passkey first where available: it is phishing-resistant and it proves
 * possession of a device the attacker would have had to steal separately. PIN
 * is the fallback, and is enough — it is still something an attacker who
 * arrived after the freeze cannot have.
 */
export function UnfreezeClient({
  token,
  hasPin,
  hasPasskey,
}: {
  token: string;
  hasPin: boolean;
  hasPasskey: boolean;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const [pin, setPin] = useState("");

  const canUsePasskey = hasPasskey && browserSupportsWebAuthn();

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/security/unfreeze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "That didn't work.");
    return data;
  }

  async function withPin() {
    if (pin.length < 4) {
      setStage({ kind: "error", message: "Enter your PIN." });
      return;
    }
    setStage({ kind: "working" });
    try {
      await post({ pin });
      setStage({ kind: "done" });
    } catch (err) {
      setStage({ kind: "error", message: (err as Error).message });
    }
  }

  async function withPasskey() {
    setStage({ kind: "working" });
    try {
      const options = await fetch("/api/security/unfreeze/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }).then((r) => r.json());

      const assertion = await startAuthentication({ optionsJSON: options });
      await post({ assertion });
      setStage({ kind: "done" });
    } catch (err) {
      setStage({ kind: "error", message: (err as Error).message });
    }
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-ink-200/70 bg-surface-0 shadow-card">
      <div className="px-7 pt-8 pb-2">
        <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink-400">
          Account recovery
        </div>
        <h1 className="mt-4 font-display text-3xl text-ink-900">Lift the freeze</h1>
      </div>

      <div className="space-y-4 px-7 pb-7 pt-4">
        {stage.kind === "done" ? (
          <>
            <p className="text-sm leading-relaxed text-ink-900">
              ✅ Your account is active again. You can send money as normal.
            </p>
            <p className="text-sm leading-relaxed text-ink-500">
              Head back to WhatsApp to carry on.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-ink-500">
              Google confirmed who you are. One more step: confirm with
              something you set up before the freeze.
            </p>

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
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Your PIN"
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
                This account has no PIN or passkey set, so it can&apos;t be
                unfrozen from here. Message tella on WhatsApp.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
