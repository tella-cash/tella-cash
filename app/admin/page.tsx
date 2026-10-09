import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, readAdminCookie } from "@/lib/admin/session";
import { parsePeriod } from "@/lib/analytics/period";
import { loadAnalytics } from "@/lib/analytics/queries";
import { currentChainNetwork, listAllChains } from "@/lib/chains/config";
import { Dashboard } from "./dashboard";
import type { ChainRow } from "./chains-card";

export const dynamic = "force-dynamic";

/**
 * Rendered on the server, so the numbers never travel as a JSON payload a
 * browser extension or a stray script could read, and there is no loading
 * state to design. The /api/admin/stats route exists alongside it for
 * refreshing without a full reload.
 *
 * The period comes from the URL (`?period=week`), so changing it is a
 * navigation, not client state: a view can be bookmarked or sent to someone,
 * and it is still this function that renders it.
 *
 * The cookie is verified here as well as in the proxy. The proxy only
 * checks presence — it runs on the edge without node:crypto — so this is
 * where the signature, the expiry and the allowlist are actually enforced.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const jar = await cookies();
  const raw = jar.get(ADMIN_COOKIE_NAME)?.value;
  const identity = readAdminCookie(raw);

  if (!identity) {
    // A cookie that arrived and failed is a different problem from one that
    // never arrived: expired, signed with a rotated secret, or a sub that is
    // no longer on the allowlist. Worth telling them apart.
    redirect(raw ? "/admin/login?r=rejected" : "/admin/login?r=nocookie");
  }

  // After the redirect above, on purpose: nothing is read from the database
  // for a visitor who is not signed in.
  const data = await loadAnalytics({ period: parsePeriod((await searchParams).period) });

  // Read separately from the analytics, and allowed to fail on its own: an
  // unapplied migration must leave the dashboard's numbers on screen and say
  // what is wrong in the one card that needs it, not take the whole page down.
  const network = currentChainNetwork();
  let chains: ChainRow[] | null = null;
  try {
    chains = (await listAllChains())
      .filter((c) => c.network === network)
      .map((c) => ({
        id: c.id,
        displayName: c.display_name,
        blockchain: c.blockchain,
        usdcAddress: c.usdc_address,
        cctpDomain: c.cctp_domain,
        addedBy: c.added_by,
        createdAt: c.created_at,
      }));
  } catch (err) {
    console.error("[admin] chains failed to load", err);
  }

  return <Dashboard data={data} email={identity.email} chains={chains} network={network} />;
}
