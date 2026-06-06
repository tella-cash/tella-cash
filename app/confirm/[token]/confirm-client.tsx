"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

// Capability is static for the page's lifetime, so there's nothing to
// subscribe to. useSyncExternalStore reads it post-hydration without a
// setState-in-effect, and the server snapshot (assume supported) keeps the
// first client render in sync to avoid a hydration mismatch.
const NOOP_SUBSCRIBE = () => () => {};
function useWebAuthnReady(): boolean {
  return useSyncExternalStore(
    NOOP_SUBSCRIBE,
    () => browserSupportsWebAuthn(),
    () => true,
  );
}

interface SendSummary {
  amount: string;
  token: string;
  recipientLabel: string;
}

type Stage =
  | { kind: "choose" }
  | { kind: "pin"; mode: "setup" | "verify" }
  | { kind: "working"; label: string }
  | { kind: "success"; reference: string }
  | { kind: "error"; message: string };

/**
 * ConfirmClient
 *
 * The interactive surface of the confirmation page. Biometric (WebAuthn /
 * synced passkeys) is the primary path, with a PIN fallback for devices or
 * browsers that can't do WebAuthn. Every path ends in the same place: the
 * verify route executes the send, DMs the receipt, and we bounce the user
 * straight back to WhatsApp.
 */
export function ConfirmClient({
  token,
  summary,
  hasPin,
  hasPasskey,
  returnUrl,
}: {
  token: string;
  summary: SendSummary;
  hasPin: boolean;
  hasPasskey: boolean;
  returnUrl: string;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "choose" });
  const webauthnReady = useWebAuthnReady();
  // Synchronous re-entry guard so a fast double-tap can't kick off two
  // ceremonies (and two send attempts) before the UI swaps to "working".
  const busyRef = useRef(false);

  // If the browser can't do WebAuthn, the chooser collapses straight to the
  // PIN form rather than offering a biometric button that would only fail.
  const effectiveStage: Stage =
    stage.kind === "choose" && !webauthnReady
      ? { kind: "pin", mode: hasPin ? "verify" : "setup" }
      : stage;

  function goHome() {
    busyRef.current = false;
    setStage(
      webauthnReady
        ? { kind: "choose" }
        : { kind: "pin", mode: hasPin ? "verify" : "setup" },
    );
  }

  async function runBiometric() {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      if (hasPasskey) {
        setStage({ kind: "working", label: "Waiting for confirmation…" });
        const options = await postJson<PublicKeyCredentialRequestOptionsJSON>(
          "/api/confirm/webauthn/authenticate/options",
          { token },
        );
        const assertion = await startAuthentication({ optionsJSON: options });
        setStage({ kind: "working", label: "Sending…" });
        const data = await postJson(
          "/api/confirm/webauthn/authenticate/verify",
          { token, response: assertion },
        );
        setStage({ kind: "success", reference: reference(data) });
      } else {
        setStage({
          kind: "working",
          label: "Setting up Face ID / fingerprint…",
        });
        const options = await postJson<PublicKeyCredentialCreationOptionsJSON>(
          "/api/confirm/webauthn/register/options",
          { token },
        );
        const attestation = await startRegistration({ optionsJSON: options });
        setStage({ kind: "working", label: "Sending…" });
        const data = await postJson("/api/confirm/webauthn/register/verify", {
          token,
          response: attestation,
        });
        setStage({ kind: "success", reference: reference(data) });
      }
    } catch (err) {
      busyRef.current = false;
      setStage({ kind: "error", message: humanizeWebAuthnError(err) });
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-12">
      <header className="mt-4">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-400">
          tella
        </p>
        <h1 className="mt-2 font-display text-3xl leading-tight text-ink-900">
          Confirm send
        </h1>
      </header>

      <section className="mt-8 rounded-2xl border border-ink-200 bg-surface-50/60 p-6">
        <p className="text-xs uppercase tracking-wider text-ink-400">Sending</p>
        <p className="mt-2 font-display text-4xl leading-none text-ink-900">
          {summary.amount} {summary.token}
        </p>
        <p className="mt-4 text-sm text-ink-500">
          to <span className="text-ink-900">{summary.recipientLabel}</span>
        </p>
      </section>

      <section className="mt-8 flex-1">
        {effectiveStage.kind === "working" && (
          <div className="flex items-center gap-3 text-sm text-ink-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-300 border-t-ink-900" />
            {effectiveStage.label}
          </div>
        )}

        {effectiveStage.kind === "success" && (
          <SuccessView
            reference={effectiveStage.reference}
            returnUrl={returnUrl}
          />
        )}

        {effectiveStage.kind === "error" && (
          <div>
            <p className="text-sm text-red-600">{effectiveStage.message}</p>
            <button
              onClick={goHome}
              className="mt-4 text-sm underline underline-offset-4"
            >
              Try again
            </button>
          </div>
        )}

        {effectiveStage.kind === "choose" && (
          <ChooseView
            hasPasskey={hasPasskey}
            onBiometric={runBiometric}
            onUsePin={() =>
              setStage({ kind: "pin", mode: hasPin ? "verify" : "setup" })
            }
          />
        )}

        {effectiveStage.kind === "pin" && (
          <PinForm
            token={token}
            mode={effectiveStage.mode}
            onStageChange={setStage}
            onUseBiometric={
              webauthnReady ? () => setStage({ kind: "choose" }) : undefined
            }
          />
        )}
      </section>
    </main>
  );
}

