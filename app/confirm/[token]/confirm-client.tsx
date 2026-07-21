"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  | { kind: "working"; label: string; phase: "auth" | "sending" }
  | { kind: "success"; reference: string }
  | { kind: "error"; message: string };

const EASE = [0.16, 1, 0.3, 1] as const;

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
        setStage({ kind: "working", label: "Waiting for confirmation…", phase: "auth" });
        const options = await postJson<PublicKeyCredentialRequestOptionsJSON>(
          "/api/confirm/webauthn/authenticate/options",
          { token },
        );
        const assertion = await startAuthentication({ optionsJSON: options });
        setStage({ kind: "working", label: "Sending…", phase: "sending" });
        const data = await postJson(
          "/api/confirm/webauthn/authenticate/verify",
          { token, response: assertion },
        );
        setStage({ kind: "success", reference: reference(data) });
      } else {
        setStage({
          kind: "working",
          label: "Setting up Face ID / fingerprint…",
          phase: "auth",
        });
        const options = await postJson<PublicKeyCredentialCreationOptionsJSON>(
          "/api/confirm/webauthn/register/options",
          { token },
        );
        const attestation = await startRegistration({ optionsJSON: options });
        setStage({ kind: "working", label: "Sending…", phase: "sending" });
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
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="overflow-hidden rounded-[28px] border border-ink-200/70 bg-surface-0 shadow-card"
    >
      {/* Amount + recipient */}
      <div className="px-7 pt-8 pb-7">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-ink-400">
          <ShieldIcon className="h-3.5 w-3.5 text-accent-500" />
          Confirm send
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
          className="mt-5 flex items-end gap-2"
        >
          <span className="font-sans text-[64px] font-semibold leading-[0.85] tabular-nums text-ink-900">
            {summary.amount}
          </span>
          <span className="mb-1.5 font-works text-xl text-ink-400">
            {summary.token}
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25, ease: EASE }}
          className="mt-6 flex items-center gap-3 rounded-2xl bg-surface-100/70 px-4 py-3"
        >
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-500 text-sm font-semibold text-white">
            <Avatar label={summary.recipientLabel} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-ink-400">
              To
            </p>
            <p className="truncate font-medium text-ink-900">
              {summary.recipientLabel}
            </p>
          </div>
        </motion.div>
      </div>

      {/* Action area */}
      <div className="border-t border-ink-200/70 bg-surface-50/60 px-7 py-7">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={effectiveStage.kind}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            {effectiveStage.kind === "working" && (
              <WorkingView label={effectiveStage.label} phase={effectiveStage.phase} />
            )}

            {effectiveStage.kind === "success" && (
              <SuccessView
                reference={effectiveStage.reference}
                returnUrl={returnUrl}
              />
            )}

            {effectiveStage.kind === "error" && (
              <ErrorView message={effectiveStage.message} onRetry={goHome} />
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
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
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
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-ink-500">
        {hasPasskey
          ? "Authorize this send with Face ID, your fingerprint, or your device passkey."
          : "Authorize with Face ID or your fingerprint. Set it up once — it then works across your devices."}
      </p>

      <button
        onClick={() => {
          setClicked(true);
          onBiometric();
        }}
        disabled={clicked}
        className="group flex w-full items-center justify-center gap-2.5 rounded-2xl bg-accent-500 px-6 py-4 text-base font-medium text-white shadow-accent transition-all hover:bg-accent-600 active:scale-[0.98] disabled:opacity-60"
      >
        <FingerprintIcon className="h-5 w-5" />
        {hasPasskey ? "Confirm with biometrics" : "Set up & confirm"}
      </button>

      <button
        onClick={onUsePin}
        disabled={clicked}
        className="w-full rounded-2xl px-6 py-3 text-sm font-medium text-ink-500 transition-colors hover:text-ink-900 disabled:opacity-60"
      >
        Use a PIN instead
      </button>

      <SecurityNote />
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
  const [shake, setShake] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const busyRef = useRef(false);
  const isSetup = mode === "setup";

  // Client-side-only validation (regex shape, setup mismatch) never needs a
  // server round trip — shaking the input in place keeps the user right
  // where they are instead of bouncing them out to a full error stage.
  // Server-rejected PINs (wrong PIN on verify) still go through the real
  // `error` stage below, since those genuinely need a fresh attempt.
  function rejectInPlace(message: string) {
    setValidationMessage(message);
    setShake(true);
    window.setTimeout(() => setShake(false), 400);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    if (!/^\d{4,8}$/.test(pin)) {
      rejectInPlace("PIN must be 4–8 digits.");
      return;
    }
    if (isSetup && pin !== pin2) {
      rejectInPlace("PINs don't match.");
      return;
    }
    setValidationMessage(null);
    busyRef.current = true;
    setBusy(true);
    try {
      if (isSetup) {
        onStageChange({ kind: "working", label: "Saving PIN…", phase: "auth" });
        const setupRes = await fetch("/api/confirm/pin/setup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, pin }),
        });
        if (!setupRes.ok) throw new Error(await readError(setupRes));
      }
      onStageChange({ kind: "working", label: "Sending…", phase: "sending" });
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
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm leading-relaxed text-ink-500">
        {isSetup
          ? "Set a 4–8 digit PIN. You'll use it to confirm sends going forward."
          : "Enter your PIN to authorize this send."}
      </p>
      <motion.div
        animate={shake ? { x: [0, -8, 8, -8, 8, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-2"
      >
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          maxLength={8}
          disabled={busy}
          className="w-full rounded-2xl border border-ink-200 bg-surface-0 px-4 py-3.5 text-center text-2xl tracking-[0.3em] text-ink-900 outline-none transition focus:border-accent-500 focus:ring-4 focus:ring-accent-100 disabled:opacity-60"
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
            className="w-full rounded-2xl border border-ink-200 bg-surface-0 px-4 py-3.5 text-center text-2xl tracking-[0.3em] text-ink-900 outline-none transition focus:border-accent-500 focus:ring-4 focus:ring-accent-100 disabled:opacity-60"
            placeholder="Re-enter"
          />
        )}
        {validationMessage && (
          <p className="text-center text-sm text-red-500">{validationMessage}</p>
        )}
      </motion.div>
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-2xl bg-accent-500 px-6 py-4 text-base font-medium text-white shadow-accent transition-all hover:bg-accent-600 active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? "Working…" : isSetup ? "Save PIN & send" : "Confirm send"}
      </button>
      {onUseBiometric && !busy && (
        <button
          type="button"
          onClick={onUseBiometric}
          className="flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
        >
          <FingerprintIcon className="h-4 w-4" />
          Use Face ID / fingerprint instead
        </button>
      )}
      <SecurityNote />
    </form>
  );
}

function WorkingView({
  label,
  phase,
}: {
  label: string;
  phase: "auth" | "sending";
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative grid h-8 w-8 place-items-center">
            <Spinner />
            {phase === "auth" ? (
              <FingerprintIcon className="absolute h-3.5 w-3.5 text-accent-500" />
            ) : (
              <ArrowIcon className="absolute h-3 w-3 text-accent-500" />
            )}
          </div>
          <p className="text-sm text-ink-500">{label}</p>
        </motion.div>
      </AnimatePresence>
    </div>
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
    const t = window.setTimeout(() => {
      window.location.href = returnUrl;
    }, 1600);
    return () => window.clearTimeout(t);
  }, [returnUrl]);

  return (
    <div className="py-2 text-center">
      <motion.div
        initial={{ scale: 0, rotate: -25 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent-500 text-white shadow-accent"
      >
        <CheckIcon className="h-7 w-7" />
      </motion.div>
      <p className="mt-6 font-display text-3xl text-ink-900">Sent</p>
      <p className="mt-1 text-sm text-ink-500">
        Reference{" "}
        <code className="font-mono text-ink-700">{reference}</code>
      </p>
      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-ink-400">
        <Spinner small />
        Taking you back to WhatsApp…
      </div>
      <a
        href={returnUrl}
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-ink-900 px-6 py-3 text-sm font-medium text-surface-50 transition-transform active:scale-[0.98]"
      >
        Back to WhatsApp
        <ArrowIcon className="h-4 w-4" />
      </a>
      <p className="mt-4 text-xs text-ink-400">
        Your receipt is in the chat. You can close this tab.
      </p>
    </div>
  );
}

function ErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="py-2 text-center">
      <motion.div
        initial={{ scale: 0, rotate: 15 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-50 text-xl text-red-500"
      >
        !
      </motion.div>
      <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-ink-700">
        {message}
      </p>
      <button
        onClick={onRetry}
        className="mt-6 w-full rounded-2xl border border-ink-200 px-6 py-3.5 text-sm font-medium text-ink-900 transition-colors hover:bg-surface-100 active:scale-[0.98]"
      >
        Try again
      </button>
    </div>
  );
}

function SecurityNote() {
  return (
    <p className="flex items-center justify-center gap-1.5 pt-1 text-center text-xs text-ink-400">
      <LockIcon className="h-3 w-3" />
      Encrypted · tella never sees your biometrics
    </p>
  );
}

/* ---------- small presentational helpers ---------- */

function Avatar({ label }: { label: string }) {
  const isAddress = label.startsWith("0x") || label.includes("…");
  if (isAddress) return <WalletIcon className="h-4 w-4" />;
  const ch = label.trim().charAt(0).toUpperCase();
  return <span>{ch || "·"}</span>;
}

function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      className={
        small
          ? "h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-300 border-t-accent-500"
          : "h-8 w-8 animate-spin rounded-full border-[3px] border-ink-200 border-t-accent-500"
      }
    />
  );
}

/* ---------- icons (currentColor for theming) ---------- */

function FingerprintIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 10a2 2 0 0 1 2 2c0 3-.4 5-1 6.5" />
      <path d="M8.5 8.5A5 5 0 0 1 17 12c0 2.5-.3 4.5-.8 6" />
      <path d="M5.5 11a6.5 6.5 0 0 1 13 .5c0 2-.2 3.7-.6 5.2" />
      <path d="M9 12a3 3 0 0 1 6 0c0 3.5-.5 6-1.2 8" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Zm-1 13-3-3 1.4-1.4L11 12.2l4.6-4.6L17 9l-6 6Z" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17 8h-1V6.5a4 4 0 0 0-8 0V8H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Zm-7-1.5a2 2 0 0 1 4 0V8h-4V6.5Z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14m0 0-6-6m6 6-6 6" />
    </svg>
  );
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2H3Zm0 2h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Zm13 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
    </svg>
  );
}

/* ---------- network helpers ---------- */

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
