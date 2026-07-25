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
 */
import { z } from "zod";
import type { NextRequest } from "next/server";
import { zManifest } from "@/lib/contracts/manifest";
import { getApp, provisionWallet, registerApp } from "@/lib/agency/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const zBody = z.object({ manifest: zManifest });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
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
  const existing = getApp(appId);
  if (existing) {
    return json({
      ok: true,
      appId,
      alreadyRegistered: true,
      wallet: existing.wallet.address,
      kind: existing.wallet.kind,
      onchainEnforced: existing.wallet.onchainEnforced,
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
      wallet: wallet.address,
      kind: wallet.kind,
      onchainEnforced: wallet.onchainEnforced,
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
