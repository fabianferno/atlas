/**
 * W11 — the MCP server. Graph Track 1 asks for reusable tooling rather than a
 * single end-user app, and this is the machine-facing half of that.
 *
 * It is also a correctness fix. `endpointsFor()` writes
 * `agent-endpoint[mcp] = <origin>/api/mcp` into every published mini app's ENS
 * records, and on the onchain backend writing that is a transaction. Until this
 * route existed we were advertising a dead endpoint on Sepolia — worse than
 * advertising none, because ENS Track 2 is specifically about an agent being
 * discoverable, and the first thing a judge does with a discovery record is
 * follow it.
 *
 * ## Transport
 *
 * Stateless Streamable HTTP: one JSON-RPC 2.0 message per POST, answered with
 * `application/json`. No session id, no SSE, no server-initiated messages —
 * every tool here is request/response, so a stream would be ceremony. That is
 * an explicitly valid profile of the transport, and it is what makes the route
 * deployable to any serverless target without sticky sessions.
 *
 * Hand-rolled rather than `@modelcontextprotocol/server`, deliberately: adding
 * a dependency to a working install a day before a deadline is a bigger risk
 * than 200 lines of JSON-RPC. The tool bodies call the kit directly, so
 * swapping the transport for the SDK later touches only this file.
 *
 * ## Trust
 *
 * Read-only by design. Nothing here plans a *spend*, signs, or publishes:
 * `/api/act` owns the action loop and reads its policy from the server-side
 * registry, and it must stay that way. An MCP server is an endpoint strangers
 * point agents at, so the blast radius of a prompt-injected tool call has to
 * be "wasted a gateway query", not "moved money".
 */
import { SCHEMA_FAMILIES, NETWORKS, type Network, type SchemaFamily } from "@/lib/contracts/manifest";
import { plan } from "@/lib/kit/planner";
import { compose } from "@/lib/kit/composer";
import { fanOutDetailed } from "@/lib/kit/fanout";
import { registryCoverage } from "@/lib/kit/sources";
import { resolveSourcesDetailed } from "@/lib/kit/resolver";
import { resolveWithReport } from "@/lib/identity/publish";
import { assessCoverage } from "@/lib/coverage/gap";

export const runtime = "nodejs";
export const maxDuration = 120;

const SERVER_INFO = { name: "atlas", version: "1.0.0" };
/** Echoed back to the client when it asks for one we understand. */
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  "2026-07-28",
]);

/* ── JSON-RPC plumbing ───────────────────────────────────────────────────── */

type Id = string | number | null;

const ERR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

function ok(id: Id, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id, result }, { headers: { "cache-control": "no-store" } });
}

function fail(id: Id, code: number, message: string, status = 200): Response {
  return Response.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

/** A tool result. `isError` is how MCP reports a *tool* failure — as opposed to
 *  a protocol failure, which is a JSON-RPC error and means something else. */
function toolText(text: string, isError = false) {
  return { content: [{ type: "text", text }], isError };
}

function jsonText(value: unknown, isError = false) {
  return toolText(JSON.stringify(value, null, 2), isError);
}

/* ── tools ───────────────────────────────────────────────────────────────── */

const TOOLS = [
  {
    name: "list_schemas",
    description:
      "List the standardized subgraph schema families this server can query, with how many health-checked deployments exist per network. Call this first — it tells you which schemas and networks the other tools will accept.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "check_coverage",
    description:
      "Ask whether The Graph can answer a question at all: how many standardized subgraph deployments exist in the schema families the question plans to query, and whether any Substreams package is published for it. Returns a verdict of covered, subgraph-only, substreams-only, uncovered, or unknown, with the reasons behind it. The deployment count is candidates, not a confirmed match — nothing here checks that those deployments index the protocol you asked about, so only a matching Substreams package sets 'covered'. 'uncovered' means the package lookup completed and found nothing; 'unknown' means it did not complete — it failed, timed out, or returned rows that could not be read — so the absence of a package is unproven. 'unknown' is returned whenever that happens, even when subgraph deployments exist; the machine-readable form is the 'substreamsProven' flag. Treat 'unknown' as 'ask again', never as 'nothing exists'. Call this before concluding that data is unavailable — and before building an indexing pipeline, so you do not rebuild something already published.",
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The protocol or activity to check, e.g. 'Hyperliquid vault flows on Arbitrum'.",
        },
      },
      required: ["question"],
      additionalProperties: false,
    },
  },
  {
    name: "plan_mini_app",
    description:
      "Turn a natural-language question about onchain activity into a query plan: which standardized schema families and networks answer it, the GraphQL to run, and the agency tier the question implies. Does not execute anything.",
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "e.g. 'Compare Aave lending markets on Arbitrum and Optimism to DEX liquidity'",
        },
      },
      required: ["question"],
      additionalProperties: false,
    },
  },
  {
    name: "query_graph",
    description:
      "Answer a question with live data: resolve the question to standardized schemas, health-check the deployments, query all healthy ones in parallel across networks, and return the merged rows. Rows carrying impossible USD values are flagged `_suspect` and ranked last rather than dropped.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "Natural-language question about onchain activity." },
        limit: {
          type: "integer",
          description: "Max rows to return (default 25). The full count is always reported.",
          minimum: 1,
          maximum: 200,
        },
      },
      required: ["question"],
      additionalProperties: false,
    },
  },
  {
    name: "build_mini_app",
    description:
      "The whole pipeline: question to a renderable mini app. Plans, fans out across live standardized subgraphs, and composes an A2UI v0.9.1 document whose components are chosen from the SHAPE of the returned data. Returns the document plus the provenance of the run.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "What the mini app should show or watch." },
        includeDocument: {
          type: "boolean",
          description: "Include the full A2UI document. Default true. Set false for just the summary.",
        },
      },
      required: ["question"],
      additionalProperties: false,
    },
  },
  {
    name: "resolve_mini_app",
    description:
      "Resolve a published mini app by ENS name (e.g. 'attested-market-guard.atlas-apps.eth' or just the label). Returns its manifest, its wallet address, its Agentic ID on 0G Chain, and whether the name and the onchain token verify each other in both directions.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "ENS name or bare label of the mini app." },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
] as const;

