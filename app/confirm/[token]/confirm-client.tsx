"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ReturnTarget } from "@/lib/messaging/return-link";
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
  /**
   * Authorized, above the hold threshold, executing in 24 hours.
   *
   * A separate stage rather than a variant of success, because it is neither
   * a success nor a failure and both of the other two would be a lie: the
   * money has not moved, and nothing went wrong. See lib/sends/tiers.ts.
   */
  | { kind: "queued"; message: string }
  | { kind: "error"; message: string };

/**
 * What a verify route said happened.
 *
 * The reason this exists: sendFailureStatus returns 202 for a held send —
 * "accepted, and it will happen" — and every caller here treated any 2xx as a
 * completed transfer. The PIN path then read `transactionId` off a body that
 * carries none and threw on `.slice`, so a user whose transfer was correctly
 * queued was shown "Something went wrong."; the passkey path did not throw and
 * showed them a success with the reference "undefined". The comment in
 * execute.ts already claimed this page "reads this as a success with a
 * different message" — it does now.
 */
type ConfirmOutcome =
  | { kind: "sent"; reference: string }
  | { kind: "queued"; message: string };

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
 * back to the chat they started in — see lib/messaging/return-link.ts.
 */
export function ConfirmClient({
  token,
  summary,
  hasPin,
  hasPasskey,
  returnTo,
}: {
  token: string;
  summary: SendSummary;
  hasPin: boolean;
  hasPasskey: boolean;
  returnTo: ReturnTarget;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "choose" });
  const webauthnReady = useWebAuthnReady();
  // Synchronous re-entry guard so a fast double-tap can't kick off two
  // ceremonies (and two send attempts) before the UI swaps to "working".
  const busyRef = useRef(false);

  // Biometric is offered when the user already has a passkey (authenticate),
  // or when they have no factor at all (first enrollment). It is NOT offered
  // to a PIN-only account: the register routes now refuse enrollment once a
  // factor exists, because a fresh passkey ceremony proves possession of the
  // link, not of the account. Adding a device goes through recovery instead.
  const canUseBiometric = hasPasskey || !hasPin;
  const biometricAvailable = webauthnReady && canUseBiometric;

  // The mirror of the rule above. Setting a PIN is only legitimate while the
  // account has no factor at all — the setup route refuses once a passkey
  // exists, for exactly the reason the register routes refuse once a PIN
  // does. So a passkey-only account has no PIN path here, and offering one
  // would render a form whose submit is guaranteed to 409.
  const canUsePin = hasPin || !hasPasskey;
  const pinStage: Stage = { kind: "pin", mode: hasPin ? "verify" : "setup" };

  // Where to land when biometric isn't on offer. Usually the PIN form; for a
  // passkey-only account on a browser that can't do WebAuthn there is no
  // path at all from here, so say so plainly and point at recovery rather
  // than dead-ending on a form.
  //
  // The "open it in your browser" line leads, because the most common way to
  // reach this state is not an old device: it is an in-app browser. Links
  // tapped inside WhatsApp and Telegram open in one, and several of those
  // cannot do WebAuthn at all — so the user is being told their passkey is
  // unusable while holding the exact phone that has it. Copying the link out
  // into Safari or Chrome fixes it in one step.
  const fallbackStage: Stage = canUsePin
    ? pinStage
    : {
        kind: "error",
        message:
          "This account confirms with a passkey, and this browser can't use one. If you tapped the link inside a chat app, open it in your phone's browser instead — that usually fixes it. Otherwise open it on the device where you set the passkey up, or reply \"reset\" in chat to set a new confirmation method.",
      };

  // If the browser can't do WebAuthn (or biometric isn't on offer), the
  // chooser collapses straight to that fallback rather than showing a button
  // that would only fail.
  const effectiveStage: Stage =
    stage.kind === "choose" && !biometricAvailable ? fallbackStage : stage;

  function goHome() {
    busyRef.current = false;
    setStage(biometricAvailable ? { kind: "choose" } : fallbackStage);
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
        const outcome = await postConfirm(
          "/api/confirm/webauthn/authenticate/verify",
          { token, response: assertion },
        );
        setStage(stageFor(outcome));
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
        const outcome = await postConfirm("/api/confirm/webauthn/register/verify", {
          token,
          response: attestation,
        });
        setStage(stageFor(outcome));
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
                returnTo={returnTo}
              />
            )}

            {effectiveStage.kind === "queued" && (
              <QueuedView message={effectiveStage.message} returnTo={returnTo} />
            )}

            {effectiveStage.kind === "error" && (
              <ErrorView message={effectiveStage.message} onRetry={goHome} />
            )}

            {effectiveStage.kind === "choose" && (
              <ChooseView
                hasPasskey={hasPasskey}
                canUsePin={canUsePin}
                onBiometric={runBiometric}
                onUsePin={() => setStage(pinStage)}
              />
            )}

            {effectiveStage.kind === "pin" && (
              <PinForm
                token={token}
                mode={effectiveStage.mode}
                onStageChange={setStage}
                onUseBiometric={
                  biometricAvailable
                    ? () => setStage({ kind: "choose" })
                    : undefined
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
  canUsePin,
  onBiometric,
  onUsePin,
}: {
  hasPasskey: boolean;
  /** False for a passkey-only account, where the PIN routes refuse. */
  canUsePin: boolean;
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

      {canUsePin && (
        <button
          onClick={onUsePin}
          disabled={clicked}
          className="w-full rounded-2xl px-6 py-3 text-sm font-medium text-ink-500 transition-colors hover:text-ink-900 disabled:opacity-60"
        >
          Use a PIN instead
        </button>
      )}

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

      // A lockout isn't a failure the user can retry their way out of, so
      // it doesn't belong on the error stage with its "try again" affordance.
      // Put them back on the PIN form with the wait time stated. Checked with
      // its own request rather than inside postConfirm because it is the one
      // outcome that returns the user to the form instead of leaving the flow.
      const verifyRes = await fetch("/api/confirm/pin/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, pin }),
      });
      if (verifyRes.status === 429) {
        onStageChange({ kind: "pin", mode: isSetup ? "setup" : "verify" });
        rejectInPlace(await readError(verifyRes));
        busyRef.current = false;
        setBusy(false);
        return;
      }
      if (!verifyRes.ok) throw new Error(await readError(verifyRes));

      onStageChange(stageFor(await readConfirmOutcome(verifyRes)));
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
      {/*
        The setup copy names BOTH things this one action does. Choosing a PIN
        here also authorizes the transfer on the screen above — the enrollment
        gesture doubles as the authorization, which is the whole reason a first
        send takes one step instead of two (see canEnrollFromConfirmLink). The
        old wording described only the durable half, "you'll use it going
        forward", so a first-time user pressed Save expecting to be asked again
        and instead moved money. The button already said "Save PIN & send";
        the sentence above it now agrees.
      */}
      <p className="text-sm leading-relaxed text-ink-500">
        {isSetup
          ? "Set a 4–8 digit PIN. This confirms the send above and becomes how you approve sends from now on."
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
  returnTo,
}: {
  reference: string;
  returnTo: ReturnTarget;
}) {
  const { url, label } = returnTo;

  // Bounce back to the chat this send was started from — not to WhatsApp by
  // default, which used to throw a Telegram sender into a different app
  // entirely, away from the receipt that was about to arrive.
  //
  // Only when there is somewhere to go: a channel with no configured deep
  // link leaves the user on this page, which tells them the send succeeded,
  // rather than navigating them to a URL that opens nothing.
  useEffect(() => {
    if (!url) return;
    const t = window.setTimeout(() => {
      window.location.href = url;
    }, 1600);
    return () => window.clearTimeout(t);
  }, [url]);

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
      {url && (
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-ink-400">
          <Spinner small />
          Taking you back to {label}…
        </div>
      )}
      {url && (
        <a
          href={url}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-ink-900 px-6 py-3 text-sm font-medium text-surface-50 transition-transform active:scale-[0.98]"
        >
          Back to {label}
          <ArrowIcon className="h-4 w-4" />
        </a>
      )}
      <p className="mt-4 text-xs text-ink-400">
        Your receipt is in the chat. You can close this tab.
      </p>
    </div>
  );
}

