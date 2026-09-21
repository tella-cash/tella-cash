"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  validateNewChain,
  type ChainFieldErrors,
  type ChainNetwork,
} from "@/lib/chains/validate";

/**
 * The Networks card: where users can be paid besides Arc, and the one form
 * that adds to the list.
 *
 * ADD-ONLY, AND THE SCREEN SAYS SO
 *
 * There is no edit and no remove here because the table refuses both
 * (migrations/0028_chains.sql). What the admin needs is not a scare but an
 * accurate picture: adding a network is an ordinary, expected thing to do, and
 * it is permanent. The review step states both, plainly, before the button
 * that does it. It is deliberately not styled as an error — nothing is wrong —
 * and it is not a modal, because it is a step in the form, not an interruption
 * of it.
 *
 * Validation runs here for instant feedback using the same function the route
 * runs, so the two cannot disagree; the route still checks everything, and
 * additionally asks Circle.
 */

export interface ChainRow {
  id: string;
  displayName: string;
  blockchain: string;
  usdcAddress: string;
  cctpDomain: number;
  addedBy: string | null;
  createdAt: string;
}

type Step = "closed" | "edit" | "review" | "done";

interface Fields {
  displayName: string;
  blockchain: string;
  usdcAddress: string;
  cctpDomain: string;
  explorerTxUrl: string;
}

const EMPTY: Fields = {
  displayName: "",
  blockchain: "",
  usdcAddress: "",
  cctpDomain: "",
  explorerTxUrl: "",
};

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500";