async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "list_schemas": {
      const coverage = registryCoverage();
      return jsonText({
        schemas: SCHEMA_FAMILIES,
        networks: NETWORKS,
        // Deployment counts per family per network. The point of resolving a
        // schema rather than a subgraph id is that this list is plural.
        coverage,
      });
    }

    case "check_coverage": {
      const question = String(args.question ?? "");
      if (!question.trim()) return toolText("question is required", true);
      // Reuse the planner so the schemas checked are the ones this system would
      // actually query. Checking coverage against a different set than the one
      // the query path uses would make the verdict describe a system nobody runs.
      const planned = await plan({ question });
      const report = await assessCoverage({
        query: question,
        schemas: planned.schemas,
        networks: planned.networks,
      });
      return jsonText(report);
    }

    case "plan_mini_app": {
      const question = String(args.question ?? "");
      if (!question.trim()) return toolText("question is required", true);
      const planned = await plan({ question });
      return jsonText({
        intent: planned.intent,
        schemas: planned.schemas,
        networks: planned.networks,
        tier: planned.tier,
        queries: Object.keys(planned.queries),
        model: planned.model,
        attestationRef: planned.attestationRef,
      });
    }

    case "query_graph": {
      const question = String(args.question ?? "");
      if (!question.trim()) return toolText("question is required", true);
      const limit = Math.min(Math.max(Number(args.limit ?? 25) || 25, 1), 200);

      const planned = await plan({ question });
      const resolution = await resolveSourcesDetailed(planned.schemas, planned.networks);
      const data = await fanOutDetailed(planned, resolution.checked);

      return jsonText({
        question,
        schemas: planned.schemas,
        networks: planned.networks,
        sources: {
          queried: data.sourcesQueried,
          healthy: data.sourcesHealthy,
          // Naming the dead ones is the honest version of "27 of 31 live".
          skipped: data.failures.map((f) => `${f.label}: ${f.reason}`),
        },
        rows: { total: data.rows.length, suspect: data.rowsSuspect, returned: Math.min(limit, data.rows.length) },
        costUsd: data.costUsd,
        elapsedMs: data.elapsedMs,
        data: data.rows.slice(0, limit),
      });
    }

    case "build_mini_app": {
      const question = String(args.question ?? "");
      if (!question.trim()) return toolText("question is required", true);
      const includeDocument = args.includeDocument !== false;

      const planned = await plan({ question });
      const resolution = await resolveSourcesDetailed(planned.schemas, planned.networks);
      const data = await fanOutDetailed(planned, resolution.checked);
      const composed = await compose(planned, data);

      return jsonText({
        intent: planned.intent,
        tier: planned.tier,
        schemas: planned.schemas,
        networks: planned.networks,
        sources: { queried: data.sourcesQueried, healthy: data.sourcesHealthy },
        rows: { total: data.rows.length, suspect: data.rowsSuspect },
        componentsUsed: composed.componentsUsed,
        provenance: {
          model: planned.model,
          compute: planned.attestationRef ? "0g-private-computer" : "local",
          attestationRef: planned.attestationRef,
        },
        ...(includeDocument ? { a2ui: composed.ui } : {}),
      });
    }

    case "resolve_mini_app": {
      const nameArg = String(args.name ?? "");
      if (!nameArg.trim()) return toolText("name is required", true);
      const report = await resolveWithReport(nameArg);
      if (!report.manifest) return toolText(`${nameArg} did not resolve to a mini app`, true);
      return jsonText({
        name: report.name,
        manifestCid: report.manifestCid,
        wallet: report.address,
        agenticId: report.agenticId,
        verification: report.verification,
        endpoints: report.endpoints,
        agentContext: report.agentContext,
        manifest: report.manifest,
      });
    }

    default:
      return toolText(`unknown tool: ${name}`, true);
  }
}