/**
 * A send that was authorized and will go out in 24 hours.
 *
 * Deliberately NOT the success view with different words. The tick and the
 * word "Sent" describe money that has moved, and this is money that has not —
 * a user who reads that and checks their balance finds it unchanged, which is
 * the moment they stop trusting the receipt.
 *
 * No auto-redirect either, unlike SuccessView. That one bounces you back to
 * the chat because the receipt is already waiting there and the page has
 * nothing more to say. Here the page is telling the user something they have
 * a day to act on, including how to stop it, so it waits to be read.
 */
function QueuedView({
  message,
  returnTo,
}: {
  message: string;
  returnTo: ReturnTarget;
}) {
  const { url, label } = returnTo;

  return (
    <div className="py-2 text-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-ink-900 text-surface-50"
      >
        <ClockIcon className="h-7 w-7" />
      </motion.div>
      <p className="mt-6 font-display text-3xl text-ink-900">Queued</p>
      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-500">
        {message}
      </p>
      {url && (
        <a
          href={url}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-ink-900 px-6 py-3 text-sm font-medium text-surface-50 transition-transform active:scale-[0.98]"
        >
          Back to {label}
          <ArrowIcon className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
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

/** Copy of last resort, if a held response ever arrives without its own. */
const HELD_FALLBACK =
  "Queued. Sends this size wait 24 hours before they go out — reply \u0022cancel send\u0022 in the chat any time before then and nothing moves.";

/**
 * POST to a verify route and classify what came back.
 *
 * Every confirm path funnels through here so the held case cannot be handled
 * in one of them and forgotten in the other — which is exactly how it was
 * wrong before: two call sites, two different readings of the same 202.
 */
async function postConfirm(url: string, body: unknown): Promise<ConfirmOutcome> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return readConfirmOutcome(res);
}

/**
 * Read a successful verify response. Split from postConfirm because the PIN
 * path makes its own request — it has a 429 case that returns to the form
 * rather than leaving the flow — and both must read the body the same way.
 */
async function readConfirmOutcome(res: Response): Promise<ConfirmOutcome> {
  const data = (await res.json()) as {
    ok?: boolean;
    reason?: string;
    error?: string;
    transactionId?: string;
  };

  // A 2xx that is explicitly not ok. Today that is only "held"; matching on
  // the flag rather than on the status keeps this correct if another
  // accepted-but-not-done outcome is ever added.
  if (data.ok === false) {
    return { kind: "queued", message: data.error ?? HELD_FALLBACK };
  }

  return { kind: "sent", reference: String(data.transactionId ?? "").slice(0, 8) };
}

function stageFor(outcome: ConfirmOutcome): Stage {
  return outcome.kind === "queued"
    ? { kind: "queued", message: outcome.message }
    : { kind: "success", reference: outcome.reference };
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
