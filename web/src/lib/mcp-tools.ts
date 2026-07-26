/**
 * The tools `/api/mcp` advertises.
 *
 * Lifted out of the route so the landing page can print the list without
 * retyping it. That retyping had already gone wrong once in the README, which
 * tabulated five tools and omitted `check_coverage` while its own footer said
 * six. A page that imports this cannot drift from the server.
 *
 * Read-only by design. Nothing here signs or spends — `/api/act` owns the
 * action loop and reads its policy server-side, because an MCP endpoint is a
 * URL strangers point agents at.
 *
 * `as const` is load-bearing: `route.ts` switches on `name` and the literal
 * union is what makes an unhandled tool a compile error rather than a runtime
 * fall-through.
 */
export const MCP_TOOLS = [

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

/** One advertised tool, as `tools/list` returns it. */
export type McpTool = (typeof MCP_TOOLS)[number];