/* ── request handling ────────────────────────────────────────────────────── */

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(null, ERR.parse, "Parse error: body must be JSON", 400);
  }

  // Batches are legal JSON-RPC. Everything this server exposes is a single
  // call, so rejecting a batch clearly beats half-answering one.
  if (Array.isArray(body)) {
    return fail(null, ERR.invalidRequest, "Batch requests are not supported by this server", 400);
  }
  if (typeof body !== "object" || body === null) {
    return fail(null, ERR.invalidRequest, "Invalid Request", 400);
  }

  const msg = body as { jsonrpc?: unknown; id?: Id; method?: unknown; params?: unknown };
  const id: Id = msg.id === undefined ? null : (msg.id as Id);
  const method = typeof msg.method === "string" ? msg.method : "";
  const params = (msg.params ?? {}) as Record<string, unknown>;

  if (msg.jsonrpc !== "2.0" || !method) {
    return fail(id, ERR.invalidRequest, "Invalid Request: expected jsonrpc 2.0 and a method", 400);
  }

  // Notifications carry no id and must not be answered with a result body.
  if (method.startsWith("notifications/")) {
    return new Response(null, { status: 202 });
  }

  try {
    switch (method) {
      case "initialize": {
        const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
        return ok(id, {
          // Echo the client's version when we understand it, so a newer client
          // is not forced down to ours over a difference that does not matter
          // for a stateless tools-only server.
          protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.has(asked) ? asked : DEFAULT_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            "Mini apps over live standardized subgraph data. Call list_schemas to see what is queryable, " +
            "check_coverage to find out whether anything indexes a protocol at all — call it before you " +
            "tell a user the data does not exist, and before building an indexing pipeline — plan_mini_app " +
            "to see how a question resolves without executing it, query_graph to answer a question with " +
            "live onchain data, build_mini_app to get a renderable A2UI document, and resolve_mini_app to " +
            "look up a published app by its ENS name. Read-only: nothing here signs a transaction or spends.",
        });
      }

      case "ping":
        return ok(id, {});

      case "tools/list":
        return ok(id, { tools: TOOLS });

      case "tools/call": {
        const name = typeof params.name === "string" ? params.name : "";
        if (!name) return fail(id, ERR.invalidParams, "tools/call requires a tool name");
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        if (!TOOLS.some((t) => t.name === name)) {
          return fail(id, ERR.invalidParams, `Unknown tool: ${name}`);
        }
        return ok(id, await callTool(name, args));
      }

      // Declared unsupported in capabilities, so a spec-following client will
      // not call these. Answer honestly if one does anyway.
      case "resources/list":
      case "prompts/list":
        return fail(id, ERR.methodNotFound, `${method} is not supported by this server`);

      default:
        return fail(id, ERR.methodNotFound, `Unknown method: ${method}`);
    }
  } catch (err) {
    // A thrown tool is a server fault, not a protocol violation. Say which.
    const message = err instanceof Error ? err.message : String(err);
    return fail(id, ERR.internal, `Internal error: ${message}`);
  }
}

/** Discovery convenience: a GET describes the server rather than 405-ing, so a
 *  human following `agent-endpoint[mcp]` from an ENS record sees what it is. */
export async function GET(): Promise<Response> {
  return Response.json(
    {
      ...SERVER_INFO,
      transport: "streamable-http (stateless)",
      protocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
      usage: "POST JSON-RPC 2.0 to this URL. Start with an `initialize` request.",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