function ChooseView({
  hasPasskey,
  onBiometric,
  onUsePin,
}: {
  hasPasskey: boolean;
  onBiometric: () => void;
  onUsePin: () => void;
}) {
  // Disable on first click so the button can't be tapped twice before the
  // view transitions to the working state.
  const [clicked, setClicked] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-500">
        {hasPasskey
          ? "Confirm this send with Face ID, your fingerprint, or your device passkey."
          : "Confirm with Face ID or your fingerprint. You'll set this up once — it then works across your devices."}
      </p>
      <button
        onClick={() => {
          setClicked(true);
          onBiometric();
        }}
        disabled={clicked}
        className="w-full rounded-full bg-ink-900 px-6 py-4 text-base font-medium text-surface-50 transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        Confirm with Face ID / fingerprint
      </button>
      <button
        onClick={onUsePin}
        disabled={clicked}
        className="w-full text-center text-sm text-ink-500 underline underline-offset-4 disabled:opacity-60"
      >
        Use a PIN instead
      </button>
    </div>
  );
}

function PinForm({
  token,
  mode,
  onStageChange,
  onUseBiometric,
}: {
  token: string;
  mode: "setup" | "verify";
  onStageChange: (next: Stage) => void;
  onUseBiometric?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const isSetup = mode === "setup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    if (!/^\d{4,8}$/.test(pin)) {
      onStageChange({ kind: "error", message: "PIN must be 4–8 digits." });
      return;
    }
    if (isSetup && pin !== pin2) {
      onStageChange({ kind: "error", message: "PINs don't match." });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      if (isSetup) {
        onStageChange({ kind: "working", label: "Saving PIN…" });
        const setupRes = await fetch("/api/confirm/pin/setup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, pin }),
        });
        if (!setupRes.ok) throw new Error(await readError(setupRes));
      }
      onStageChange({ kind: "working", label: "Sending…" });
      const verifyRes = await fetch("/api/confirm/pin/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, pin }),
      });
      if (!verifyRes.ok) throw new Error(await readError(verifyRes));
      const data = (await verifyRes.json()) as { transactionId: string };
      onStageChange({
        kind: "success",
        reference: data.transactionId.slice(0, 8),
      });
    } catch (err) {
      busyRef.current = false;
      setBusy(false);
      onStageChange({
        kind: "error",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-ink-500">
        {isSetup
          ? "Set a 4–8 digit PIN. You'll use this to confirm sends going forward."
          : "Enter your PIN to confirm."}
      </p>
      <input
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        maxLength={8}
        disabled={busy}
        className="w-full rounded-xl border border-ink-200 bg-surface-50 px-4 py-3 text-lg tracking-widest disabled:opacity-60"
        placeholder="••••"
        autoFocus
      />
      {isSetup && (
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          value={pin2}
          onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
          maxLength={8}
          disabled={busy}
          className="w-full rounded-xl border border-ink-200 bg-surface-50 px-4 py-3 text-lg tracking-widest disabled:opacity-60"
          placeholder="Re-enter PIN"
        />
      )}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-ink-900 px-6 py-4 text-base font-medium text-surface-50 transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? "Working…" : isSetup ? "Save PIN & send" : "Confirm send"}
      </button>
      {onUseBiometric && !busy && (
        <button
          type="button"
          onClick={onUseBiometric}
          className="w-full text-center text-sm text-ink-500 underline underline-offset-4"
        >
          Use Face ID / fingerprint instead
        </button>
      )}
    </form>
  );
}

function SuccessView({
  reference,
  returnUrl,
}: {
  reference: string;
  returnUrl: string;
}) {
  // Bounce back to WhatsApp automatically once the send is confirmed; the
  // button below is the manual fallback for browsers that block the
  // programmatic navigation (or desktop where the deep link is slower).
  useEffect(() => {
    const t = setTimeout(() => {
      window.location.href = returnUrl;
    }, 1500);
    return () => clearTimeout(t);
  }, [returnUrl]);

  return (
    <div className="text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent-50 text-2xl">
        ✓
      </div>
      <p className="mt-6 font-display text-2xl text-ink-900">Sent</p>
      <p className="mt-2 text-sm text-ink-500">
        Reference <code className="font-mono text-ink-900">{reference}</code>
      </p>
      <p className="mt-6 text-sm text-ink-500">Taking you back to WhatsApp…</p>
      <Link
        href={returnUrl}
        className="mt-4 inline-block rounded-full bg-ink-900 px-6 py-3 text-sm font-medium text-surface-50"
      >
        Back to WhatsApp ↗
      </Link>
      <p className="mt-4 text-xs text-ink-400">
        Receipt has been sent to your chat. You can close this tab.
      </p>
    </div>
  );
}

async function postJson<T = Record<string, unknown>>(
  url: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
}

function reference(data: Record<string, unknown>): string {
  return String(data.transactionId ?? "").slice(0, 8);
}

/** Turn raw WebAuthn/DOM errors into something a person can act on. */
function humanizeWebAuthnError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "NotAllowedError") {
      return "That was cancelled or timed out. Try again, or use your PIN.";
    }
    if (err.name === "InvalidStateError") {
      return "This device already has a passkey here — try confirming instead.";
    }
    return err.message || "Something went wrong.";
  }
  return "Something went wrong.";
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
