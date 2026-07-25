/**
 * GET /api/resolve/<name> — ENS name to a rehydrated, live manifest.
 *
 * `<name>` may be a bare label (`aave-guard`) or fully qualified
 * (`aave-guard.atlas-apps.eth`).
 *
 * This is the other half of the product thesis. One lookup returns the UI
 * (via the manifest at `contenthash`), the wallet (`addr`), the author and the
 * onchain identity (`agent-registration`) — and the manifest it returns is a
 * *plan*, so the caller re-runs it against live subgraph data. A resolved mini
 * app is live, never a cached screenshot; nothing rendered is stored anywhere.
 *
 * `?verify=only` skips the IPFS fetch and returns just the two-directional
 * binding check, which is the fast path for "is this name safe to fund".
 */
import type { NextRequest } from "next/server";
import { resolveWithReport } from "@/lib/identity/publish";

export const runtime = "nodejs";
export const maxDuration = 60;
// No `export const dynamic` — removed in Next 16 under Cache Components. This
// handler reads `request.nextUrl`, which keeps it dynamic either way.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!name) return Response.json({ error: "missing name" }, { status: 400 });

  try {
    const report = await resolveWithReport(decodeURIComponent(name));

    if (request.nextUrl.searchParams.get("verify") === "only") {
      return Response.json({
        name: report.name,
        address: report.address,
        agenticId: report.agenticId,
        verification: report.verification,
      });
    }

    if (!report.manifest && !report.manifestCid && Object.keys(report.texts).length === 0) {
      return Response.json(
        { error: `${report.name} does not resolve`, name: report.name },
        { status: 404 },
      );
    }

    return Response.json(report, {
      // A manifest is immutable at its CID, but the *name* can be republished.
      // Short cache, revalidated — never long enough to show a stale app.
      headers: { "cache-control": "public, max-age=15, stale-while-revalidate=60" },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
