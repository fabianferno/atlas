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
