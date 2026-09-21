import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, readAdminCookie } from "@/lib/admin/session";
import { currentChainNetwork, insertChain, listAllChains } from "@/lib/chains/config";
import { validateNewChain } from "@/lib/chains/validate";
import {
  findProvisionedUserForProbe,
  recordChainWallet,
} from "@/lib/chains/wallets";
import { deriveWalletOnChain } from "@/lib/wallet/circle";
import { raiseAlert } from "@/lib/observability/alerts";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/chains
 *
 * Adds a network tella accepts deposits on. There is no PUT and no DELETE, and
 * that is the design: see migrations/0028_chains.sql, which also refuses both
 * in the database.
 *
 * Because it cannot be taken back, this is stricter than the other admin
 * route, in four ways:
 *
 *   1. The caller must state that they understand it is permanent
 *      (`confirmed: true`). The form asks; the route insists, so a script or a
 *      stale tab cannot skip the question.
 *   2. Same-origin only. The admin cookie is SameSite=Lax, which already keeps
 *      a hostile page from sending it on a POST; the Origin check is a second,
 *      independent reason for the same refusal.
 *   3. Circle is asked before anything is written. A blockchain code is
 *      checked by deriving a wallet on it from a real user's wallet: if Circle
 *      does not recognise the code, nothing is stored and the admin is told.
 *      A typo is therefore an error message, not a row nobody can fix.
 *   4. The address Circle returns must equal the user's existing one, which
 *      deriveWalletOnChain checks.
 *
 * What this cannot verify is that the USDC address is the OFFICIAL one for the
 * chain — nothing Circle exposes lets a caller ask that. The form says so.
 */
export async function POST(request: Request) {
  const jar = await cookies();
  const identity = readAdminCookie(jar.get(ADMIN_COOKIE_NAME)?.value);
  if (!identity) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Cross-origin request refused" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.confirmed !== true) {
    return NextResponse.json(
      { error: "Confirm that you understand adding a network cannot be undone." },
      { status: 400 },
    );
  }

  const network = currentChainNetwork();

  let existing;
  try {
    existing = (await listAllChains()).filter((c) => c.network === network);
  } catch (err) {
    console.error("[admin] chains lookup failed", err);
    return NextResponse.json(
      { error: "Couldn't read the existing networks. Has migration 0028 been applied?" },
      { status: 500 },
    );
  }

  const checked = validateNewChain(body, network, existing);
  if (!checked.ok) {
    return NextResponse.json({ errors: checked.errors }, { status: 422 });
  }
  const input = checked.value;

  // Ask Circle before writing anything.
  let probeUser;
  try {
    probeUser = await findProvisionedUserForProbe();
  } catch (err) {
    console.error("[admin] probe user lookup failed", err);
    return NextResponse.json({ error: "Couldn't look up a wallet to verify with." }, { status: 500 });
  }
  if (!probeUser?.circle_wallet_id || !probeUser.wallet_address) {
    return NextResponse.json(
      {
        error:
          "There is no provisioned wallet to check this network against, and Circle is the only thing that can confirm a network code. Add it once a user has a wallet.",
      },
      { status: 409 },
    );
  }

  let derived;
  try {
    derived = await deriveWalletOnChain(
      probeUser.circle_wallet_id,
      input.blockchain,
      probeUser.wallet_address,
    );
  } catch (err) {
    console.error("[admin] chain probe rejected", { blockchain: input.blockchain, err });
    return NextResponse.json(
      {
        errors: {
          blockchain: `Circle did not accept ${input.blockchain} for wallets like these. Nothing was saved.`,
        },
      },
      { status: 422 },
    );
  }

  let result;
  try {
    result = await insertChain(input, identity.email);
  } catch (err) {
    console.error("[admin] chain insert failed", err);
    return NextResponse.json({ error: "Couldn't save the network." }, { status: 500 });
  }
  if (!result.ok) {
    return NextResponse.json({ error: "That network was just added by someone else." }, { status: 409 });
  }

  // The probe's wallet is a real one; keep it rather than derive it again.
  try {
    await recordChainWallet(probeUser.id, result.chain, derived.walletId, derived.address);
  } catch (err) {
    console.error("[admin] probe wallet not recorded; the backfill job will create it", err);
  }

  raiseAlert({
    kind: "chain_added",
    message: `A network was added: ${input.displayName} (${input.blockchain}). Users will be given wallets on it over the next runs of the chain-wallets job.`,
    context: { blockchain: input.blockchain, network },
    force: true,
  });

  return NextResponse.json({ chain: result.chain }, { status: 201 });
}
