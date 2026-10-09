import { fmtDateTime, fmtInt, fmtUsd } from "@/lib/analytics/format";
import type { AnalyticsData, Ops, SecurityPosture } from "@/lib/analytics/queries";
import type { ChainNetwork } from "@/lib/chains/validate";
import { ChainsCard, type ChainRow } from "../chains-card";
import { BarList, FOCUS, Load, Panel, Section } from "./primitives";

/**
 * The part of the page for whoever runs the service, not whoever is being
 * shown it: what needs reconciling, what the figures above left out and why,
 * and the networks.
 */

const REJECT_LABEL: Record<string, string> = {
  unsettled: "Not settled",
  duplicate: "Recorded twice",
  non_usdc: "Not USDC",
  bad_amount: "Unreadable amount",
  excluded_user: "From a test account",
};

export function Operations({
  data,
  chains,
  network,
}: {
  data: AnalyticsData;
  chains: ChainRow[] | null;
  network: ChainNetwork;
}) {
  // When 0033 is missing the page has already said so once, at the top.
  // Security and Networks do not depend on it and are still shown.
  const showOps = !data.migrationMissing;

  return (
    <Section
      id="operations"
      title="Operations"
      caption="As things stand now. The period filter does not change these."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {showOps && (
          <Panel title="Needs a look">
            <Load from={data.ops}>{(ops) => <Attention ops={ops} />}</Load>
          </Panel>
        )}

        <Panel
          className={showOps ? "" : "lg:col-span-2"}
          title="Account security"
          hint="Recovering an account depends on these."
        >
          <Load from={data.security}>
            {(s) => (
              <Security
                s={s}
                totalUsers={
                  data.summary.status === "ok" ? data.summary.data.current.users.total : null
                }
              />
            )}
          </Load>
        </Panel>

        {showOps && (
          <Panel
            className="lg:col-span-2"
            title="What the figures leave out"
            hint="Ledger rows that are not counted in anything above, and the reason for each."
          >
            <Load from={data.ops}>{(ops) => <Quality ops={ops} />}</Load>
          </Panel>
        )}
      </div>

      <div className="mt-6">
        <ChainsCard chains={chains} network={network} />
      </div>
    </Section>
  );
}

/**
 * A row is flagged with a mark and a word, never colour alone, and only when
 * there is something to do about it.
 */
function Attention({ ops }: { ops: Ops }) {
  const rows = [
    {
      label: "Sends unsettled for over an hour",
      value: fmtInt(ops.stuck.count),
      flag: ops.stuck.count > 0,
      note:
        ops.stuck.count > 0
          ? `${fmtUsd(ops.stuck.amount)}${ops.stuck.oldestAt ? `, oldest from ${fmtDateTime(ops.stuck.oldestAt)}` : ""}. Some will have settled and lost their confirmation: check each against Circle.`
          : "Every send has settled or is under an hour old.",
    },
    {
      label: "Sends waiting out the 24-hour hold",
      value: fmtInt(ops.held.count),
      flag: ops.held.overdue > 0,
      note:
        ops.held.count > 0
          ? `${fmtUsd(ops.held.amount)}${ops.held.nextReleaseAt ? `, next release ${fmtDateTime(ops.held.nextReleaseAt)}` : ""}.${ops.held.overdue > 0 ? ` ${fmtInt(ops.held.overdue)} past their release time: the release job may not be running.` : ""}`
          : "Nothing is being held.",
    },
    {
      label: "Held sends with no recorded outcome",
      value: fmtInt(ops.heldUnresolved),
      flag: ops.heldUnresolved > 0,
      note:
        ops.heldUnresolved > 0
          ? "The release job stopped part-way. Reconcile each against Circle before anything else."
          : "None.",
    },
    {
      label: "Frozen accounts",
      value: fmtInt(ops.frozen),
      flag: false,
      note: ops.frozen > 0 ? "Frozen by the owner, an operator, or automatically." : "None.",
    },
  ];

  return (
    <ul className="divide-y divide-ink-200/60">
      {rows.map((r) => (
        <li key={r.label} className="py-3.5 first:pt-0 last:pb-0">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-ink-900">{r.label}</span>
            <span className="flex items-baseline gap-2.5">
              {r.flag && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-warn">
                  <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
                    <path
                      d="M6 1.2 11.2 10.4H.8z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                    <path d="M6 4.8v2.6M6 8.9v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  Check
                </span>
              )}
              <span className="text-lg font-medium text-ink-900 tabular-nums">{r.value}</span>
            </span>
          </div>
          <p className="mt-1 max-w-[62ch] text-xs leading-relaxed text-pretty text-ink-500">
            {r.note}
          </p>
        </li>
      ))}
    </ul>
  );
}

function Security({ s, totalUsers }: { s: SecurityPosture; totalUsers: number | null }) {
  const rows = [
    { label: "PIN", value: s.withPin },
    { label: "Passkey", value: s.withPasskey },
    { label: "Google linked", value: s.withGoogle },
    { label: "Panic code", value: s.withPanicCode },
  ];
  return (
    <>
      <BarList
        rows={rows.map((r) => ({ ...r, display: fmtInt(r.value) }))}
        // Out of everyone, so a short bar means few people have it. Falls
        // back to the longest bar if the user count did not load.
        total={totalUsers ?? undefined}
      />
      {s.noFactor > 0 && (
        <p className="mt-5 border-t border-ink-200/60 pt-4 text-sm text-pretty text-ink-500">
          <strong className="font-medium text-ink-900">{fmtInt(s.noFactor)}</strong>{" "}
          {s.noFactor === 1 ? "account has" : "accounts have"} no PIN or passkey. Every recovery
          rule asks for a factor enrolled before the trouble started, so{" "}
          {s.noFactor === 1 ? "that account" : "those accounts"} cannot be recovered if frozen or
          compromised.
        </p>
      )}
    </>
  );
}

