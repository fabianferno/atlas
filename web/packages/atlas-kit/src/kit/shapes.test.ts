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
 *   - A vault holding about $40,000 rendered `INPUT TOKEN BALANCE $26551393887T`,
 *     because `unitFor` matched the substring "balance" and returned "usd".
 *     `inputTokenBalance` is a RAW token amount in the token's own decimals.
 *   - A metric_card reading "20 row(s) with impossible values excluded" sat
 *     directly above a leaderboard that ranked those same twenty rows at
 *     `$26101137179950`. The reader was told a number was impossible and then
 *     shown it as a rank.
 *   - "Rank stablecoin vaults by net APY" produced a screen captioned "Ranked
 *     name by totalValueLockedUSD" over two WETH pairs. The composer picked the
 *     metric from the shape of what came back and never from what was asked.
 *
 * A false alert and a bogus ranking on a screen that can move money are worse
 * than no panel at all, so each of these is pinned.
 *
 * The last three are composer-level and are exercised through `compose()` at the
 * bottom of this file rather than in a file of their own: `agency/all.test.ts`
 * is the suite's registry and this repo's kit does not own it, so a new file
 * would be a test nothing runs.
 */
import type { PlanResult } from "@/lib/contracts/api";
import { assert, assertEqual, describe, it } from "../agency/harness.test";
import { compose } from "./composer";
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

