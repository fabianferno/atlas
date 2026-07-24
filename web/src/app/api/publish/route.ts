/**
 * POST /api/publish — pin, name, mint, register.
 * GET  /api/publish — what is live and what is mocked.
 *
 * Returns the full `PublishReport`, including every ENS record that was
 * written. The Studio renders those verbatim: the demo beat is "here is the
 * name, and here is literally what a resolver will hand back", so the route
 * must not summarise them away.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { zManifest } from "@/lib/contracts/manifest";
import { AGENCY_TIERS } from "@/lib/contracts/manifest";
import { assertLabel, getEnsBackend } from "@/lib/identity/ens";
import { identityStatus, publishWithReport } from "@/lib/identity/publish";

// `node:crypto` (AES-256-GCM, CID hashing) — this cannot run on the edge.
export const runtime = "nodejs";
// A live publish pins, mints, issues and registers; three of those wait on a
// chain. The platform default is often 10s, which is not enough.
export const maxDuration = 120;
// Deliberately NOT `export const dynamic = "force-dynamic"`: Next 16 removes
// that option when Cache Components is enabled. Both handlers take `request`,
// which opts them out of static evaluation under either configuration.

const zBody = z.object({
  manifest: zManifest,
  options: z.object({
    name: z.string(),
    tier: z.enum(AGENCY_TIERS),
    policy: z
      .object({
        wallet: z.string().nullable().optional(),
        maxSpendUsd: z.number().nonnegative().optional(),
        maxPerTxUsd: z.number().nonnegative().optional(),
        allowlist: z.array(z.string()).optional(),
        expiresAt: z.string().datetime().nullable().optional(),
        requireConfirm: z.boolean().optional(),
        killSwitch: z.boolean().optional(),
        halted: z.boolean().optional(),
      })
      .optional(),
    priceUsd: z.number().nonnegative().optional(),
  }),
});

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 });
  }

  const parsed = zBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const report = await publishWithReport(parsed.data.manifest, parsed.data.options);
    return Response.json(report, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Label validation is the caller's mistake; anything else is ours.
    const status = /not a valid mini app label|reserved hyphen|failed validation/.test(message)
      ? 400
      : 500;
    return Response.json({ error: message }, { status });
  }
}

/**
 * What is live and what is mocked.
 *
 * `?name=<label>` additionally reports whether that subname is still free, so
 * the Studio can check availability as the user types rather than failing at
 * the end of a publish.
 */
export async function GET(request: NextRequest) {
  const status = identityStatus();
  const label = request.nextUrl.searchParams.get("name");
  if (!label) return Response.json(status);

  try {
    assertLabel(label);
  } catch (err) {
    return Response.json({
      ...status,
      label,
      valid: false,
      available: false,
      reason: err instanceof Error ? err.message : String(err),
    });
  }

  const backend = getEnsBackend();
  const available = await backend.isAvailable(label).catch(() => true);
  return Response.json({
    ...status,
    label,
    valid: true,
    available,
    name: `${label}.${backend.parent}`,
  });
}
