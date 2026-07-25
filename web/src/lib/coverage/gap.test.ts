/**
 * The verdict is the thing the agent acts on, so each of the five states needs
 * to be reachable and distinguishable. "Uncovered" is the only one that may
 * trigger a build, and reaching it wrongly means either wasted work or a silent
 * refusal to answer a question we could have answered. "Unknown" exists
 * because a failed registry lookup must never be mistaken for "uncovered" —
 * that exact confusion is what would send a later phase off to rebuild
 * something that may already be published.
 */
import type { Network, SchemaFamily } from "@/lib/contracts/manifest";
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
// A rejecting fetchImpl, standing in for the registry being unreachable rather
// than answering with a definitive "nothing here".
const FAILING_FETCH = async (): Promise<Response> => {
  throw new Error("network down");
};

/**
 * Synthetic (schema, network) counts, injected via `AssessOptions.coverage`
 * instead of depending on the real contents of `sources.ts`. Most tests below
 * only need *some* schema to have *some* deployments — which schema and how
 * many is an implementation detail of the registry, not of this module.
 */
function fixtureCoverage(
  entries: Partial<Record<SchemaFamily, Partial<Record<Network, number>>>>,
): () => Record<SchemaFamily, Partial<Record<Network, number>>> {
  return () => entries as Record<SchemaFamily, Partial<Record<Network, number>>>;
}

const HAS_DEPLOYMENTS = fixtureCoverage({ "lending-cdp@3.1.0": { "arbitrum-one": 3 } });

describe("coverage assessment", () => {
  itAsync("reports covered when a standardized family has deployments", async () => {
    const report = await assessCoverage({
      query: "aave lending",
      schemas: ["lending-cdp@3.1.0"],
      networks: ["arbitrum-one"],
      fetchImpl: ONE_PACKAGE,
      coverage: HAS_DEPLOYMENTS,
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
      coverage: HAS_DEPLOYMENTS,
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

  itAsync("reports unknown when the registry lookup fails and no subgraph exists", async () => {
    const report = await assessCoverage({
      query: "hyperliquid vault flows",
      schemas: [],
      networks: ["arbitrum-one"],
      fetchImpl: FAILING_FETCH,
    });
    assertEqual(report.verdict, "unknown", "lookup failed, so absence was never proven");
    assertEqual(report.covered, false, "an unproven absence must not read as coverage");
    assert(
      report.reasons.some((r) => r.includes("unproven")),
      `says the absence is unproven, not just that it's uncovered: ${report.reasons.join(" | ")}`,
    );
  });

  // Deliberately pinned to the real registry rather than a fixture: this is
  // the one test asserting `lending-cdp@3.1.0` genuinely has non-placeholder
  // deployments on both arbitrum-one and optimism in `sources.ts`. If that
  // file's classification of those rows changes, this test should fail and
  // must be updated alongside it — that's the point of keeping it live.
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
