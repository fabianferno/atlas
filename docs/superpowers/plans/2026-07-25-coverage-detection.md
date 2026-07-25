# Coverage Detection Implementation Plan (Phase 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the system able to say "nothing on The Graph covers this" and prove it, and stop Substreams verification from leaking its session slot.

**Architecture:** A registry client queries substreams.dev's public search API. A gap detector combines that with the existing standardized-subgraph deployment counts to produce a single `CoverageReport`. An MCP tool exposes it. Separately, `streamEvents` is fixed to close its HTTP/2 session when a consumer stops early, because every later phase verifies by streaming and the FREE tier allows only two concurrent sessions.

**Tech Stack:** TypeScript, Next.js 16 (App Router), Zod, `@substreams/core`, and the repository's dependency-free test harness (`src/lib/agency/harness.test.ts`).

## Global Constraints

- **No new test runner and no lockfile change.** Tests use `src/lib/agency/harness.test.ts` and run via `cd web && pnpm dlx tsx src/lib/agency/all.test.ts`. Rationale is documented at the top of that harness file.
- **Next.js in this repo is not the Next.js you know.** `web/AGENTS.md` requires reading the relevant guide in `node_modules/next/dist/docs/` before writing App Router code.
- `src/lib/kit/substreams.ts` is **node-only** (HTTP/2 transport). Never import it from a client component.
- `src/app/api/mcp/route.ts` is a dispatcher at 364 lines. New tools add a `TOOLS` entry and a `case` — logic lives in `src/lib/coverage/`.
- Untrusted values from the network are compared, never interpreted. Follow the existing `plainify` posture in `kit/substreams.ts:231`.
- Every file gets a header comment explaining *why* it exists, matching the prose style of `kit/substreams.ts` and `agency/stream-runner.ts`.

---

## File Structure

| File | Responsibility |
|---|---|
| `web/src/lib/coverage/registry.ts` (create) | substreams.dev registry search. Defensive parsing. Injectable fetch. |
| `web/src/lib/coverage/registry.test.ts` (create) | The three documented parse traps + rate limiting. |
| `web/src/lib/coverage/gap.ts` (create) | `registryCoverage()` + registry search → `CoverageReport`. |
| `web/src/lib/coverage/gap.test.ts` (create) | Four verdicts, no network. |
| `web/src/lib/kit/substreams.ts` (modify) | Close the session on early exit; add a `streamBlocksImpl` test seam. |
| `web/src/lib/kit/substreams-leak.test.ts` (create) | Proves the session aborts when a consumer breaks early. |
| `web/scripts/substreams-verify.ts` (modify) | Exit explicitly instead of only setting `process.exitCode`. |
| `web/src/lib/agency/all.test.ts` (modify) | Import the three new test modules. |
| `web/src/app/api/mcp/route.ts` (modify) | Add the `check_coverage` tool. |

---

### Task 1: Registry client

**Files:**
- Create: `web/src/lib/coverage/registry.ts`
- Test: `web/src/lib/coverage/registry.test.ts`
- Modify: `web/src/lib/agency/all.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `searchPackages(options: SearchOptions): Promise<RegistrySearch>`, `RegistryPackage`, `RegistrySearch`, `RegistryRateLimitError`, `REGISTRY_URL`.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/coverage/registry.test.ts`:

```ts
/**
 * The substreams.dev registry is proto3 JSON: default-valued and absent fields
 * do not appear at all. Every trap below is documented upstream and every one
 * of them would otherwise surface as "this protocol has no coverage" — which is
 * the exact claim this module exists to make truthfully.
 */
import { assert, assertEqual, assertRejects, describe, itAsync } from "../agency/harness.test";
import { RegistryRateLimitError, searchPackages } from "./registry";

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("registry search", () => {
  itAsync("treats a bare {} as zero results, not a crash", async () => {
    const result = await searchPackages({ query: "nothing", fetchImpl: async () => jsonResponse({}) });
    assertEqual(result.packages.length, 0, "zero results");
    assertEqual(result.hasMore, false, "no more pages");
  });

  itAsync("treats an absent hasMore as done", async () => {
    const result = await searchPackages({
      query: "uniswap",
      fetchImpl: async () =>
        jsonResponse({ packages: [{ name: "uniswap_v3", slug: "uniswap-v3", reference: "uniswap-v3@v0.1.0", spkg: "https://spkg.io/v1/packages/uniswap-v3/v0.1.0" }] }),
    });
    assertEqual(result.hasMore, false, "missing hasMore means done");
    assertEqual(result.packages.length, 1, "one package");
  });

  itAsync("nulls omitted fields rather than inventing empty strings", async () => {
    const result = await searchPackages({
      query: "ethereum-common",
      fetchImpl: async () =>
        jsonResponse({ packages: [{ name: "ethereum_common", slug: "ethereum-common", reference: "ethereum-common@v0.3.3", spkg: "https://spkg.io/v1/packages/ethereum-common/v0.3.3" }] }),
    });
    const pkg = result.packages[0];
    assertEqual(pkg.network, null, "network omitted upstream");
    assertEqual(pkg.organization, null, "organization omitted upstream");
    assertEqual(pkg.downloads, 0, "downloads omitted means zero");
  });

  itAsync("surfaces a 429 as a typed error carrying Retry-After", async () => {
    await assertRejects(
      () =>
        searchPackages({
          query: "aave",
          fetchImpl: async () => jsonResponse({}, { status: 429, headers: { "retry-after": "12" } }),
        }),
      "429 must reject",
    );
    try {
      await searchPackages({
        query: "aave",
        fetchImpl: async () => jsonResponse({}, { status: 429, headers: { "retry-after": "12" } }),
      });
    } catch (err) {
      assert(err instanceof RegistryRateLimitError, "typed rate-limit error");
      assertEqual((err as RegistryRateLimitError).retryAfterSec, 12, "Retry-After honored");
    }
  });

  itAsync("sends the query and page size the API documents", async () => {
    let seen = "";
    await searchPackages({
      query: "hyperliquid",
      pageSize: 5,
      fetchImpl: async (url) => {
        seen = String(url);
        return jsonResponse({});
      },
    });
    assert(seen.includes("query=hyperliquid"), `query param present: ${seen}`);
    assert(seen.includes("page_size=5"), `page_size param present: ${seen}`);
  });
});
```

Register it by modifying `web/src/lib/agency/all.test.ts` — add after the `import "../kit/shapes.test";` line:

```ts
import "../coverage/registry.test";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && pnpm dlx tsx src/lib/agency/all.test.ts`
Expected: FAIL — `Cannot find module './registry'`.

- [ ] **Step 3: Write the implementation**

Create `web/src/lib/coverage/registry.ts`:

