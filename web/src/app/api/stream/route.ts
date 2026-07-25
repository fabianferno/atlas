/**
 * W2 — THE STREAM ENDPOINT.
 *
 * `GET`  says which mode autonomy is actually running in — Substreams or
 *        polling — so the UI can never claim block-level latency it does not
 *        have. Same discipline as `onchainEnforced`: read the fact, don't
 *        assert it.
 *
 * `POST` runs a BOUNDED subscription: consume N blocks, evaluate triggers on
 *        each, return the summary and the journal.
 *
 * WHY BOUNDED, stated plainly. A production liquidation guard wants a process
 * that stays subscribed for days. A serverless function has a wall-clock limit,
 * so an unbounded subscription here would be a lie that works in `pnpm dev` and
 * dies in production. What ships is a bounded run the UI can call repeatedly
 * (the cursor is committed, so consecutive calls resume where the last stopped
 * and no block is skipped). A long-lived worker is the correct home for this and
 * is not built.
 *
 * What this endpoint will NOT accept from the caller, same as `/api/act`:
 *   - a policy. Read from the server-side registry.
 *   - a metric. The numbers a trigger compares come from re-reading the app's
 *     own data plan server-side (see agency/enrich.ts). A client that could post
 *     `healthFactor` could make an autonomous app trade on demand.
 */
import { z } from "zod";
import type { NextRequest } from "next/server";
import { dataPlanEnrich } from "@/lib/agency/enrich";
import { getJournal } from "@/lib/agency/journal";
import { runStream, streamMode } from "@/lib/agency/stream-runner";
import { ensureDemoApp, getApp } from "@/lib/agency/wallet";
import { NETWORKS } from "@/lib/contracts/manifest";
import {
  DEFAULT_MODULE,
  DEFAULT_SPKG,
  SUBSTREAMS_ENDPOINTS,
  isRetryableStreamError,
  isStreamLive,
  resolveStreamTarget,
} from "@/lib/kit/substreams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A bounded run still needs room for a few block times plus the re-reads. */
export const maxDuration = 60;

const zBody = z.object({
  appId: z.string().min(1).max(64),
  network: z.enum(NETWORKS).default("arbitrum-one"),
  /** Blocks to consume before returning. Bounded by the function's wall clock. */
  blocks: z.number().int().min(1).max(20).default(3),
  /** Cold-start this many blocks behind head. Ignored once a cursor exists. */
  behind: z.number().int().min(0).max(1000).default(10),
  /** Start from head and forget the stored cursor. */
  restart: z.boolean().default(false),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function GET(): Promise<Response> {
  const mode = streamMode();
  return json({
    ok: true,
    ...mode,
    /** True only when a subscription is actually possible. */
    eventDriven: isStreamLive(),
    endpoints: SUBSTREAMS_ENDPOINTS,
    defaultPackage: DEFAULT_SPKG,
    defaultModule: DEFAULT_MODULE,
    // Present tense would overstate it. This handler reports a capability read
    // from configuration; it does not and cannot know whether a run is open, since
    // a run only exists for the seconds POST spends consuming its N blocks.
    note:
      mode.mode === "substreams"
        ? "Triggers re-evaluate once per block while a bounded watch is running. POST here to open one; nothing is subscribed between calls."
        : "Triggers re-evaluate on an interval. Set SUBSTREAMS_API_TOKEN (thegraph.market) for per-block evaluation.",
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
    return json({ ok: false, error: "Invalid request", issues: parsed.error.issues }, 400);
  }
  const body = parsed.data;

  if (!isStreamLive()) {
    // A 409, not a 500: the system is working correctly and is telling you it
    // cannot do the thing you asked for.
    return json(
      {
        ok: false,
        error: "No Substreams token configured",
        ...streamMode(),
        hint: "thegraph.market → Create New Key → API TOKEN, then set SUBSTREAMS_API_TOKEN.",
      },
      409,
    );
  }

  if (body.appId === "demo") await ensureDemoApp("demo");
  const app = getApp(body.appId);
  if (!app) return json({ ok: false, error: `Unknown mini app "${body.appId}"` }, 404);

  const target = resolveStreamTarget({
    network: body.network,
    stream: app.data?.stream ?? null,
  });

  // Only enrich when the server actually holds a data plan for this app. The
  // demo app has none, and inventing metrics for it would be exactly the kind of
  // convenient fiction this endpoint exists to avoid.
  const enrich =
    app.data && app.data.sources.length > 0
      ? dataPlanEnrich({
          appId: app.appId,
          data: app.data,
          tier: app.agency.tier,
          intent: app.intent,
        })
      : undefined;

  try {
    const summary = await runStream({
      appId: app.appId,
      network: body.network,
      stream: app.data?.stream ?? null,
      enrich,
      maxTicks: body.blocks,
      startBlockNum: -body.behind,
      ignoreCursor: body.restart,
      signal: request.signal,
    });

    return json({
      ok: true,
      mode: "substreams",
      target,
      enriched: Boolean(enrich),
      /** Named so a UI cannot mistake "no data plan" for "metrics were zero". */
      enrichmentNote: enrich
        ? "Metrics re-read from the app's own health-checked sources on each block."
        : "No server-side data plan for this app — triggers saw block facts only.",
      summary,
      entries: await getJournal().list(app.appId, 50),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(
      {
        ok: false,
        error: "Subscription failed",
        detail: message,
        retryable: isRetryableStreamError(err),
        target,
        entries: await getJournal().list(app.appId, 20),
      },
      502,
    );
  }
}
