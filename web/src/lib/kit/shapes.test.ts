/**
 * Shape-detection tests.
 *
 * Every case here is a regression that shipped and was visible on screen. They
 * are not hypotheses:
 *
 *   - `$7.2e22` from a broken SushiSwap price feed led a leaderboard, because
 *     re-sorting on the metric discarded the fan-out's suspect-last ordering.
 *   - An autonomous app rendered "Is Active has fired" in an alert banner,
 *     because `isActive: true` — the normal state of every healthy market —
 *     matched the `is…` flag heuristic.
 *   - A leaderboard labelled its rows "1.3.2 · #2 · #3", because the lowest-
 *     cardinality string column won and that column was `schemaVersion`.
 *
 * A false alert and a bogus ranking on a screen that can move money are worse
 * than no panel at all, so each of these is pinned.
 */
import { assert, assertEqual, describe, it } from "../agency/harness.test";
import { detectShape, type Row } from "./shapes";

/** Messari-lending-shaped rows, as the fan-out actually returns them. */
function market(
  name: string,
  tvl: number,
  extra: Record<string, unknown> = {},
): Row {
  return {
    id: `0x${name.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
    name,
    isActive: true,
    schemaVersion: "3.1.0",
    network: "ARBITRUM_ONE",
    totalValueLockedUSD: tvl,
    ...extra,
  };
}

describe("shapes — suspect rows", () => {
  it("never lets an impossible value lead a leaderboard", () => {
    const rows: Row[] = [
      // The fan-out puts suspect last; this asserts the detector keeps it there.
      market("Aave Arbitrum WETH", 203_000_000),
      market("Compound III", 83_700_000),
      market("dForce USD", 57_800_000),
      market("SushiSwap WETH", 7.2e22, { _suspect: ["totalValueLockedUSD"] }),
    ];
    const detected = detectShape(rows, { ranked: true });
    assertEqual(detected.shape, "categorical_ranked", "four named rows over one metric is a leaderboard");
    const first = detected.rows[0];
    assert(!("_suspect" in first), `a suspect row must not lead, got ${String(first["name"])}`);
    assertEqual(detected.rows[0]["name"], "Aave Arbitrum WETH", "the largest CREDIBLE row leads");
    assert("_suspect" in detected.rows[detected.rows.length - 1], "the suspect row is last, not dropped");
  });

  it("keeps suspect rows in the result — flagged, never deleted", () => {
    const rows: Row[] = [
      market("A", 100),
      market("B", 90),
      market("C", 80),
      market("D", 9e21, { _suspect: ["totalValueLockedUSD"] }),
    ];
    const detected = detectShape(rows, { ranked: true });
    assertEqual(detected.rows.length, 4, "no row is dropped for being wrong at the source");
  });

  it("reports an already-ranked list as ranked even with a suspect row present", () => {
    // `isDescending` must skip suspect rows: counting them made a correctly
    // ordered list look unsorted, which triggered the re-sort that put them back
    // on top — the exact loop this guards.
    const rows: Row[] = [
      market("A", 300),
      market("B", 200),
      market("C", 100),
      market("D", 5e22, { _suspect: ["totalValueLockedUSD"] }),
    ];
    const detected = detectShape(rows, {});
    assertEqual(detected.shape, "categorical_ranked", "detected without needing the ranked hint");
  });
});

describe("shapes — alert conditions", () => {
  it("does not treat isActive as a fired condition", () => {
    const rows: Row[] = [market("Aave WETH", 203_000_000), market("Aave USDC", 170_000_000)];
    const detected = detectShape(rows, { tier: "autonomous" });
    assert(
      detected.shape !== "triggered_condition",
      `isActive is a status field, not an alert — got ${detected.shape}`,
    );
  });

  it("does not treat isHealthy as a fired condition either", () => {
    const rows: Row[] = [
      { name: "A", isHealthy: true, healthFactor: 1.9 },
      { name: "B", isHealthy: true, healthFactor: 2.4 },
    ];
    const detected = detectShape(rows, { tier: "autonomous" });
    assert(detected.shape !== "triggered_condition", `got ${detected.shape}`);
  });

  it("still detects a genuinely breached condition", () => {
    const rows: Row[] = [
      { name: "Position A", isLiquidatable: true, healthFactor: 1.12, threshold: 1.4 },
      { name: "Position B", isLiquidatable: false, healthFactor: 2.05, threshold: 1.4 },
    ];
    const detected = detectShape(rows, { tier: "autonomous" });
    assertEqual(detected.shape, "triggered_condition", "a liquidatable flag IS an alert");
    assertEqual(detected.fields.condition, "isLiquidatable", "the breach flag is named");
  });

  it("detects an alert-named flag regardless of the is-prefix heuristic", () => {
    const rows: Row[] = [
      { market: "X", breached: true, utilization: 0.97 },
      { market: "Y", breached: false, utilization: 0.4 },
    ];
    const detected = detectShape(rows, { tier: "monitor" });
    assertEqual(detected.shape, "triggered_condition", "`breached` is a breach");
  });
});

describe("shapes — leaderboard labels", () => {
  it("labels rows by name, not by schemaVersion", () => {
    const rows: Row[] = [
      market("Aave Arbitrum WETH", 203_000_000),
      market("Compound III", 83_700_000),
      market("dForce USD", 57_800_000),
    ];
    const detected = detectShape(rows, { ranked: true });
    assertEqual(detected.fields.category, "name", "the entity column is the label");
  });

  it("ignores deployment metadata when nothing better exists than an id", () => {
    const rows: Row[] = [
      { id: "0xaaa", schemaVersion: "1.3.2", totalValueLockedUSD: 300 },
      { id: "0xbbb", schemaVersion: "1.3.2", totalValueLockedUSD: 200 },
      { id: "0xccc", schemaVersion: "1.3.0", totalValueLockedUSD: 100 },
    ];
    const detected = detectShape(rows, { ranked: true });
    assert(
      detected.fields.category !== "schemaVersion",
      `a version string is never a label, got ${String(detected.fields.category)}`,
    );
  });

  it("prefers symbol over a lower-cardinality string column", () => {
    const rows: Row[] = [
      { symbol: "WETH", network: "ARBITRUM_ONE", totalValueLockedUSD: 300 },
      { symbol: "USDC", network: "ARBITRUM_ONE", totalValueLockedUSD: 200 },
      { symbol: "WBTC", network: "OPTIMISM", totalValueLockedUSD: 100 },
    ];
    const detected = detectShape(rows, { ranked: true });
    assertEqual(detected.fields.category, "symbol", "symbol names the entity; network groups it");
  });
});