```ts
/**
 * SUBSTREAMS.DEV REGISTRY SEARCH.
 *
 * Before this system offers to spend four minutes building an indexing pipeline,
 * it has to be sure one does not already exist. That check is a single public,
 * unauthenticated GET — and getting its parsing wrong is worse than not checking
 * at all, because a mis-parsed response reads as "no coverage" and sends the
 * agent off to rebuild something that was already published.
 *
 * Three parsing rules, all documented upstream, all load-bearing:
 *
 *   1. Zero results is `{}`. Not `{"packages": []}`. A naive `body.packages.length`
 *      throws on the single most common response this module will ever see.
 *   2. `hasMore` is ABSENT when there are no more pages, never `false`.
 *   3. Omitted means absent, not empty. `ethereum-common` ships no `network`
 *      field at all. Defaulting it to `""` would make it look like a package
 *      that declared an empty network.
 *
 * The API is rate-limited per IP and answers 429 with `Retry-After`. That is a
 * typed error here rather than an empty result, because "slow down" and "nothing
 * exists" must never collapse into the same value.
 */

export const REGISTRY_URL = "https://substreams.dev/v1/registry/packages";

/** One published package. Fields the upstream API may omit are nullable. */
export interface RegistryPackage {
  name: string;
  slug: string;
  /** `uniswap-v3@v0.1.0` — the human-quotable form. */
  reference: string;
  /** Fetchable `.spkg` URL. This is what a manifest's `data.stream` needs. */
  spkg: string;
  latestVersion: string | null;
  network: string | null;
  organization: string | null;
  downloads: number;
}

export interface RegistrySearch {
  packages: RegistryPackage[];
  hasMore: boolean;
}

export class RegistryRateLimitError extends Error {
  constructor(readonly retryAfterSec: number) {
    super(`substreams.dev registry rate-limited; retry after ${retryAfterSec}s`);
    this.name = "RegistryRateLimitError";
  }
}

export interface SearchOptions {
  query: string;
  network?: string;
  pageSize?: number;
  /** Injectable for tests. Production uses global fetch. */
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function packageFrom(raw: unknown): RegistryPackage | null {
  if (raw === null || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const name = str(row.name);
  const spkg = str(row.spkg);
  // A package with no name or no fetchable artifact cannot be consumed, so it is
  // not a candidate — dropping it is more honest than surfacing a broken row.
  if (!name || !spkg) return null;

  const org = row.organization;
  const orgSlug =
    org !== null && typeof org === "object" ? str((org as Record<string, unknown>).slug) : null;

  return {
    name,
    slug: str(row.slug) ?? name,
    reference: str(row.reference) ?? name,
    spkg,
    latestVersion: str(row.latestVersion),
    network: str(row.network),
    organization: orgSlug,
    downloads: typeof row.downloads === "number" ? row.downloads : 0,
  };
}

/**
 * Search the registry. Never throws on "nothing found" — that is a legitimate,
 * expected answer and the whole reason this module exists.
 */
export async function searchPackages(options: SearchOptions): Promise<RegistrySearch> {
  const doFetch = options.fetchImpl ?? fetch;
  const url = new URL(REGISTRY_URL);
  url.searchParams.set("query", options.query);
  url.searchParams.set("page_size", String(options.pageSize ?? 24));
  if (options.network) url.searchParams.set("network", options.network);

  const response = await doFetch(url.toString(), { signal: options.signal });

  if (response.status === 429) {
    const header = response.headers.get("retry-after");
    const parsed = Number.parseInt(header ?? "", 10);
    throw new RegistryRateLimitError(Number.isFinite(parsed) ? parsed : 30);
  }
  if (!response.ok) {
    throw new Error(`substreams.dev registry returned ${response.status} ${response.statusText}`);
  }

  const body: unknown = await response.json();
  const root = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rawPackages = Array.isArray(root.packages) ? root.packages : [];

  return {
    packages: rawPackages.map(packageFrom).filter((p): p is RegistryPackage => p !== null),
    // Absent means done. Only an explicit `true` continues.
    hasMore: root.hasMore === true,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && pnpm dlx tsx src/lib/agency/all.test.ts`
Expected: PASS — count rises from 128 to 133.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/coverage/registry.ts web/src/lib/coverage/registry.test.ts web/src/lib/agency/all.test.ts
git commit -m "Ask the registry before building what already exists"
```

---

### Task 2: Gap detector

**Files:**
- Create: `web/src/lib/coverage/gap.ts`
- Test: `web/src/lib/coverage/gap.test.ts`
- Modify: `web/src/lib/agency/all.test.ts`

**Interfaces:**
- Consumes: `searchPackages`, `RegistryPackage` from Task 1. `registryCoverage()` from `src/lib/kit/sources.ts:222`, which returns `Record<SchemaFamily, Partial<Record<Network, number>>>`.
- Produces: `assessCoverage(options: AssessOptions): Promise<CoverageReport>`, `CoverageReport`, `CoverageVerdict`.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/coverage/gap.test.ts`:

