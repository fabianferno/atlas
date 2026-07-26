/**
 * GET /api/registry/published — which names are actually published.
 *
 * Reads `MiniAppRegistry` on 0G and returns the entries issued under the
 * currently configured ENS parent. This is the list the Registry page's
 * "Published names" strip renders; it used to be a constant in the component,
 * which had drifted from both the contract and
 * contracts/deployments/ens-sepolia.json.
 *
 * `total` is the WHOLE registry and `retired` is how many entries name a
 * different parent — six, at time of writing, all under `graphminis.eth` from
 * before the Atlas rebrand. They are reported rather than dropped silently: a
 * filtered list presented as the whole is the same class of error this route
 * exists to fix.
 *
 * There is deliberately no fallback. If the chain does not answer, this returns
 * 502 and the caller renders nothing — a hardcoded list served during an
 * outage is a lie told at exactly the moment nobody can check it.
 */
import type { NextRequest } from "next/server";
import { agenticIdConfig } from "@/lib/identity/agentic-id";
import { getEnsBackend } from "@/lib/identity/ens";
import { listRegisteredApps, selectUnderParent } from "@/lib/identity/published";

// viem over node http; not edge-safe for the same reasons as /api/publish.
export const runtime = "nodejs";
// Deliberately NOT `export const dynamic = "force-dynamic"`: Next 16 removes
// that option when Cache Components is enabled. Taking `request` opts this
// handler out of static evaluation under either configuration.

export async function GET(request: NextRequest) {
  void request;

  const parent = getEnsBackend().parent;
  const { registryAddress, chainId } = agenticIdConfig();

  try {
    const all = await listRegisteredApps();
    const { apps, total, retired } = selectUnderParent(all, parent);
    return Response.json(
      { parent, registry: registryAddress, chainId, total, retired, apps },
      // The point of this strip is that the list is read, not remembered.
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err), parent },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
