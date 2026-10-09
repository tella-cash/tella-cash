import Link from "next/link";
import { BrandMark } from "@/components/ui/brand-mark";
import { PERIODS, periodHref, type Period } from "@/lib/analytics/period";
import { PendingHint } from "./pending-hint";
import { ThemeSetting } from "./theme";

/**
 * The bar across the top: who this is, which network, the one filter, and
 * settings.
 *
 * A top bar rather than a sidebar because there is one page. The filter is a
 * set of links, not buttons with state: the period lives in the URL, so a
 * view can be bookmarked or sent to someone, and the page stays rendered on
 * the server.
 */

const PERIOD_LABEL: Record<Period, string> = {
  all: "All time",
  day: "Day",
  week: "Week",
  month: "Month",
};

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500";

const SETTINGS_ID = "admin-settings";

export function TopBar({
  period,
  email,
  mainnet,
}: {
  period: Period;
  email: string;
  mainnet: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-200/60 bg-surface-50/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[80rem] flex-wrap items-center gap-x-3 gap-y-2.5 px-5 py-3 sm:px-8">
        <Link
          href="/admin"
          aria-label="Tella admin, all time"
          className={`rounded-xl ${FOCUS}`}
        >
          <BrandMark compact />
        </Link>
        <span className="rounded-md bg-surface-100 px-2 py-1 text-xs font-medium leading-none text-ink-500">
          Admin
        </span>
        <span className="hidden text-xs text-ink-500 md:inline">
          {mainnet ? "Arc mainnet" : "Arc testnet"} · USDC
        </span>

        {/* Its own row on a phone, where four labels will not fit beside the logo. */}
        <nav
          aria-label="Period"
          className="order-last flex w-full rounded-xl bg-surface-100 p-1 sm:order-none sm:ml-auto sm:w-auto"
        >
          {PERIODS.map((p) => {
            const active = p === period;
            return (
              <Link
                key={p}
                href={periodHref(p)}
                scroll={false}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={`relative flex-1 rounded-lg px-3 py-1.5 text-center text-sm whitespace-nowrap transition-colors duration-200 sm:flex-none ${FOCUS} ${
                  active
                    ? "bg-surface-0 font-medium text-ink-900 shadow-soft"
                    : "text-ink-500 hover:text-ink-900"
                }`}
              >
                {PERIOD_LABEL[p]}
                <PendingHint />
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          popoverTarget={SETTINGS_ID}
          aria-label="Settings"
          className={`ml-auto grid size-9 place-items-center rounded-xl text-ink-500 transition-colors duration-200 hover:bg-surface-100 hover:text-ink-900 active:scale-[0.97] sm:ml-0 ${FOCUS}`}
        >
          <SlidersIcon />
        </button>
      </div>

      {/* A native popover: it closes on Escape or a click outside, and sits
          above everything, with no script and no z-index to manage. Placed by
          hand under the button, since the bar it belongs to never moves. */}
      <div
        id={SETTINGS_ID}
        popover="auto"
        className="fixed inset-auto top-[3.75rem] right-[max(1.25rem,calc((100vw-80rem)/2+2rem))] m-0 w-72 rounded-2xl bg-surface-0 p-5 text-ink-900 shadow-card ring-1 ring-ink-200/70"
      >
        <ThemeSetting />
        <div className="mt-4 border-t border-ink-200/70 pt-4">
          <div className="text-xs text-ink-500">Signed in as</div>
          <div className="mt-0.5 text-sm break-all text-ink-900">{email}</div>
        </div>
      </div>
    </header>
  );
}

function SlidersIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}