```ts
/**
 * The verdict is the thing the agent acts on, so each of the four states needs
 * to be reachable and distinguishable. "Uncovered" is the only one that may
 * trigger a build, and reaching it wrongly means either wasted work or a silent
 * refusal to answer a question we could have answered.
 */
import { assert, assertEqual, describe, itAsync } from "../agency/harness.test";
import { assessCoverage } from "./gap";

const NO_PACKAGES = async () => new Response(JSON.stringify({}), { headers: { "content-type": "application/json" } });
const ONE_PACKAGE = async () =>
  new Response(
    JSON.stringify({
      packages: [{ name: "aave_v3", slug: "aave-v3", reference: "aave-v3@v0.1.0", spkg: "https://spkg.io/v1/packages/aave-v3/v0.1.0" }],
    }),
    { headers: { "content-type": "application/json" } },
  );

describe("coverage assessment", () => {
  itAsync("reports covered when a standardized family has deployments", async () => {
    const report = await assessCoverage({
      query: "aave lending",
      schemas: ["lending-cdp@3.1.0"],
      networks: ["arbitrum-one"],
      fetchImpl: ONE_PACKAGE,
    });
    assertEqual(report.verdict, "covered", "subgraphs and a package both exist");
    assert(report.covered, "covered flag");
  });

  itAsync("reports substreams-only when no standardized family matches", async () => {
    const report = await assessCoverage({
      query: "aave lending",
      schemas: [],
      networks: ["arbitrum-one"],
      fetchImpl: ONE_PACKAGE,
    });
    assertEqual(report.verdict, "substreams-only", "a package exists, no subgraph does");
    assert(report.covered, "a package is coverage");
  });

  itAsync("reports subgraph-only when the registry has nothing", async () => {
    const report = await assessCoverage({
      query: "aave lending",
      schemas: ["lending-cdp@3.1.0"],
      networks: ["arbitrum-one"],
      fetchImpl: NO_PACKAGES,
    });
    assertEqual(report.verdict, "subgraph-only", "subgraphs exist, no package does");
  });

  itAsync("reports uncovered, with reasons, when neither exists", async () => {
    const report = await assessCoverage({
      query: "hyperliquid vault flows",
      schemas: [],
      networks: ["arbitrum-one"],
      fetchImpl: NO_PACKAGES,
    });
    assertEqual(report.verdict, "uncovered", "nothing indexes this");
    assertEqual(report.covered, false, "not covered");
    assert(report.reasons.length >= 2, "says what it checked, not just the verdict");
    assert(
      report.reasons.some((r) => r.includes("hyperliquid")),
      `names the subject it searched for: ${report.reasons.join(" | ")}`,
    );
  });

  itAsync("counts deployments per network rather than asserting a total", async () => {
    const report = await assessCoverage({
      query: "lending",
      schemas: ["lending-cdp@3.1.0"],
      networks: ["arbitrum-one", "optimism"],
      fetchImpl: NO_PACKAGES,
    });
    assert(report.subgraph.deployments > 0, "some deployments exist in the registry");
    assert(
      Object.keys(report.subgraph.byNetwork).length > 0,
      "attributed per network, because coverage is not uniform across chains",
    );
  });
});
```

Register it in `web/src/lib/agency/all.test.ts`:

```ts
import "../coverage/gap.test";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && pnpm dlx tsx src/lib/agency/all.test.ts`
Expected: FAIL — `Cannot find module './gap'`.

- [ ] **Step 3: Write the implementation**

Create `web/src/lib/coverage/gap.ts`:

```ts
/**
 * IS THERE COVERAGE, AND HOW DO WE KNOW.
 *
 * This system's premise is that resolving a standardized schema beats resolving
 * a subgraph id, because it answers questions nobody anticipated. That premise
 * has an edge: a protocol nobody has indexed. At that edge the honest options
 * are to say so, or to build the coverage — and both require first establishing
 * the absence rather than assuming it.
 *
 * Two independent lookups, deliberately not collapsed into one number:
 *
 *   SUBGRAPH    how many standardized deployments exist for the requested
 *               families and networks, from the local registry.
 *   SUBSTREAMS  whether any published package matches, from substreams.dev.
 *
 * They stay separate because the remedies differ. A package but no subgraph
 * means stream it. A subgraph but no package means query it. Neither means the
 * agent has something to build. Collapsing them to a boolean would throw away
 * the one distinction that decides what happens next.
 *
 * `reasons` exists so the verdict is quotable. "No coverage" with nothing behind
 * it is indistinguishable from a lookup that failed.
 */
import type { Network, SchemaFamily } from "@/lib/contracts/manifest";
import { registryCoverage } from "@/lib/kit/sources";
import { searchPackages, type RegistryPackage } from "./registry";

export type CoverageVerdict = "covered" | "subgraph-only" | "substreams-only" | "uncovered";

export interface CoverageReport {
  /** What was searched for. Echoed so a report is self-describing. */
  subject: string;
  subgraph: {
    deployments: number;
    byNetwork: Partial<Record<Network, number>>;
  };
  substreams: {
    packages: RegistryPackage[];
  };
  /** True when anything at all indexes this today. */
  covered: boolean;
  verdict: CoverageVerdict;
  /** What was checked and what came back, in order. */
  reasons: string[];
}

export interface AssessOptions {
  /** Free text describing the protocol or activity. Used as the registry query. */
  query: string;
  schemas: readonly SchemaFamily[];
  networks: readonly Network[];
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export async function assessCoverage(options: AssessOptions): Promise<CoverageReport> {
  const reasons: string[] = [];

  const coverage = registryCoverage();
  const byNetwork: Partial<Record<Network, number>> = {};
  let deployments = 0;
  for (const schema of options.schemas) {
    const perNetwork = coverage[schema];
    if (!perNetwork) continue;
    for (const network of options.networks) {
      const count = perNetwork[network] ?? 0;
      if (count === 0) continue;
      byNetwork[network] = (byNetwork[network] ?? 0) + count;
      deployments += count;
    }
  }

  reasons.push(
    options.schemas.length === 0
      ? "No standardized schema family matched the request."
      : `Standardized deployments for ${options.schemas.join(", ")} on ${options.networks.join(", ")}: ${deployments}.`,
  );

  // A registry outage must not be reported as absence. If the lookup itself
  // fails, say that instead — the difference decides whether we build.
  let packages: RegistryPackage[] = [];
  let registryFailed = false;
  try {
    const search = await searchPackages({
      query: options.query,
      pageSize: 10,
      fetchImpl: options.fetchImpl,
      signal: options.signal,
    });
    packages = search.packages;
    reasons.push(
      packages.length === 0
        ? `substreams.dev has no published package matching "${options.query}".`
        : `substreams.dev has ${packages.length} package(s) matching "${options.query}": ${packages.map((p) => p.reference).join(", ")}.`,
    );
  } catch (err) {
    registryFailed = true;
    reasons.push(
      `substreams.dev lookup FAILED for "${options.query}" (${err instanceof Error ? err.message : String(err)}) — absence of packages is unproven.`,
    );
  }

  const hasSubgraph = deployments > 0;
  const hasPackage = packages.length > 0;

  const verdict: CoverageVerdict = hasSubgraph
    ? hasPackage
      ? "covered"
      : "subgraph-only"
    : hasPackage
      ? "substreams-only"
      : "uncovered";

  if (verdict === "uncovered" && registryFailed) {
    reasons.push("Treating this as uncovered would be a guess. Re-run the registry lookup first.");
  }

  return {
    subject: options.query,
    subgraph: { deployments, byNetwork },
    substreams: { packages },
    covered: hasSubgraph || hasPackage,
    verdict,
    reasons,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && pnpm dlx tsx src/lib/agency/all.test.ts`