describe("shapes — the metric that was asked for", () => {
  /** Messari yield-aggregator vault rows, exactly as the rank template returns them. */
  const vault = (name: string, tvl: number, extra: Record<string, unknown> = {}): Row => ({
    id: `0x${name.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
    name,
    totalValueLockedUSD: tvl,
    inputTokenBalance: tvl * 6.6e17,
    outputTokenPriceUSD: 1.5,
    ...extra,
  });

  it("ranks by the requested metric when the rows carry it", () => {
    // (a) of the honesty rule: if it is there, use it. TVL descends and APY does
    // not, so a panel ranked by APY is unambiguously answering the question.
    // Two metrics only. A fuller vault row carries four, which is
    // `entities_shared_metrics` (a comparison grid) — a real shape, but not one
    // that ranks, so it would not test the ordering.
    const rows: Row[] = [
      { name: "Big vault, poor yield", totalValueLockedUSD: 400, supplyApy: 1.2 },
      { name: "Mid vault", totalValueLockedUSD: 300, supplyApy: 9.4 },
      { name: "Small vault, best yield", totalValueLockedUSD: 100, supplyApy: 14.8 },
      { name: "Tiny vault", totalValueLockedUSD: 50, supplyApy: 4.1 },
    ];
    const detected = detectShape(rows, {
      ranked: true,
      preferredMetric: "totalValueLockedUSD",
      requestedMetric: { phrase: "net APY", candidates: ["apy"] },
    });
    assertEqual(detected.fields.primaryMetric, "supplyApy", "the question outranks the plan's orderBy");
    assertEqual(detected.rows[0]["name"], "Small vault, best yield", "ranked by APY, not by TVL");
    assertEqual(detected.metricGap, null, "nothing was substituted, so nothing to disclose");
  });

  it("records a gap instead of silently substituting when the schema lacks it", () => {
    // (b): the standardized yield schema carries no APY column on `vaults`, so
    // the panel MUST say it answered a different question.
    const rows: Row[] = [vault("Arrakis WETH/HAN", 40020), vault("Gelato THALES/WETH", 22383), vault("Curve Tricrypto", 16451)];
    const detected = detectShape(rows, {
      ranked: true,
      preferredMetric: "totalValueLockedUSD",
      requestedMetric: { phrase: "net APY", candidates: ["apy"] },
    });
    assert(detected.metricGap !== null, "a substitution happened and must be recorded");
    assertEqual(detected.metricGap?.kind, "absent", "no column carries APY at all");
    assertEqual(detected.metricGap?.requested, "net APY", "said back in the user's own words");
    assertEqual(detected.metricGap?.using, "totalValueLockedUSD", "and what it fell back to");
  });

  it("never satisfies a request with a lookalike column", () => {
    // `fundingRate` is a rate and is not APY. Answering with it would be the
    // silent substitution this whole field exists to stop.
    const rows: Row[] = [
      { name: "GMX ETH", totalValueLockedUSD: 300, fundingRate: 0.01 },
      { name: "GMX BTC", totalValueLockedUSD: 200, fundingRate: 0.02 },
      { name: "GMX ARB", totalValueLockedUSD: 100, fundingRate: 0.03 },
    ];
    const detected = detectShape(rows, { ranked: true, requestedMetric: { phrase: "net APY", candidates: ["apy"] } });
    assert(detected.fields.primaryMetric !== "fundingRate", "a neighbouring rate is not an answer");
    assertEqual(detected.metricGap?.kind, "absent", "reported as missing rather than answered wrongly");
  });

  it("records no gap when the question named no metric", () => {
    const rows: Row[] = [vault("A", 300), vault("B", 200), vault("C", 100)];
    const detected = detectShape(rows, { ranked: true, preferredMetric: "totalValueLockedUSD" });
    assertEqual(detected.metricGap, null, "null request means nothing was asked, so nothing was denied");
  });

  it("does not promote a raw token balance to the headline metric", () => {
    // `inputTokenBalance` is ~1e18 times larger than the TVL of the same vault.
    // It used to match the semantic "usd" rule through the substring "supply"
    // on its sibling `outputTokenSupply`, which made a raw token count eligible
    // to lead a screen.
    const rows: Row[] = [vault("A", 300), vault("B", 200), vault("C", 100)];
    const detected = detectShape(rows, { ranked: true });
    assertEqual(detected.fields.primaryMetric, "totalValueLockedUSD", "the dollar column leads, not the token count");
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Composer-level regressions, driven through the real `compose()`.
 *
 * `narrate()` is skipped when no inference key is present, and these tests
 * clear the keys explicitly rather than assuming the environment: a unit suite
 * that sometimes makes a 12-second call to 0G is a suite people stop running.
 * Only `label` is model-supplied anyway — every disclosure asserted below is
 * composer-controlled, which is the point of putting it in `caption`.
 * ──────────────────────────────────────────────────────────────────────── */

function offline<T>(fn: () => Promise<T>): Promise<T> {
  const saved = { zerog: process.env.ZEROG_API_KEY, openai: process.env.OPENAI_API_KEY };
  delete process.env.ZEROG_API_KEY;
  delete process.env.OPENAI_API_KEY;
  return fn().finally(() => {
    if (saved.zerog !== undefined) process.env.ZEROG_API_KEY = saved.zerog;
    if (saved.openai !== undefined) process.env.OPENAI_API_KEY = saved.openai;
  });
}

function planFor(overrides: Partial<PlanResult> = {}): PlanResult {
  return {
    intent: "Rank the top vaults",
    schemas: ["yield-aggregator@1.3.1"],
    networks: ["arbitrum-one"],
    queries: { "rank:yield-aggregator@1.3.1": "query TopVaults { vaults { id } }" },
    variables: { first: 10, orderBy: "totalValueLockedUSD", orderDirection: "desc" },
    tier: "readonly",
    requestedMetric: null,
    attestationRef: null,
    model: "test",
    ...overrides,
  };
}

interface Panel {
  component?: string;
  caption?: string;
  hints?: { unit?: string };
}

/**
 * An A2UI document is a MESSAGE LIST — `createSurface`, `updateComponents`,
 * `updateDataModel` — not a nested object. Reading it as one is how these
 * helpers silently returned nothing on the first run.
 */
type A2UIMessage = {
  updateComponents?: { components?: Panel[] };
  updateDataModel?: { value?: { blocks?: Record<string, Record<string, unknown>> } };
};

function panelsOf(ui: unknown): Panel[] {
  const messages = Array.isArray(ui) ? (ui as A2UIMessage[]) : [];
  return messages.flatMap((m) => m.updateComponents?.components ?? []);
}

function blocksOf(ui: unknown): Record<string, Record<string, unknown>> {
  const messages = Array.isArray(ui) ? (ui as A2UIMessage[]) : [];
  for (const m of messages) {
    const blocks = m.updateDataModel?.value?.blocks;
    if (blocks) return blocks;
  }
  return {};
}

describe("composer — units say what the schema can back", () => {
  it("does not put a dollar sign on a raw token balance", async () => {
    const rows: Row[] = [
      { name: "Arrakis WETH/HAN", totalValueLockedUSD: 40020, inputTokenBalance: 2.65e22, outputTokenPriceUSD: 1.5 },
      { name: "Gelato THALES/WETH", totalValueLockedUSD: 22383, inputTokenBalance: 5.88e20, outputTokenPriceUSD: 38 },
      { name: "Curve Tricrypto", totalValueLockedUSD: 16451, inputTokenBalance: 1.02e19, outputTokenPriceUSD: 0.04 },
    ];
    const out = await offline(() =>
      compose(planFor(), {
        rows,
        bySchema: { "yield-aggregator@1.3.1": rows },
        sourcesQueried: 1,
        sourcesHealthy: 1,
        sourcesFailed: [],
        costUsd: 0,
        elapsedMs: 1,
      }),
    );
    const table = Object.values(blocksOf(out.ui)).find((b) => Array.isArray(b.columnKeys));
    assert(table !== undefined, "the raw rows table is always composed");
    const keys = table!.columnKeys as string[];
    const units = table!.units as string[];
    const unitOf = (k: string): string => units[keys.indexOf(k)];
    assertEqual(unitOf("inputTokenBalance"), "token", "a raw token amount is a bare count, never dollars");
    assertEqual(unitOf("outputTokenPriceUSD"), "usd", "a field that says USD really is USD");
    assertEqual(unitOf("totalValueLockedUSD"), "usd", "and the headline dollar field is unchanged");
  });

  it("marks an ether-denominated field as ether, not as dollars", async () => {
    // Live NFT-marketplace fields. `cumulativeTradeVolumeETH` matched the old
    // `volume` rule and was drawn with a dollar sign on real data.
    const rows: Row[] = [
      { name: "Collection A", cumulativeTradeVolumeETH: 900, creatorRevenueETH: 12, tradeCount: 40 },
      { name: "Collection B", cumulativeTradeVolumeETH: 500, creatorRevenueETH: 8, tradeCount: 30 },
      { name: "Collection C", cumulativeTradeVolumeETH: 100, creatorRevenueETH: 2, tradeCount: 10 },
    ];
    const out = await offline(() =>
      compose(planFor({ schemas: ["nft-marketplace@2.1.0"] }), {
        rows,
        bySchema: { "nft-marketplace@2.1.0": rows },
        sourcesQueried: 1,
        sourcesHealthy: 1,
        sourcesFailed: [],
        costUsd: 0,
        elapsedMs: 1,
      }),
    );
    const table = Object.values(blocksOf(out.ui)).find((b) => Array.isArray(b.columnKeys));
    const keys = table!.columnKeys as string[];
    const units = table!.units as string[];
    assertEqual(units[keys.indexOf("cumulativeTradeVolumeETH")], "eth", "ether is ether");
    assertEqual(units[keys.indexOf("tradeCount")], "count", "and a count is still a count");
  });
});

describe("composer — the headline and the leaderboard agree", () => {
  const pool = (name: string, tvl: number, suspect = false): Row => ({
    name,
    totalValueLockedUSD: tvl,
    ...(suspect ? { _suspect: ["totalValueLockedUSD"] } : {}),
  });

  it("never ranks a row it has called impossible", async () => {
    const rows: Row[] = [
      pool("Saddle nUSD/MIM", 5849),
      pool("Saddle L2D4", 3471),
      pool("Saddle FRAX/USDC", 3135),
      pool("Camelot V2 xPet/USDC", 2.61e13, true),
      pool("Camelot V2 Xai/USDC", 3.53e12, true),
    ];
    const out = await offline(() =>
      compose(planFor({ intent: "Rank the top DEX pools by TVL", schemas: ["dex-amm@1.3.2"] }), {
        rows,
        bySchema: { "dex-amm@1.3.2": rows },
        sourcesQueried: 1,
        sourcesHealthy: 1,
        sourcesFailed: [],
        costUsd: 0,
        elapsedMs: 1,
      }),
    );

    const ranked = Object.values(blocksOf(out.ui)).find((b) => b.shape === "categorical_ranked");
    assert(ranked !== undefined, "five named rows over one metric is still a leaderboard");
    const values = (ranked!.rows as Array<{ value: number }>).map((r) => r.value);
    assertEqual(values.length, 3, "the two impossible rows are not ranked");
    assert(Math.max(...values) < 1e9, `no impossible value survives into the ranking, got ${Math.max(...values)}`);
    assertEqual(ranked!.suspectCount, 2, "and the panel carries them, flagged, rather than deleting them");

    // The contradiction this test exists for: card and list must not disagree.
    const panels = panelsOf(out.ui);
    const card = panels.find((c) => c.component === "metric_card");
    const board = panels.find((c) => c.component === "leaderboard");
    assert(/2 of 5 rows/.test(card?.caption ?? ""), `headline must state the count, got: ${card?.caption}`);
    assert(/2 of 5 rows/.test(board?.caption ?? ""), `the ranked panel must state it too, got: ${board?.caption}`);
  });

  it("keeps every row in the raw table and says so there", async () => {
    const rows: Row[] = [pool("A", 300), pool("B", 200), pool("C", 100), pool("D", 9e21, true)];
    const out = await offline(() =>
      compose(planFor({ schemas: ["dex-amm@1.3.2"] }), {
        rows,
        bySchema: { "dex-amm@1.3.2": rows },
        sourcesQueried: 1,
        sourcesHealthy: 1,
        sourcesFailed: [],
        costUsd: 0,
        elapsedMs: 1,
      }),
    );
    const table = Object.values(blocksOf(out.ui)).find((b) => Array.isArray(b.columnKeys));
    assertEqual((table!.rows as unknown[]).length, 4, "nothing is deleted from the show-your-work table");
    const caption = panelsOf(out.ui).find((c) => c.component === "data_table")?.caption ?? "";
    assert(/shown here unaltered/.test(caption), `the table says it kept them, got: ${caption}`);
  });
});

describe("composer — a substituted metric is stated on screen", () => {
  it("says what was asked, why it is missing, and what it used instead", async () => {
    const rows: Row[] = [
      { name: "Arrakis WETH/HAN", totalValueLockedUSD: 40020, outputTokenPriceUSD: 1.5 },
      { name: "Gelato THALES/WETH", totalValueLockedUSD: 22383, outputTokenPriceUSD: 38 },
      { name: "Curve Tricrypto", totalValueLockedUSD: 16451, outputTokenPriceUSD: 0.04 },
    ];
    const out = await offline(() =>
      compose(
        planFor({
          intent: "Rank stablecoin vaults by net APY across Arbitrum and Optimism",
          requestedMetric: { phrase: "net APY", candidates: ["apy"] },
        }),
        {
          rows,
          bySchema: { "yield-aggregator@1.3.1": rows },
          sourcesQueried: 1,
          sourcesHealthy: 1,
          sourcesFailed: [],
          costUsd: 0,
          elapsedMs: 1,
        },
      ),
    );
    const board = panelsOf(out.ui).find((c) => c.component === "leaderboard");
    const caption = board?.caption ?? "";
    assert(/Asked for net APY/.test(caption), `the request is named, got: ${caption}`);
    assert(/does not carry it/.test(caption), `the reason is given, got: ${caption}`);
    assert(/Total Value Locked USD instead/.test(caption), `the substitute is named, got: ${caption}`);
  });
});
