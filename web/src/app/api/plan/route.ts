/**
 * POST /api/plan — natural language → PlanResult.
 *
 * Body: `{ question: string, hints?: { networks?, schemas?, tier? } }`
 * 200:  a `PlanResult` (contracts/api.ts) plus a `_meta` block describing
 *       which compute backend actually ran.
 *
 * Works with no API keys: the planner falls back to its rules engine and
 * reports `model: "atlas-deterministic-stub"`.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { plan, zPlanInput } from "@/lib/kit/planner";
import { getInferenceConfig } from "@/lib/kit/inference";

// Planning is inference — never cached, never prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsed = zPlanInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
      { status: 400 },
    );
  }

  const started = Date.now();
  try {
    const result = await plan(parsed.data);
    const cfg = getInferenceConfig();
    return NextResponse.json(
      {
        ...result,
        _meta: {
          compute: cfg.live ? cfg.backend : "local",
          live: cfg.live,
          elapsedMs: Date.now() - started,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Planning failed.", detail: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}

/** Capability probe — lets the Studio show which backend is wired. */
export async function GET(): Promise<NextResponse> {
  const cfg = getInferenceConfig();
  return NextResponse.json(
    { ok: true, compute: cfg.live ? cfg.backend : "local", model: cfg.model, live: cfg.live },
    { headers: { "cache-control": "no-store" } },
  );
}