export function ChainsCard({
  chains,
  network,
}: {
  /** Null when the table could not be read, which is what an unapplied migration looks like. */
  chains: ChainRow[] | null;
  network: ChainNetwork;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("closed");
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<ChainFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addedName, setAddedName] = useState<string | null>(null);

  const existing = (chains ?? []).map((c) => ({
    slug: slugOf(c.displayName),
    blockchain: c.blockchain,
    cctp_domain: c.cctpDomain,
  }));

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
    // An error is about the value that was there; clear it on edit so the
    // message never outlives the mistake.
    if (key === "displayName") setErrors((e) => ({ ...e, slug: undefined, displayName: undefined }));
    else setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function toBody() {
    return {
      slug: slugOf(fields.displayName),
      displayName: fields.displayName,
      blockchain: fields.blockchain,
      usdcAddress: fields.usdcAddress,
      cctpDomain: fields.cctpDomain,
      explorerTxUrl: fields.explorerTxUrl,
    };
  }

  function review(e: React.FormEvent) {
    e.preventDefault();
    const result = validateNewChain(toBody(), network, existing);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setFormError(null);
    setConfirmed(false);
    setStep("review");
  }

  async function submit() {
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch("/api/admin/chains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...toBody(), confirmed }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        errors?: ChainFieldErrors;
      };

      if (res.ok) {
        setAddedName(fields.displayName.trim());
        setFields(EMPTY);
        setStep("done");
        router.refresh();
        return;
      }

      if (json.errors) {
        // Back to the form: the value that was refused is on screen.
        setErrors(json.errors);
        setStep("edit");
      } else {
        setFormError(json.error ?? "That didn't go through. Nothing was saved.");
      }
    } catch {
      setFormError("Couldn't reach the server. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  function open() {
    setStep("edit");
    setErrors({});
    setFormError(null);
    setAddedName(null);
  }

  function cancel() {
    setStep("closed");
    setFields(EMPTY);
    setErrors({});
    setFormError(null);
  }

  return (
    <section className="rounded-2xl border border-ink-200/70 bg-surface-0 px-5 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg text-ink-900">Networks</h2>
        <span className="text-xs text-ink-400">
          Where users can be paid, {network === "mainnet" ? "mainnet" : "testnet"}
        </span>
      </div>

      <div className="mt-4">
        {chains === null ? (
          <p className="rounded-xl bg-surface-100 px-4 py-3 text-sm text-ink-500" role="status">
            The network list couldn&apos;t be read. If migration 0028 hasn&apos;t been
            applied to this database yet, apply it first.
          </p>
        ) : (
          <ul className="divide-y divide-ink-200/70">
            <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0">
              <div className="flex items-baseline gap-3">
                <span className="text-sm font-medium text-ink-900">Arc</span>
                <span className="text-xs text-ink-400">Home network, always on</span>
              </div>
              <span className="text-xs text-ink-400">Wallets are created here and sends leave from here</span>
            </li>
            {chains.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
              >
                <div className="flex items-baseline gap-3">
                  <span className="text-sm font-medium text-ink-900">{c.displayName}</span>
                  <span className="font-mono text-xs text-ink-500">{c.blockchain}</span>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-ink-400">
                  <span title={c.usdcAddress} className="font-mono">
                    USDC {short(c.usdcAddress)}
                  </span>
                  <span className="tabular-nums">CCTP {c.cctpDomain}</span>
                  <span>
                    Added {new Date(c.createdAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}
                    {c.addedBy ? ` by ${c.addedBy}` : ""}
                  </span>
                </div>
              </li>
            ))}
            {chains.length === 0 && (
              <li className="py-3 text-sm text-ink-500">
                No other networks yet. Users can only be paid on Arc.
              </li>
            )}
          </ul>
        )}
      </div>

      {chains !== null && step === "closed" && (
        <div className="mt-4 border-t border-ink-200/70 pt-4">
          <button
            type="button"
            onClick={open}
            className={`rounded-xl bg-surface-100 px-4 py-2.5 text-sm font-medium text-ink-900 transition-all hover:bg-surface-200 active:scale-[0.98] ${FOCUS}`}
          >
            Add a network
          </button>
        </div>
      )}

      {step === "done" && addedName && (
        <p className="mt-4 rounded-xl bg-surface-100 px-4 py-3 text-sm text-ink-700" role="status">
          {addedName} is added. Users get their wallet on it over the next runs of the
          chain-wallets job, which runs every 30 minutes, so it reaches everyone within a
          few runs rather than at once.
        </p>
      )}

      {step === "edit" && (
        <form onSubmit={review} noValidate className="mt-4 border-t border-ink-200/70 pt-5">
          <h3 className="font-display text-base text-ink-900">Add a network</h3>
          <p className="mt-1 max-w-[60ch] text-sm text-ink-500">
            Only USDC on the address you give here is ever counted as money on this
            network. You&apos;ll review everything before it&apos;s saved.
          </p>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field
              id="chain-name"
              label="Name"
              hint="What users see, e.g. Arbitrum"
              value={fields.displayName}
              onChange={(v) => set("displayName", v)}
              error={errors.displayName ?? errors.slug}
            />
            <Field
              id="chain-code"
              label="Circle network code"
              hint={network === "mainnet" ? "e.g. ARB" : "e.g. ARB-SEPOLIA"}
              value={fields.blockchain}
              onChange={(v) => set("blockchain", v)}
              error={errors.blockchain}
              mono
            />
            <div className="sm:col-span-2">
              <Field
                id="chain-usdc"
                label="USDC contract address"
                hint="Copy it from Circle's list of USDC addresses, not from a block explorer search"
                value={fields.usdcAddress}
                onChange={(v) => set("usdcAddress", v)}
                error={errors.usdcAddress}
                mono
              />
            </div>
            <Field
              id="chain-domain"
              label="CCTP domain"
              hint="From Circle's CCTP chain table"
              value={fields.cctpDomain}
              onChange={(v) => set("cctpDomain", v)}
              error={errors.cctpDomain}
              inputMode="numeric"
            />
            <Field
              id="chain-explorer"
              label="Explorer transaction link"
              hint="Up to where the hash goes, e.g. https://arbiscan.io/tx"
              value={fields.explorerTxUrl}
              onChange={(v) => set("explorerTxUrl", v)}
              error={errors.explorerTxUrl}
              mono
            />
          </div>

          {formError && (
            <p className="mt-4 text-sm text-red-600" role="alert">
              {formError}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className={`rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-accent-600 active:scale-[0.98] ${FOCUS}`}
            >
              Review
            </button>
            <button
              type="button"
              onClick={cancel}
              className={`rounded-xl px-3 py-2.5 text-sm text-ink-500 transition-colors hover:text-ink-900 ${FOCUS}`}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {step === "review" && (
        <div className="mt-4 border-t border-ink-200/70 pt-5">
          <h3 className="font-display text-base text-ink-900">Review before adding</h3>

          <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[11rem_1fr]">
            <Row label="Name" value={fields.displayName.trim()} />
            <Row label="Circle network code" value={fields.blockchain.trim().toUpperCase()} mono />
            <Row label="USDC contract" value={fields.usdcAddress.trim().toLowerCase()} mono wrap />
            <Row label="CCTP domain" value={fields.cctpDomain.trim()} />
            <Row label="Explorer link" value={fields.explorerTxUrl.trim()} mono wrap />
          </dl>

          {/* Not styled as an error: nothing is wrong. It is a plain statement
              of what happens next and that it cannot be undone. */}
          <div className="mt-6 rounded-xl border border-ink-200 bg-surface-100 px-4 py-4 text-sm text-ink-700">
            <p className="font-medium text-ink-900">This can&apos;t be undone</p>
            <p className="mt-2 max-w-[62ch]">
              Adding a network is a normal thing to do, and it isn&apos;t a mistake. It is
              permanent, though. Once it&apos;s added it can&apos;t be edited or removed
              from here. Every user gets a wallet on it, deposits are checked against the
              USDC address above, and users are told they can be paid there.
            </p>
            <p className="mt-2 max-w-[62ch]">
              Nothing can confirm this is Circle&apos;s official USDC address for the
              network, so check it against Circle&apos;s published list first. If a value
              turns out to be wrong, correcting it means changing the database directly.
            </p>
          </div>

          <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm text-ink-900">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className={`mt-0.5 h-4 w-4 rounded border-ink-300 accent-[var(--color-accent-500)] ${FOCUS}`}
            />
            <span>
              I&apos;ve checked these values and I understand adding this network is
              permanent.
            </span>
          </label>

          {formError && (
            <p className="mt-4 text-sm text-red-600" role="alert">
              {formError}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={!confirmed || busy}
              className={`rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-accent-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
            >
              {busy ? "Checking with Circle…" : "Add network permanently"}
            </button>
            <button
              type="button"
              onClick={() => setStep("edit")}
              disabled={busy}
              className={`rounded-xl px-3 py-2.5 text-sm text-ink-500 transition-colors hover:text-ink-900 disabled:opacity-50 ${FOCUS}`}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  error,
  mono,
  inputMode,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  mono?: boolean;
  inputMode?: "numeric";
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-900">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-note`}
        className={`mt-1.5 w-full rounded-xl border bg-surface-50 px-3.5 py-2.5 text-sm text-ink-900 outline-none transition-colors placeholder:text-ink-300 focus:border-accent-500 ${
          error ? "border-red-600" : "border-ink-200"
        } ${mono ? "font-mono text-[13px]" : ""}`}
      />
      <p
        id={`${id}-note`}
        role={error ? "alert" : undefined}
        className={`mt-1.5 text-xs ${error ? "text-red-600" : "text-ink-400"}`}
      >
        {error ?? hint}
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  wrap,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wrap?: boolean;
}) {
  return (
    <>
      <dt className="text-ink-400">{label}</dt>
      <dd className={`text-ink-900 ${mono ? "font-mono text-[13px]" : ""} ${wrap ? "break-all" : ""}`}>
        {value}
      </dd>
    </>
  );
}

/** Same rule the server derives its slug by, so a duplicate is caught on screen. */
function slugOf(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function short(address: string): string {
  return address.length > 14 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}