Expected: PASS — count rises to 138.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/coverage/gap.ts web/src/lib/coverage/gap.test.ts web/src/lib/agency/all.test.ts
git commit -m "Establish the absence of coverage instead of assuming it"
```

---

### Task 3: Close the leaked Substreams session

**Files:**
- Modify: `web/src/lib/kit/substreams.ts:206-219` (options), `:303-373` (generator body)
- Create: `web/src/lib/kit/substreams-leak.test.ts`
- Modify: `web/scripts/substreams-verify.ts:305-308`
- Modify: `web/src/lib/agency/all.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `StreamTicksOptions.streamBlocksImpl?: StreamBlocksFn` — a test seam matching the existing `loadPackage` seam on the same interface.

**Context for the implementer.** On 2026-07-25 two orphaned processes were found holding `ESTABLISHED` connections to `arb-one.streamingfast.io` three and four hours after their runs had printed results and finished. The Graph Market FREE tier allows **2 concurrent sessions**, so those two orphans consumed the entire allowance and every subsequent run failed with `resource_exhausted`. Cause: when a consumer stops iterating early, the generator's `finally` clears a timer but never aborts the call, so the HTTP/2 session stays open and keeps the Node event loop alive.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/kit/substreams-leak.test.ts`:

```ts
/**
 * A verify run that finishes must release its session.
 *
 * The FREE tier allows two concurrent Substreams sessions. A run that holds its
 * session after the consumer has stopped reading does not fail loudly — it
 * silently spends one of the two slots until the process is killed, and the
 * failure lands on whoever streams next. That is why this is a test and not a
 * comment.
 */
import { Binary, Module, Modules, Package } from "@substreams/core/proto";
import { assert, describe, itAsync } from "../agency/harness.test";
import { streamEvents, type StreamTarget } from "./substreams";

const TARGET: StreamTarget = {
  endpoint: "https://arb-one.streamingfast.io",
  spkg: "https://spkg.io/streamingfast/ethereum-explorer-v0.1.2.spkg",
  module: "map_block_meta",
  network: "arbitrum-one",
};

/**
 * The smallest package `createRegistry` and `createRequest` both accept.
 * `protoFiles: []` matters — `topoSort` iterates it and throws on undefined —
 * and the module needs a binary index that resolves, because `createRequest`
 * walks the real module graph. Verified against @substreams/core 0.17.
 */
function fakePackage(): Package {
  return new Package({
    protoFiles: [],
    modules: new Modules({
      binaries: [new Binary({ type: "wasm/rust-v1", content: new Uint8Array() })],
      modules: [
        new Module({
          name: "map_block_meta",
          binaryIndex: 0,
          binaryEntrypoint: "map_block_meta",
          initialBlock: 0n,
          kind: { case: "kindMap", value: { outputType: "proto:test.v1.Out" } },
          inputs: [{ input: { case: "source", value: { type: "sf.ethereum.type.v2.Block" } } }],
          output: { type: "proto:test.v1.Out" },
        }),
      ],
    }),
  });
}

/** A response sequence shaped like the real one: a session, then data forever. */
function fakeResponses() {
  let n = 0;
  return {
    async *[Symbol.asyncIterator]() {
      while (true) {
        n += 1;
        yield {
          message: {
            case: "blockScopedData" as const,
            value: {
              clock: { number: BigInt(1000 + n), id: `hash${n}`, timestamp: undefined },
              cursor: `cursor${n}`,
              finalBlockHeight: BigInt(900),
            },
          },
        };
      }
    },
  };
}

describe("substreams session lifetime", () => {
  itAsync("aborts the call when the consumer stops reading", async () => {
    process.env.SUBSTREAMS_API_TOKEN ??= "test-token";
    let captured: AbortSignal | undefined;

    const events = streamEvents({
      target: TARGET,
      loadPackage: async () => fakePackage(),
      streamBlocksImpl: (_transport, _request, opts) => {
        captured = opts?.signal;
        return fakeResponses() as never;
      },
    });

    // Consume exactly one event, then walk away — the maxTicks case.
    for await (const _event of events) break;

    assert(captured !== undefined, "the call received a signal");
    assert(captured!.aborted, "the session is aborted once the consumer stops reading");
  });
});
```

