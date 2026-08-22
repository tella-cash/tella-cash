"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

type Stage =
  | { kind: "form" }
  | { kind: "working" }
  | { kind: "done"; cancelledSends: number; alreadyFrozen: boolean }
  | { kind: "error"; message: string };

/**
 * The freeze door.
 *
 * Written for someone who is frightened, on an unfamiliar device, possibly
 * borrowing it from a stranger. Everything here follows from that: one screen,
 * two fields, one button, no navigation away, no explanation of what a wallet
 * is. The copy says what will happen and what will not, because "freeze" on
 * its own sounds permanent and people hesitate over buttons they think might
 * destroy their money.
 */
export function PanicClient() {
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
          <ShieldIcon className="h-3.5 w-3.5 text-red-600" />
          Emergency
        </div>
        <h1 className="mt-4 font-display text-3xl text-ink-900">
          Freeze your account
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
            {stage.kind === "form" && <PanicForm onStageChange={setStage} />}
            {stage.kind === "working" && <WorkingView />}
            {stage.kind === "done" && (
              <DoneView
                cancelledSends={stage.cancelledSends}
                alreadyFrozen={stage.alreadyFrozen}
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

function PanicForm({
  onStageChange,
}: {
  onStageChange: (stage: Stage) => void;
}) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    if (!phone.trim() || !code.trim()) {
      setInlineError("Both fields are needed.");
      return;
    }

    setBusy(true);
    setInlineError(null);
    onStageChange({ kind: "working" });

    try {
      const res = await fetch("/api/panic/freeze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        onStageChange({
          kind: "error",
          message: data.error ?? "Something went wrong. Try again.",
        });
        return;
      }

      onStageChange({
        kind: "done",
        cancelledSends: data.cancelledSends ?? 0,
        alreadyFrozen: Boolean(data.alreadyFrozen),
      });
    } catch {
      onStageChange({
        kind: "error",
        message: "Couldn't reach tella. Check your connection and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm leading-relaxed text-ink-500">
        This stops anything leaving your wallet. You can still receive money,
        and nothing you already have is lost.
      </p>

      <div className="space-y-1.5">
        <label
          htmlFor="panic-phone"
          className="block text-[11px] font-medium uppercase tracking-[0.16em] text-ink-400"
        >
          Your WhatsApp number
        </label>
        <input
          id="panic-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+234..."
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-2xl border border-ink-200 bg-surface-50 px-4 py-3.5 text-base text-ink-900 outline-none transition-colors placeholder:text-ink-300 focus:border-accent-500"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="panic-code"
          className="block text-[11px] font-medium uppercase tracking-[0.16em] text-ink-400"
        >
          Your panic code
        </label>
        <input
          id="panic-code"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-2xl border border-ink-200 bg-surface-50 px-4 py-3.5 font-mono text-base tracking-wider text-ink-900 outline-none transition-colors placeholder:text-ink-300 focus:border-accent-500"
        />
        <p className="text-xs text-ink-400">
          Dashes, spaces and capitals don&apos;t matter.
        </p>
      </div>

      {inlineError && (
        <p className="text-sm text-red-600" role="alert">
          {inlineError}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-2xl bg-red-600 px-6 py-4 text-base font-medium text-white transition-all hover:bg-red-700 active:scale-[0.98] disabled:opacity-60"
      >
        Freeze my account
      </button>
    </form>
  );
}

function WorkingView() {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-200 border-t-red-600" />
      <p className="text-sm text-ink-500">Freezing…</p>
    </div>
  );
}

function DoneView({
  cancelledSends,
  alreadyFrozen,
}: {
  cancelledSends: number;
  alreadyFrozen: boolean;
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-2.5">
        <span className="text-2xl">🔒</span>
        <p className="font-display text-2xl text-ink-900">
          {alreadyFrozen ? "Already frozen" : "Frozen"}
        </p>
      </div>

      <p className="text-sm leading-relaxed text-ink-500">
        Nothing can leave your wallet. You can still receive money as normal,
        and your balance is untouched.
      </p>

      {cancelledSends > 0 && (
        <p className="text-sm leading-relaxed text-ink-500">
          {cancelledSends === 1
            ? "One payment that was waiting to be confirmed has been cancelled."
            : `${cancelledSends} payments that were waiting to be confirmed have been cancelled.`}
        </p>
      )}

      <div className="rounded-2xl bg-surface-50 px-4 py-3.5">
        <p className="text-sm leading-relaxed text-ink-500">
          When you have your phone back, message tella on WhatsApp to lift the
          freeze. Getting a new SIM for the same number is enough.
        </p>
      </div>
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
    <div className="space-y-4 py-2">
      <p className="text-sm leading-relaxed text-ink-900">{message}</p>
      <button
        onClick={onRetry}
        className="w-full rounded-2xl border border-ink-200 px-6 py-3.5 text-sm font-medium text-ink-900 transition-colors hover:bg-surface-50"
      >
        Try again
      </button>
    </div>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
