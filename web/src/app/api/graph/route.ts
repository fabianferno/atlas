/**
 * The only path from a browser to The Graph.
 *
 * `GRAPH_API_KEY` and `X402_PRIVATE_KEY` are read inside this process and never
 * serialised into a response. Nothing in `lib/kit` is safe to import from a
 * client component for a live query — it would inline the key into the bundle.
 * Client code calls this route; server code may call the kit directly.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { NETWORKS, SCHEMA_FAMILIES, zSource } from "@/lib/contracts/manifest";
import { fanOutDetailed, fanOutSummary } from "@/lib/kit/fanout";
import { graphQuery, isLive } from "@/lib/kit/gateway";
import { candidateList, refreshSources, resolveSourcesDetailed } from "@/lib/kit/resolver";
import { healthCheckAll, registryCoverage, SOURCE_REGISTRY } from "@/lib/kit/sources";

export const runtime = "nodejs";

const zTransport = z.enum(["gateway", "x402", "mcp"]).default("gateway");
const zSchemas = z.array(z.enum(SCHEMA_FAMILIES)).min(1);
const zNetworks = z.array(z.enum(NETWORKS)).min(1);

/** The subset of PlanResult the data plane actually reads. Accepting a partial
 *  plan means the renderer and the composer can call this before the planner
 *  exists. */
const zPlan = z.object({
  intent: z.string().default(""),
  schemas: z.array(z.enum(SCHEMA_FAMILIES)).default([]),
  networks: z.array(z.enum(NETWORKS)).default([]),
  queries: z.record(z.string(), z.string()).default({}),
  variables: z.record(z.string(), z.unknown()).default({}),
  tier: z.enum(["readonly", "monitor", "autonomous"]).default("readonly"),
  attestationRef: z.string().nullable().default(null),
  model: z.string().default("fixture"),
});

const zBody = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("resolve"),
    schemas: zSchemas,
    networks: zNetworks,
    transport: zTransport,
    maxPerPair: z.number().int().positive().max(20).optional(),
    maxSources: z.number().int().positive().max(90).optional(),
  }),
  z.object({
    action: z.literal("fanout"),
    plan: zPlan,
    /** Omit to resolve from `plan.schemas` × `plan.networks` in the same call —
     *  the one-shot path the Studio uses. */
    sources: z.array(zSource).optional(),
    transport: zTransport,
    maxCostUsd: z.number().positive().max(10).optional(),
    timeoutMs: z.number().int().positive().max(30_000).optional(),
  }),
  z.object({
    action: z.literal("health"),
    sources: z.array(zSource).min(1),
    transport: zTransport,
  }),
  z.object({
    action: z.literal("query"),
    subgraphId: z.string().min(1),
    query: z.string().min(1),
    variables: z.record(z.string(), z.unknown()).default({}),
    transport: zTransport,
    timeoutMs: z.number().int().positive().max(30_000).optional(),
  }),
]);

const NO_STORE = { "cache-control": "no-store" };

/** Registry and liveness. Cheap, no network, safe to poll from the header. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const schemas = url.searchParams.getAll("schema");
  const networks = url.searchParams.getAll("network");

  const parsedSchemas = zSchemas.safeParse(schemas);
  const parsedNetworks = zNetworks.safeParse(networks);

  const candidates =
    parsedSchemas.success && parsedNetworks.success
      ? candidateList(parsedSchemas.data, parsedNetworks.data)
      : null;

  return NextResponse.json(
    {
      live: isLive(),
      x402: isLive("x402"),
      registrySize: SOURCE_REGISTRY.length,
      verified: SOURCE_REGISTRY.filter((s) => s.verification === "verified").length,
      placeholders: SOURCE_REGISTRY.filter((s) => s.verification === "placeholder").length,
      coverage: registryCoverage(),
      candidates,
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400, headers: NO_STORE });
  }

  const parsed = zBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }
  const body = parsed.data;

  try {
    switch (body.action) {
      case "resolve": {
        const resolution = await resolveSourcesDetailed(body.schemas, body.networks, {
          transport: body.transport,
          maxPerPair: body.maxPerPair,
          maxSources: body.maxSources,
        });
        return NextResponse.json(
          {
            ...resolution,
            // The number the demo says out loud.
            summary: {
              live: resolution.sources.length,
              total: resolution.checked.length,
              elapsedMs: resolution.elapsedMs,
            },
          },
          { headers: NO_STORE },
        );
      }

      case "fanout": {
        const plan = body.plan;
        const resolution = body.sources
          ? null
          : await resolveSourcesDetailed(
              plan.schemas.length > 0 ? plan.schemas : [...SCHEMA_FAMILIES],
              plan.networks.length > 0 ? plan.networks : ["arbitrum-one", "optimism", "base"],
              { transport: body.transport },
            );
        const sources = body.sources ?? resolution?.checked ?? [];
        const result = await fanOutDetailed(plan, sources, {
          transport: body.transport,
          maxCostUsd: body.maxCostUsd,
          timeoutMs: body.timeoutMs,
        });
        return NextResponse.json(
          { ...result, summary: fanOutSummary(result), resolution },
          { headers: NO_STORE },
        );
      }

      case "health": {
        const details = await healthCheckAll(body.sources, { transport: body.transport });
        return NextResponse.json(
          {
            details,
            summary: {
              live: details.filter((d) => d.source.healthy).length,
              total: details.length,
            },
          },
          { headers: NO_STORE },
        );
      }

      case "query": {
        const result = await graphQuery({
          subgraphId: body.subgraphId,
          query: body.query,
          variables: body.variables,
          transport: body.transport,
          timeoutMs: body.timeoutMs,
        });
        return NextResponse.json(result, { headers: NO_STORE });
      }
    }
  } catch (err) {
    // Never surface the raw error to the client — a gateway URL carries the key.
    console.error("[api/graph]", err);
    return NextResponse.json(
      { error: "data plane failed", action: body.action },
      { status: 500, headers: NO_STORE },
    );
  }
}