Register it in `web/src/lib/agency/all.test.ts`:

```ts
import "../kit/substreams-leak.test";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && pnpm dlx tsx src/lib/agency/all.test.ts`
Expected: FAIL — either `streamBlocksImpl` is not a known option (TypeScript) or the final assertion fails with "the session is aborted once the consumer stops reading".

- [ ] **Step 3: Add the test seam**

In `web/src/lib/kit/substreams.ts`, add this type above `StreamTicksOptions` (near line 206):

```ts
/**
 * The streaming call, injectable. Mirrors the existing `loadPackage` seam: the
 * session-lifetime test must observe the abort signal without opening a socket.
 */
export type StreamBlocksFn = (
  transport: ReturnType<typeof createConnectTransport>,
  request: ReturnType<typeof createRequest>,
  options?: { signal?: AbortSignal },
) => AsyncIterable<Awaited<ReturnType<typeof streamBlocks>> extends AsyncIterable<infer R> ? R : never>;
```

Then add this field to `StreamTicksOptions`, directly after the existing `loadPackage` field:

```ts
  /** Injectable for tests; defaults to `@substreams/core`'s `streamBlocks`. */
  streamBlocksImpl?: StreamBlocksFn;
```

- [ ] **Step 4: Close the session**

In `web/src/lib/kit/substreams.ts`, replace the `finally` block of `streamEvents` (currently lines 370-373):

```ts
  } finally {
    clearTimeout(firstTickTimer);
    options.signal?.removeEventListener("abort", onOuterAbort);
  }
```

with:

```ts
  } finally {
    clearTimeout(firstTickTimer);
    options.signal?.removeEventListener("abort", onOuterAbort);
    // Release the session. A consumer that stops early — `maxTicks` reached, an
    // error upstream — has already finalized the inner iterator, but the HTTP/2
    // session survives that and keeps both the socket and the event loop alive.
    // The FREE tier allows two concurrent sessions, so a leaked one is a slot
    // the next run does not get. Aborting a call that already finished is a
    // no-op, which is why this is unconditional.
    deadline.abort();
  }
```

And in the same function, change the `consume()` call site to use the seam. Replace line 376:

```ts
  for await (const response of streamBlocks(transport, request, { signal: deadline.signal })) {
```

with:

```ts
  const runStreamBlocks = options.streamBlocksImpl ?? streamBlocks;
  for await (const response of runStreamBlocks(transport, request, { signal: deadline.signal })) {
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd web && pnpm dlx tsx src/lib/agency/all.test.ts`
Expected: PASS — count rises to 139.

