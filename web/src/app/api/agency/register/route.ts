/**
 * Seeds the server-side agency registry from a published manifest.
 *
 * WHY THIS EXISTS. `/api/act` deliberately refuses to accept a policy from the
 * caller — a client that could post its own policy could raise its own
 * spending limit. It reads caps, allowlist and expiry from the server-side
 * registry instead. But mini apps are published client-side today (the store
 * is localStorage), so the server has never seen the manifest and every action
 * would 404 with "unknown mini app".
 *
 * THE TRUST BOUNDARY, stated plainly. This route takes a manifest from the
 * client, so in its current form the policy does originate there. That is
 * honest for a local-first demo and dishonest for anything exposed to the
 * internet. What closes it:
 *
 *   1. Persist the manifest server-side at publish (`/api/publish` already
 *      pins it to IPFS and mints an Agentic ID — the CID is the durable
 *      handle).
 *   2. Register from the pinned CID, not from the request body.
 *   3. Verify the Privy session and check the caller owns the ENS name.
 *
 * Until then the mitigation is first-write-wins: a registered app cannot be
 * re-registered with a different policy. Raising a cap requires the kill
 * switch or a server restart, so a hostile client cannot widen a live grant.
 *
 * WHY THIS ALSO REPORTS. It used to answer with a flat `wallet` string, which
 * was the one field a UI could not safely render on its own: an address with no
 * chain and no enforcement site next to it invites the reader to assume the
 * limits printed beside it are enforced somewhere they are not. So this route
 * now returns the same nested `wallet` + `enforcement` blocks as
 * `GET /api/act?appId=…`, on both branches. One call registers the app and
 * tells the caller which key signs, on which testnet, and — per constraint —
 * whether the chain or this process is what actually stops a bad action.
 * `enforcementReport()` in `lib/agency/wallet.ts` is the single author of that
 * answer and is reused verbatim; nothing here recomputes or summarises it.
 *
 * ONE KEY, EVERY APP — the fact the response cannot hide. `provisionWallet`
 * derives from `AGENT_SESSION_PRIVATE_KEY`, which is process-wide, so the
 * address returned for `aave-guard` is byte-identical to the one returned for
 * `copy-trader-arb`. prd.md §4 P3 and §7 both say "each mini app gets its own
 * wallet"; that is the design, and per-app isolation is not what runs. §8's
 * argument that an ENS name is a safety primitive rests on that isolation, so
 * the shape below carries `sessionKeyAddress` alongside `address` and the UI
 * states the sharing out loud rather than letting a per-app page imply it.
 * Fixing it for real means a key per app, held somewhere this process is not.
 */
import { z } from "zod";
import type { NextRequest } from "next/server";
import { zManifest } from "@/lib/contracts/manifest";
import {
  enforcementReport,
  getApp,
  provisionWallet,
  registerApp,
  type MiniAppWallet,
} from "@/lib/agency/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const zBody = z.object({ manifest: zManifest });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/**
 * The wire shape of "which key signs, and where". Deliberately identical to the
 * `wallet` block `GET /api/act` returns, field for field, so a client can read
 * one type off either route — a second, slightly-different wallet shape is how a
 * UI ends up rendering `kind` without `chainName` and implying mainnet.
 *
 * `address` is the account that gets funded; `sessionKeyAddress` is the key that
 * signs. In `session-eoa` mode they are the same value, and that is worth being
 * able to see rather than inferring from the mode name.
 */
function walletReport(wallet: MiniAppWallet) {
  return {
    address: wallet.address,
    kind: wallet.kind,
    chainId: wallet.chainId,
    chainName: wallet.chainName,
    sessionKeyAddress: wallet.sessionKeyAddress,
    onchainEnforced: wallet.onchainEnforced,
    permissionId: wallet.permissionId,
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: "Body must be JSON" }, 400);
  }

  const parsed = zBody.safeParse(raw);
  if (!parsed.success) {
    return json({ ok: false, error: "Invalid manifest", issues: parsed.error.issues }, 400);
  }

  const { manifest } = parsed.data;
  const appId = manifest.name;

  // First write wins. Re-registering would let a caller widen a live grant.
  //
  // The response is the same shape as a fresh registration on purpose: a caller
  // that has to branch on `alreadyRegistered` to find out what signs would sooner
  // or later read the wrong field on one of the two paths. `alreadyRegistered`
  // stays, because it means something the caller may want to know — the policy
  // now in force is the one from the FIRST manifest, not the one just posted.
  const existing = getApp(appId);
  if (existing) {
    return json({
      ok: true,
      appId,
      alreadyRegistered: true,
      wallet: walletReport(existing.wallet),
      enforcement: enforcementReport(existing.wallet),
    });
  }

  try {
    const wallet = await provisionWallet({
      appId,
      tier: manifest.agency.tier,
      policy: manifest.agency.policy,
    });

    // The data plan is stored alongside the policy, and for the same reason: a
    // stream trigger re-reads its metrics from the server's copy, so the number
    // that decides whether an autonomous app spends is never client-supplied.
    registerApp({
      appId,
      agency: manifest.agency,
      wallet,
      data: manifest.data,
      intent: manifest.intent,
    });

    return json({
      ok: true,
      appId,
      alreadyRegistered: false,
      wallet: walletReport(wallet),
      enforcement: enforcementReport(wallet),
    });
  } catch (error) {
    // provisionWallet refuses mainnet and refuses an incompletely scoped
    // session. Both are correct failures — surface them rather than degrading.
    return json(
      {
        ok: false,
        error: "Could not provision wallet",
        detail: error instanceof Error ? error.message : "unknown",
      },
      422,
    );
  }
}
