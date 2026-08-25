"use client";

import type { ReturnTarget } from "@/lib/messaging/return-link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

type Stage =
  | { kind: "form" }
  | { kind: "working" }
  | { kind: "done"; removedPasskeys: number }
  | { kind: "error"; message: string };

/**
 * The PIN-reset surface.
 *
 * Same shape as the confirm page's PinForm — shake-in-place for anything the
 * client can check itself, a real error stage only for server rejections —
 * so a user who has confirmed a send before recognises this immediately.
 */
export function SecurityClient({
  token,
  hasPasskey,
  returnTo,
}: {
  token: string;
  hasPasskey: boolean;
  returnTo: ReturnTarget;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "form" });

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="overflow-hidden rounded-[28px] border border-ink-200/70 bg-surface-0 shadow-card"
    >
      <div className="px-7 pt-8 pb-2">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-ink-400">
          <LockIcon className="h-3.5 w-3.5 text-accent-500" />
          Account recovery
        </div>
        <h1 className="mt-4 font-display text-3xl text-ink-900">
          Set a new PIN
        </h1>
      </div>

      <div className="px-7 pb-7 pt-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={stage.kind}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            {stage.kind === "form" && (
              <ResetForm
                token={token}
                hasPasskey={hasPasskey}
                onStageChange={setStage}
              />
            )}
            {stage.kind === "working" && <WorkingView />}
            {stage.kind === "done" && (
              <DoneView
                removedPasskeys={stage.removedPasskeys}
                returnTo={returnTo}
              />
            )}
            {stage.kind === "error" && (
              <ErrorView
                message={stage.message}
                onRetry={() => setStage({ kind: "form" })}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function ResetForm({
  token,
  hasPasskey,
  onStageChange,
}: {
  token: string;
  hasPasskey: boolean;
  onStageChange: (next: Stage) => void;
}) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [removePasskeys, setRemovePasskeys] = useState(false);
  const [shake, setShake] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  // Synchronous re-entry guard — a double-tap must not consume the token
  // twice, since the second attempt would 409 and look like a failure.
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

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
    if (pin !== pin2) {
      rejectInPlace("PINs don't match.");
      return;
    }
    setValidationMessage(null);
    busyRef.current = true;
    setBusy(true);
    onStageChange({ kind: "working" });

    try {
      const res = await fetch("/api/security/pin/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, pin, removePasskeys }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { removedPasskeys?: number };
      onStageChange({
        kind: "done",
        removedPasskeys: data.removedPasskeys ?? 0,
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
        Choose a 4–8 digit PIN. This replaces your old one everywhere.
      </p>

      <motion.div
        animate={shake ? { x: [0, -8, 8, -8, 8, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-2"
      >
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          placeholder="New PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          className="w-full rounded-2xl border border-ink-200 bg-surface-0 px-5 py-4 text-center text-2xl tracking-[0.5em] text-ink-900 outline-none transition-colors focus:border-accent-500"
        />
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          placeholder="Confirm PIN"
          value={pin2}
          onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 8))}
          className="w-full rounded-2xl border border-ink-200 bg-surface-0 px-5 py-4 text-center text-2xl tracking-[0.5em] text-ink-900 outline-none transition-colors focus:border-accent-500"
        />
      </motion.div>

      {validationMessage && (
        <p className="text-center text-sm text-red-600">{validationMessage}</p>
      )}

      {/* Only offered when there's actually a passkey to remove. Someone who
          lost the device holding their only passkey needs this; someone who
          didn't shouldn't be invited to throw one away. */}
      {hasPasskey && (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-surface-100/70 px-4 py-3">
          <input
            type="checkbox"
            checked={removePasskeys}
            onChange={(e) => setRemovePasskeys(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-accent-500"
          />
          <span className="text-sm leading-relaxed text-ink-500">
            Also remove Face ID / fingerprint from my devices.
            <span className="mt-0.5 block text-xs text-ink-400">
              Pick this if you&apos;ve lost the phone you set it up on.
            </span>
          </span>
        </label>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-2xl bg-accent-500 px-6 py-4 text-base font-medium text-white shadow-accent transition-all hover:bg-accent-600 active:scale-[0.98] disabled:opacity-60"
      >
        Save new PIN
      </button>
    </form>
  );
}

function WorkingView() {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-200 border-t-accent-500" />
      <p className="text-sm text-ink-500">Saving…</p>
    </div>
  );
}

function DoneView({
  removedPasskeys,
  returnTo,
}: {
  removedPasskeys: number;
  returnTo: ReturnTarget;
}) {
  // Matches the confirm page's auto-return so the flow ends where it began —
  // the chat that asked for the reset, not WhatsApp by assumption. Skipped
  // when the channel has no deep link, rather than navigating nowhere.
  const returnHref = returnTo.url;
  useEffect(() => {
    if (!returnHref) return;
    const t = window.setTimeout(() => {
      window.location.href = returnHref;
    }, 2200);
    return () => window.clearTimeout(t);
  }, [returnHref]);

  return (
    <div className="space-y-4 py-2 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent-500 text-xl text-white">
        ✓
      </div>
      <div>
        <p className="font-display text-2xl text-ink-900">PIN updated</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          {removedPasskeys > 0
            ? `Face ID / fingerprint was removed from ${removedPasskeys} device${removedPasskeys === 1 ? "" : "s"}. Use your new PIN to confirm sends.`
            : "Use your new PIN the next time you confirm a send."}
        </p>
      </div>
      {returnTo.url && (
        <a
          href={returnTo.url}
          className="inline-block text-sm font-medium text-accent-600 underline underline-offset-4"
        >
          Back to {returnTo.label}
        </a>
      )}
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
    <div className="space-y-4 py-2 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-100 text-xl text-ink-400">
        !
      </div>
      <p className="text-sm leading-relaxed text-ink-500">{message}</p>
      <button
        onClick={onRetry}
        className="w-full rounded-2xl border border-ink-200 px-6 py-3 text-sm font-medium text-ink-900 transition-colors hover:bg-surface-100"
      >
        Try again
      </button>
    </div>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 5a3 3 0 1 1 6 0v3H9V7Z" />
    </svg>
  );
}
