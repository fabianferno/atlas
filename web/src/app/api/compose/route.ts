/**
 * POST /api/compose — plan + fan-out data → an A2UI v0.9.1 document.
 *
 * Body: `{ plan: PlanResult, data: FanOutResult }`
 * 200:  a `ComposeResult` (contracts/api.ts) plus a `_meta.validation` block.
 *
 * `data` may be omitted or empty — the composer still returns a valid
 * document, which is what lets the renderer be built before the data plane
 * exists.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { FanOutResult } from "@/lib/contracts/api";
import { compose, zComposeInput } from "@/lib/kit/composer";
import { validateDocument } from "@/lib/kit/a2ui";
import { getInferenceConfig } from "@/lib/kit/inference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_DATA: FanOutResult = {
  rows: [],
  bySchema: {},
  sourcesQueried: 0,
  sourcesHealthy: 0,
  sourcesFailed: [],
  costUsd: 0,
  elapsedMs: 0,
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const withDefaults =
    typeof body === "object" && body !== null && !("data" in body)
      ? { ...(body as Record<string, unknown>), data: EMPTY_DATA }
      : body;

  const parsed = zComposeInput.safeParse(withDefaults);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
      { status: 400 },
    );
  }

  const started = Date.now();
  try {
    const result = await compose(parsed.data.plan, parsed.data.data);
    const validation = validateDocument(result.ui);
    const cfg = getInferenceConfig();
    return NextResponse.json(
      {
        ...result,
        _meta: {
          compute: cfg.live ? cfg.backend : "local",
          live: cfg.live,
          elapsedMs: Date.now() - started,
          validation: { valid: validation.valid, issues: validation.issues },
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Compose failed.", detail: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