- [ ] **Step 6: Make the verify script exit**

In `web/scripts/substreams-verify.ts`, replace the final block (lines 305-308):

```ts
main().catch((err: unknown) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
```

with:

```ts
// Exit explicitly rather than waiting for the event loop to drain. The Connect
// transport pools its HTTP/2 session and there is no public handle to close it,
// so a successful run would otherwise sit open indefinitely — which is exactly
// how two completed runs held both FREE-tier slots for four hours.
main()
  .catch((err: unknown) => {
    console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
```

- [ ] **Step 7: Verify no process is left behind**

Run:

```bash
cd web && timeout 180 pnpm dlx tsx --env-file=.env.local scripts/substreams-verify.ts --blocks=2 --behind=5; \
sleep 5; ps -eo pid,etime,command | grep -i "substreams-verify" | grep -v grep || echo "no orphan"
```

Expected: the run prints its RESULT block, then `no orphan`.

**If it prints `resource_exhausted` instead:** both FREE-tier slots are still held. Check for orphans with `lsof -nP -iTCP -sTCP:ESTABLISHED | grep 34.36.161.92`, kill any found, and re-run. If none are local, the slots are held by another machine sharing the key — create a fresh key at thegraph.market rather than waiting.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/kit/substreams.ts web/src/lib/kit/substreams-leak.test.ts web/scripts/substreams-verify.ts web/src/lib/agency/all.test.ts
git commit -m "Give the session back when the consumer walks away"
```

---

### Task 4: Expose coverage over MCP

**Files:**
- Modify: `web/src/app/api/mcp/route.ts` — `TOOLS` array (after the `list_schemas` entry, ~line 97) and `callTool` switch (after the `list_schemas` case, ~line 175)

**Interfaces:**
- Consumes: `assessCoverage`, `CoverageReport` from Task 2.
- Produces: the `check_coverage` MCP tool. Later phases call it to decide whether to build.

- [ ] **Step 1: Read the routing guide**

Per `web/AGENTS.md`, before touching App Router code:

```bash
ls web/node_modules/next/dist/docs/
```

Read the route-handler guide found there. This task only adds entries to two existing arrays and introduces no new route, but the repo's instructions are explicit and the check is cheap.

- [ ] **Step 2: Add the tool definition**

In `web/src/app/api/mcp/route.ts`, add to the `TOOLS` array immediately after the `list_schemas` entry:

```ts
  {
    name: "check_coverage",
    description:
      "Ask whether The Graph can answer a question at all: how many standardized subgraph deployments exist for it, and whether any Substreams package is published for it. Returns a verdict of covered, subgraph-only, substreams-only, or uncovered, with the reasons behind it. Call this before concluding that data is unavailable — and before building an indexing pipeline, so you do not rebuild something already published.",
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
```

- [ ] **Step 3: Add the dispatch case**

Add to the `callTool` switch, immediately after the `list_schemas` case:

```ts
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
```

Add the import alongside the existing `@/lib/kit/*` imports at the top of the file:

```ts
import { assessCoverage } from "@/lib/coverage/gap";
```

- [ ] **Step 4: Verify it typechecks and the suite still passes**

Run:

```bash
cd web && pnpm exec tsc --noEmit && pnpm dlx tsx src/lib/agency/all.test.ts
```

Expected: no type errors, 139/139 passing.

- [ ] **Step 5: Verify the tool answers over HTTP**

Run:

```bash
cd web && pnpm dev &
sleep 8
curl -s localhost:3000/api/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"check_coverage","arguments":{"question":"Hyperliquid vault flows on Arbitrum"}}}' | head -40
```

Expected: a JSON body containing a `verdict` field and a `reasons` array naming both what was checked in the standardized registry and what substreams.dev returned.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/api/mcp/route.ts
git commit -m "Let an agent ask whether The Graph covers this at all"
```

---

## Phase exit criteria

Phase 1 is done when all four hold:

1. `cd web && pnpm dlx tsx src/lib/agency/all.test.ts` reports 139/139.
2. `check_coverage` returns `uncovered` for a protocol nobody has indexed, with reasons naming both lookups.
3. A completed `substreams-verify.ts` run leaves no orphaned process.
4. A registry outage produces reasons saying the absence is unproven — never a bare `uncovered`.

Phase 2 (Substreams generation, publication and verification) begins from here and reuses `assessCoverage` as its trigger.
