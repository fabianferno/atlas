/**
 * The verdict is the thing the agent acts on, so each of the five states needs
 * to be reachable and distinguishable. "Uncovered" is the only one that may
 * trigger a build, and reaching it wrongly means either wasted work or a silent
 * refusal to answer a question we could have answered. "Unknown" exists
 * because a failed registry lookup must never be mistaken for "uncovered" —
 * that exact confusion is what would send a later phase off to rebuild
 * something that may already be published.
 *
 * The other half of that: `covered` must not be set by a subgraph deployment
 * count. The planner always returns some schema family, so that count is nearly
 * always positive, and letting it prove coverage made every question look
 * answered. Proof-state is asserted through `substreamsProven` rather than by
 * grepping `reasons` — the flag is what a later phase will branch on, and a
 * test that passes only while the prose stays word-for-word identical is
 * testing the wrong thing.
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
// Rows arrived, none of them usable — the upstream shape moved under us. Zero
// packages here is our parser's opinion, not the registry's answer.
const UNUSABLE_ROWS = async () =>
  new Response(JSON.stringify({ packages: [{ package_name: "aave_v3", artifact: "https://spkg.io/x" }] }), {
    headers: { "content-type": "application/json" },
  });

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
    assert(report.substreamsProven, "the lookup completed and every row parsed");
  });

  // The regression that made this whole report untrustworthy: the planner never
  // returns an empty schema list, so deployments > 0 for essentially every real
  // question. If that alone can set `covered`, the answer is "yes" for a
  // protocol nobody has indexed.
  itAsync("does not let a bare deployment count claim the subject is covered", async () => {
    const report = await assessCoverage({
      query: "hyperliquid vault flows",
      schemas: ["lending-cdp@3.1.0"],
      networks: ["arbitrum-one"],
      fetchImpl: NO_PACKAGES,
      coverage: HAS_DEPLOYMENTS,
    });
    assert(report.subgraph.deployments > 0, "deployments were counted");
    assertEqual(report.covered, false, "counting candidates is not proving a match");
    assert(
      report.reasons.some((r) => r.includes("was not checked")),
      `says the protocol match was never checked: ${report.reasons.join(" | ")}`,
    );
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
    assertEqual(report.substreamsProven, false, "the lookup did not complete");
    assert(
      report.reasons.some((r) => r.includes("unproven")),
      `says the absence is unproven, not just that it's uncovered: ${report.reasons.join(" | ")}`,
    );
  });

  // "subgraph-only" means no package exists. A failed lookup never established
  // that, and subgraph deployments do not establish it either — they are about
  // a different registry entirely.
  itAsync("reports unknown when the lookup fails even though deployments exist", async () => {
    const report = await assessCoverage({
      query: "hyperliquid vault flows",
      schemas: ["lending-cdp@3.1.0"],
      networks: ["arbitrum-one"],
      fetchImpl: FAILING_FETCH,
      coverage: HAS_DEPLOYMENTS,
    });
    assertEqual(report.verdict, "unknown", "a failed lookup cannot be reported as 'no package exists'");
    assertEqual(report.substreamsProven, false, "the lookup did not complete");
    assertEqual(report.covered, false, "nothing was proven to index this");
  });

  // A parse failure that reads as absence is the precise mistake this module
  // exists to prevent: rename a field upstream and every protocol becomes
  // "uncovered", which is what triggers an expensive build.
  itAsync("treats rows that all failed to parse as an unproven absence", async () => {
    const report = await assessCoverage({
      query: "aave lending",
      schemas: [],
      networks: ["arbitrum-one"],
      fetchImpl: UNUSABLE_ROWS,
    });
    assertEqual(report.substreams.packages.length, 0, "nothing usable came back");
    assertEqual(report.substreamsProven, false, "rows arrived but none could be read");
    assertEqual(report.verdict, "unknown", "unreadable is not empty");
    assert(
      report.reasons.some((r) => r.includes("could not be parsed")),
      `names the parse failure: ${report.reasons.join(" | ")}`,
    );
  });

  // The registry search is effectively a package-name search, so sending the
  // sentence can only ever manufacture a false absence.
  itAsync("searches a narrowed term rather than the whole question", async () => {
    let seen = "";
    const report = await assessCoverage({
      query: "Show me the top Hyperliquid vaults on Arbitrum",
      schemas: [],
      networks: ["arbitrum-one"],
      fetchImpl: async (url) => {
        seen = String(url);
        return new Response(JSON.stringify({}), { headers: { "content-type": "application/json" } });
      },
    });
    assert(seen.includes("query=hyperliquid"), `sends the narrowed term: ${seen}`);
    assert(!seen.includes("arbitrum"), `drops the network name: ${seen}`);
    assert(!seen.includes("vaults"), `drops what we want to know about it: ${seen}`);
    assertEqual(report.substreams.query, "hyperliquid", "reports what it actually searched");
    assert(
      report.reasons.some((r) => r.includes("narrowed from")),
      `says the question was narrowed: ${report.reasons.join(" | ")}`,
    );
  });

  // A term picked by position is a guess, and a guess that returns nothing is
  // not the same evidence as a name that returns nothing.
  itAsync("says so when a zero result came from a guessed term", async () => {
    const report = await assessCoverage({
      query: "hyperliquid vault flows",
      schemas: [],
      networks: ["arbitrum-one"],
      fetchImpl: NO_PACKAGES,
    });
    assertEqual(report.verdict, "uncovered", "the lookup did complete");
    assert(
      report.reasons.some((r) => r.includes("understates coverage")),
      `flags the weaker evidence: ${report.reasons.join(" | ")}`,
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
