"use client";

import Link from "next/link";
import { useState } from "react";

interface SendSummary {
  amount: string;
  token: string;
  recipientLabel: string;
}

type Stage =
  | { kind: "ready"; mode: "setup" | "verify" }
  | { kind: "working"; label: string }
  | { kind: "success"; reference: string }
  | { kind: "error"; message: string };

/**
 * ConfirmClient
 *
 * The interactive surface of the confirmation page. PIN-only for now;
 * biometric (WebAuthn) is planned to layer on top of this same shell —
 * see BIOMETRIC_TODO.md for the re-enable path. The Stage state machine
 * is intentionally kept generic so adding a `ready_biometric` branch
 * later doesn't require restructuring.
 */
export function ConfirmClient({
  token,
  summary,
  hasPin,
}: {
  token: string;
  summary: SendSummary;
  hasPin: boolean;
}) {
  const [stage, setStage] = useState<Stage>({
    kind: "ready",
    mode: hasPin ? "verify" : "setup",
  });

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
        <StageView stage={stage} token={token} onStageChange={setStage} />
      </section>
    </main>
  );
}

function StageView({
  stage,
  token,
  onStageChange,
}: {
  stage: Stage;
  token: string;
  onStageChange: (next: Stage) => void;
}) {
  if (stage.kind === "working") {
    return <p className="text-sm text-ink-500">{stage.label}</p>;
  }

  if (stage.kind === "success") {
    return <SuccessView reference={stage.reference} />;
  }

  if (stage.kind === "error") {
    return (
      <div>
        <p className="text-sm text-red-600">{stage.message}</p>
        <button
          onClick={() => onStageChange({ kind: "ready", mode: "verify" })}
          className="mt-4 text-sm underline underline-offset-4"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <PinForm token={token} mode={stage.mode} onStageChange={onStageChange} />
  );
}

function PinForm({
  token,
  mode,
  onStageChange,
}: {
  token: string;
  mode: "setup" | "verify";
  onStageChange: (next: Stage) => void;
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
        message:
          err instanceof Error ? err.message : "Something went wrong.",
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
        className="w-full rounded-full bg-ink-900 px-6 py-4 text-base font-medium text-surface-50 active:scale-[0.98] transition-transform"
      >
        {isSetup ? "Save PIN & send" : "Confirm send"}
      </button>
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

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}