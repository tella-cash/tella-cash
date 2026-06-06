"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

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
 * verify route executes the send and DMs the receipt.
 */
export function ConfirmClient({
  token,
  summary,
  hasPin,
  hasPasskey,
}: {
  token: string;
  summary: SendSummary;
  hasPin: boolean;
  hasPasskey: boolean;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "choose" });
  const [webauthnReady, setWebauthnReady] = useState(true);

  // navigator isn't available during SSR, so feature-detect after mount.
  // If the browser can't do WebAuthn, skip the chooser and go to PIN.
  useEffect(() => {
    if (!browserSupportsWebAuthn()) {
      setWebauthnReady(false);
      setStage({ kind: "pin", mode: hasPin ? "verify" : "setup" });
    }
  }, [hasPin]);

  function goHome() {
    setStage(
      webauthnReady
        ? { kind: "choose" }
        : { kind: "pin", mode: hasPin ? "verify" : "setup" },
    );
  }

  async function runBiometric() {
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
        {stage.kind === "working" && (
          <p className="text-sm text-ink-500">{stage.label}</p>
        )}

        {stage.kind === "success" && <SuccessView reference={stage.reference} />}

        {stage.kind === "error" && (
          <div>
            <p className="text-sm text-red-600">{stage.message}</p>
            <button
              onClick={goHome}
              className="mt-4 text-sm underline underline-offset-4"
            >
              Try again
            </button>
          </div>
        )}

        {stage.kind === "choose" && (
          <ChooseView
            hasPasskey={hasPasskey}
            onBiometric={runBiometric}
            onUsePin={() =>
              setStage({ kind: "pin", mode: hasPin ? "verify" : "setup" })
            }
          />
        )}

        {stage.kind === "pin" && (
          <PinForm
            token={token}
            mode={stage.mode}
            onStageChange={setStage}
            onUseBiometric={webauthnReady ? () => setStage({ kind: "choose" }) : undefined}
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
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-500">
        {hasPasskey
          ? "Confirm this send with Face ID, your fingerprint, or your device passkey."
          : "Confirm with Face ID or your fingerprint. You'll set this up once — it then works across your devices."}
      </p>
      <button
        onClick={onBiometric}
        className="w-full rounded-full bg-ink-900 px-6 py-4 text-base font-medium text-surface-50 transition-transform active:scale-[0.98]"
      >
        Confirm with Face ID / fingerprint
      </button>
      <button
        onClick={onUsePin}
        className="w-full text-center text-sm text-ink-500 underline underline-offset-4"
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
  const isSetup = mode === "setup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(pin)) {
      onStageChange({ kind: "error", message: "PIN must be 4–8 digits." });
      return;
    }
    if (isSetup && pin !== pin2) {
      onStageChange({ kind: "error", message: "PINs don't match." });
      return;
    }
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
        className="w-full rounded-xl border border-ink-200 bg-surface-50 px-4 py-3 text-lg tracking-widest"
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
          className="w-full rounded-xl border border-ink-200 bg-surface-50 px-4 py-3 text-lg tracking-widest"
          placeholder="Re-enter PIN"
        />
      )}
      <button
        type="submit"
        className="w-full rounded-full bg-ink-900 px-6 py-4 text-base font-medium text-surface-50 transition-transform active:scale-[0.98]"
      >
        {isSetup ? "Save PIN & send" : "Confirm send"}
      </button>
      {onUseBiometric && (
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

function SuccessView({ reference }: { reference: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent-50 text-2xl">
        ✓
      </div>
      <p className="mt-6 font-display text-2xl text-ink-900">Sent</p>
      <p className="mt-2 text-sm text-ink-500">
        Reference{" "}
        <code className="font-mono text-ink-900">{reference}</code>
      </p>
      <Link
        href="whatsapp://send"
        className="mt-8 inline-block rounded-full bg-ink-900 px-6 py-3 text-sm font-medium text-surface-50"
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