function Quality({ ops }: { ops: Ops }) {
  const { rejected, orphanReceipts, noHash } = ops.quality;

  const rows = [
    ...Object.entries(rejected).map(([reason, v]) => ({
      label: REJECT_LABEL[reason] ?? reason,
      why: REJECT_WHY[reason] ?? "",
      ...v,
    })),
    {
      label: "Receipt with no settled send beside it",
      why: "A transfer between two Tella users whose sending side never settled on record. Left out entirely, so it is counted zero times, not twice.",
      ...orphanReceipts,
    },
    {
      label: "No transaction hash",
      why: "Cannot be checked for duplicates. Still counts as wallet activity, not as volume.",
      ...noHash,
    },
  ].filter((r) => r.count > 0);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        Nothing. Every ledger row is settled, unique, and counted.
      </p>
    );
  }

  return (
    <ul className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-ink-900">{r.label}</span>
            <span className="whitespace-nowrap text-ink-500 tabular-nums">
              <span className="font-medium text-ink-900">{fmtInt(r.count)}</span>
              <span className="ml-2">{fmtUsd(r.amount)}</span>
            </span>
          </div>
          {r.why && (
            <p className="mt-1 text-xs leading-relaxed text-pretty text-ink-500">{r.why}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

const REJECT_WHY: Record<string, string> = {
  unsettled: "Still in flight, abandoned, or settled without its confirmation arriving.",
  duplicate: "The same receipt written more than once. Counted once.",
  non_usdc: "A token that is not USDC, recorded before deposits were checked by contract.",
  bad_amount: "The stored amount is not a number.",
  excluded_user: "Marked as a test account in tella_analytics_excluded_users.",
};

/* ---------- how the numbers are counted ---------- */

const DEFINITIONS: [string, string][] = [
  [
    "Transaction volume",
    "The USDC in every settled transfer: deposits from outside Tella, transfers between two Tella users, and withdrawals to outside addresses. A transfer between two Tella users is recorded once for the sender and once for the recipient; it is counted once here.",
  ],
  [
    "Successful transfers",
    "The number of those same transfers. A send only counts once it has settled on chain. A send that failed is never recorded, so there is no failure rate to show.",
  ],
  [
    "Sent and Received",
    "Each side of the ledger added up on its own. They overlap by the transfers between Tella users, which is why they add up to more than volume.",
  ],
  [
    "Total users",
    "Everyone who has an account, which begins with a first message to Tella. Finished signup and has a wallet are shown beside it.",
  ],
  [
    "Active wallets",
    "Users with at least one settled transfer in the window, sent or received. New means it was their first ever.",
  ],
  [
    "Recorded net flow",
    "Deposits minus withdrawals. It is not a balance: network fees and anything the ledger missed are not in it.",
  ],
  [
    "Retention",
    "Wallets are grouped by the month of their first transfer. A wallet is retained in a later month if it has a settled transfer in that month.",
  ],
  [
    "Change since the previous period",
    "Compared with the window of the same length immediately before. Shown as a percentage only when the earlier figure is five or more; below that it is a plain count. Rates work the same way: under ten, they are written as a count out of a total.",
  ],
  [
    "Time",
    "Days, weeks and months are calendar ones in Lagos time; weeks start on Monday. The headline figures use rolling windows ending now.",
  ],
];

export function Definitions({
  generatedAt,
  excludedUsers,
}: {
  generatedAt: string;
  excludedUsers: number | null;
}) {
  return (
    <footer className="mt-14 border-t border-ink-200/60 pt-7 pb-16 sm:mt-16">
      <details className="group">
        <summary
          className={`inline-flex cursor-pointer list-none items-center gap-2 rounded-md text-sm font-medium text-ink-900 [&::-webkit-details-marker]:hidden ${FOCUS}`}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            aria-hidden="true"
            className="transition-transform duration-200 group-open:rotate-90"
          >
            <path
              d="M3 1.5 7 5 3 8.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          How these numbers are counted
        </summary>
        <dl className="mt-6 grid gap-x-12 gap-y-6 md:grid-cols-2">
          {DEFINITIONS.map(([term, text]) => (
            <div key={term}>
              <dt className="text-sm font-medium text-ink-900">{term}</dt>
              <dd className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-pretty text-ink-500">
                {text}
              </dd>
            </div>
          ))}
        </dl>
      </details>

      <p className="mt-7 text-xs text-ink-500">
        Figures as of {fmtDateTime(generatedAt)}, Lagos time.
        {excludedUsers !== null && excludedUsers > 0 && (
          <>
            {" "}
            {fmtInt(excludedUsers)} test {excludedUsers === 1 ? "account is" : "accounts are"} left
            out of every figure.
          </>
        )}
      </p>
    </footer>
  );
}
