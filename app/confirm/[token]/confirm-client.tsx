"use client";

import {
  CheckmarkCircle02Icon,
  ChevronRightIcon,
  FingerprintScanIcon,
  SquareLock01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
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
  const [showPin, setShowPin] = useState(false);
  const recipient = recipientDetails(summary.recipientLabel);

  return (
    <main className="flex min-h-dvh flex-col items-center gap-8 bg-[#f5f8ff] px-4 py-8 font-works text-[#0a0a0a] sm:px-8">
      <header className="flex shrink-0 items-center gap-[3px]" aria-label="Tella">
        <span className="flex size-12 items-center justify-center">
          <Image src="/figma/hero/tella.svg" alt="" width={32} height={32} priority />
        </span>
        <span className="text-2xl leading-[30px] tracking-[-0.096px] text-[#0057ff]">Tella</span>
      </header>

      <section className="flex w-full flex-1 items-center justify-center py-6 sm:px-8">
        <div className="w-full max-w-[520px] overflow-hidden rounded-[24px] border border-[#e5e7eb] bg-white p-6 sm:p-8">
          <div className="flex flex-col items-center gap-2.5 whitespace-nowrap">
            <h1 className="text-center text-[72px] font-bold leading-[0.95] text-[#0a0a0a] sm:text-[88px] sm:leading-[88px]">{summary.amount}</h1>
            <div className="flex items-center justify-center gap-2 rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-3 py-2 text-sm leading-none">
              <span className="font-bold text-[#6b7280]">{summary.token}</span>
              <span className="text-[#9ca3af]">• 1 {summary.token}</span>
            </div>
          </div>

          <div className="mt-6 flex w-full items-center gap-3 rounded-[16px] border border-[#e5e7eb] bg-[#f9fafb] p-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#0047ff] text-base font-bold text-white">{recipient.initial}</div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase leading-none tracking-[2.2px] text-[#6b7280]">To</p>
              <p className="mt-1 truncate text-lg font-semibold leading-none text-[#0a0a0a]">{recipient.name}</p>
              <p className="mt-1 truncate text-[13px] leading-none text-[#9ca3af]">{recipient.email}</p>
            </div>
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#eaf2ff] text-[#0057ff]">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={2} aria-hidden="true" />
            </div>
          </div>

          <div className="my-6 h-px w-full bg-[#e5e7eb]" />

          {stage.kind === "ready" && !showPin ? (
            <AuthChoices onContinue={() => setShowPin(true)} />
          ) : (
            <StageView stage={stage} token={token} onStageChange={setStage} onCancel={() => setShowPin(false)} />
          )}
        </div>
      </section>

      <footer className="flex shrink-0 items-center justify-center gap-2 pb-6 text-center text-xs text-[#8a8a8a]">
        <span className="size-1.5 rounded-full bg-[#0057ff]" aria-hidden="true" />
        <span>Secured by tella · you approve every send</span>
      </footer>
    </main>
  );
}

function AuthChoices({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-[22px] text-[#6b7280]">
        Authorize with Face ID or your fingerprint. Set it up once - it then works across your devices.
      </p>
      <button type="button" onClick={onContinue} className="flex h-14 w-full items-center justify-center gap-2.5 rounded-[16px] bg-[#0047ff] text-base font-semibold text-white transition-colors hover:bg-[#003edb] active:bg-[#0038c7]">
        <HugeiconsIcon icon={FingerprintScanIcon} size={20} strokeWidth={1.8} aria-hidden="true" />
        <span>Set up &amp; confirm</span>
      </button>
      <button type="button" onClick={onContinue} className="flex w-full items-center justify-between rounded-[16px] border border-[#e5e7eb] bg-white px-3.5 py-3 text-sm font-semibold text-[#0a0a0a] transition-colors hover:bg-[#f9fafb]">
        <span>Use a PIN instead</span>
        <HugeiconsIcon icon={ChevronRightIcon} size={18} strokeWidth={1.8} className="text-[#9ca3af]" aria-hidden="true" />
      </button>
      <div className="flex items-center gap-2 text-xs text-[#9ca3af]">
        <HugeiconsIcon icon={SquareLock01Icon} size={14} strokeWidth={1.6} aria-hidden="true" />
        <span>Encrypted · tella never sees your biometrics</span>
      </div>
    </div>
  );
}

function StageView({
  stage,
  token,
  onStageChange,
  onCancel,
}: {
  stage: Stage;
  token: string;
  onStageChange: (next: Stage) => void;
  onCancel: () => void;
}) {
  if (stage.kind === "working") {
    return <div className="flex min-h-40 items-center justify-center text-sm text-[#6b7280]">{stage.label}</div>;
  }

  if (stage.kind === "success") return <SuccessView reference={stage.reference} />;

  if (stage.kind === "error") {
    return (
      <div className="rounded-[16px] border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700">{stage.message}</p>
        <button type="button" onClick={() => onStageChange({ kind: "ready", mode: "verify" })} className="mt-4 text-sm font-semibold text-red-800 underline underline-offset-4">Try again</button>
      </div>
    );
  }

  return <PinForm token={token} mode={stage.mode} onStageChange={onStageChange} onCancel={onCancel} />;
}

function PinForm({
  token,
  mode,
  onStageChange,
  onCancel,
}: {
  token: string;
  mode: "setup" | "verify";
  onStageChange: (next: Stage) => void;
  onCancel: () => void;
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
      onStageChange({ kind: "success", reference: data.transactionId.slice(0, 8) });
    } catch (err) {
      onStageChange({ kind: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm leading-[22px] text-[#6b7280]">
        {isSetup ? "Set a 4–8 digit PIN. You'll use this to confirm sends going forward." : "Enter your PIN to confirm."}
      </p>
      <input type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} maxLength={8} className="h-14 w-full rounded-[16px] border border-[#e5e7eb] bg-[#f9fafb] px-4 text-lg tracking-widest outline-none transition-colors focus:border-[#0057ff]" placeholder="••••" autoFocus />
      {isSetup && (
        <input type="password" inputMode="numeric" pattern="[0-9]*" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} maxLength={8} className="h-14 w-full rounded-[16px] border border-[#e5e7eb] bg-[#f9fafb] px-4 text-lg tracking-widest outline-none transition-colors focus:border-[#0057ff]" placeholder="Re-enter PIN" />
      )}
      <button type="submit" className="flex h-14 w-full items-center justify-center gap-2.5 rounded-[16px] bg-[#0047ff] text-base font-semibold text-white transition-colors hover:bg-[#003edb] active:bg-[#0038c7]">
        <HugeiconsIcon icon={FingerprintScanIcon} size={20} strokeWidth={1.8} aria-hidden="true" />
        {isSetup ? "Save PIN & confirm" : "Confirm send"}
      </button>
      <button type="button" onClick={onCancel} className="w-full py-2 text-sm font-semibold text-[#6b7280]">Back</button>
    </form>
  );
}

function SuccessView({ reference }: { reference: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#eaf2ff] text-[#0057ff]">
        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={28} strokeWidth={2} aria-hidden="true" />
      </div>
      <p className="mt-6 text-2xl font-semibold text-[#0a0a0a]">Sent</p>
      <p className="mt-2 text-sm text-[#6b7280]">Reference <code className="font-mono text-[#0a0a0a]">{reference}</code></p>
      <Link href="whatsapp://send" className="mt-6 inline-flex h-12 items-center rounded-full bg-[#0047ff] px-6 text-sm font-semibold text-white">Back to WhatsApp ↗</Link>
      <p className="mt-4 text-xs text-[#9ca3af]">Receipt has been sent to your chat. You can close this tab.</p>
    </div>
  );
}

function recipientDetails(label: string) {
  const cleanLabel = label.trim() || "Recipient";
  const handle = cleanLabel.includes("@") ? cleanLabel.split("@")[0] : cleanLabel.toLowerCase().replace(/[^a-z0-9]+/g, "");

  return {
    initial: cleanLabel.charAt(0).toUpperCase(),
    name: cleanLabel.includes("@") ? handle : cleanLabel,
    email: cleanLabel.includes("@") ? cleanLabel : `${handle || "user"}@tella.app`,
  };
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
