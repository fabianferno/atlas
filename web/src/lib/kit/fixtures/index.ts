/**
 * Fixture responses for The Graph.
 *
 * The rule this file enforces: nothing downstream may behave differently in
 * fixture mode. So the response is keyed off the *root fields the query asks
 * for*, not off some fixture-specific switch — a query that works here works
 * against the gateway, and vice versa.
 */
import { PROTOCOL_FIXTURES, type ProtocolFixture, type Row } from "./protocols";
import { MARKET_FIXTURES, POOL_FIXTURES } from "./entities";

export type { Row, ProtocolFixture };
export { PROTOCOL_FIXTURES, MARKET_FIXTURES, POOL_FIXTURES };

/** What the caller knows about a source that the fixture tables may not. Lets
 *  us synthesise a named, plausible row for any of the ~90 deployments without
 *  hand-writing all of them. */
export interface FixtureHint {
  label?: string;
  schema?: string;
  network?: string;
}

/** Root fields that return the Protocol interface or one of its implementors. */
const PROTOCOL_ROOTS = [
  "lendingProtocols",
  "dexAmmProtocols",
  "yieldAggregators",
  "bridgeProtocols",
  "derivPerpProtocols",
  "derivOptProtocols",
  "marketplaces",
  "protocols",
] as const;

/** Field is present when it appears as `name(` or `name {` at a token boundary.
 *  Substring matching would make `protocols` fire on `lendingProtocols`. */
function asksFor(query: string, field: string): boolean {
  return new RegExp(`(^|[\\s{,])${field}\\s*[({]`).test(query);
}

const NETWORK_ENUM: Record<string, string> = {
  "arbitrum-one": "ARBITRUM_ONE",
  optimism: "OPTIMISM",
  base: "BASE",
  mainnet: "MAINNET",
};

const SCHEMA_TYPE: Record<string, string> = {
  "lending-cdp@3.1.0": "LENDING",
  "dex-amm@1.3.2": "EXCHANGE",
  "dex-amm-extended@4.0.1": "EXCHANGE",
  "dex-aggregator@1.0.2": "EXCHANGE",
  "yield-aggregator@1.3.1": "YIELD",
  "bridge@1.2.0": "BRIDGE",
  "perp-futures@1.3.4": "PERPETUAL",
  "options@1.3.2": "OPTION",
  "nft-marketplace@2.1.0": "NFT_MARKETPLACE",
  "network@1.2.0": "GENERIC",
  "generic@3.0.0": "GENERIC",
};

/** Stable 32-bit hash. Same subgraph gets the same numbers on every render,
 *  which matters when a demo is re-run in front of judges. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** "radiant-capital-v2-arbitrum" -> "Radiant Capital V2" */
function titleFromLabel(label: string): string {
  const networkSuffix = /-(arbitrum|optimism|base|ethereum|mainnet)$/;
  return label
    .replace(networkSuffix, "")
    .split("-")
    .map((part) => (/^v\d+$/.test(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

function synthesiseProtocol(subgraphId: string, hint: FixtureHint): Row {
  const seed = hash(subgraphId);
  // Log-uniform across roughly $200K–$200M. A linear spread would put almost
  // every synthetic protocol in the same order of magnitude and the charts
  // would look fake.
  const tvl = Math.exp(Math.log(2e5) + ((seed % 1000) / 1000) * Math.log(1000));
  const revenue = tvl * 0.031;
  const users = 800 + (seed % 180_000);
  return {
    id: `0x${(seed.toString(16) + "0".repeat(40)).slice(0, 40)}`,
    name: hint.label ? titleFromLabel(hint.label) : subgraphId.slice(0, 8),
    slug: hint.label ?? subgraphId,
    network: NETWORK_ENUM[hint.network ?? ""] ?? "ARBITRUM_ONE",
    type: SCHEMA_TYPE[hint.schema ?? ""] ?? "GENERIC",
    schemaVersion: (hint.schema ?? "generic@3.0.0").split("@")[1] ?? "3.0.0",
    subgraphVersion: "1.3.0",
    methodologyVersion: "1.0.0",
    totalValueLockedUSD: tvl.toFixed(2),
    cumulativeSupplySideRevenueUSD: (revenue * 0.72).toFixed(2),
    cumulativeProtocolSideRevenueUSD: (revenue * 0.28).toFixed(2),
    cumulativeTotalRevenueUSD: revenue.toFixed(2),
    cumulativeUniqueUsers: users,
    totalPoolCount: 1 + (seed % 40),
  };
}

/** 30 days of financials derived from the protocol's own totals, so a chart and
 *  a headline number never disagree. */
function snapshots(protocol: Row, days: number): Row[] {
  const tvl = Number(protocol.totalValueLockedUSD ?? 0);
  const seed = hash(String(protocol.id ?? "0x0"));
  const dayMs = 86_400_000;
  const today = Math.floor(Date.now() / dayMs);
  const out: Row[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = today - i;
    // Deterministic ±9% walk with a mild upward drift.
    const wobble = (((seed + day * 7919) % 1000) / 1000 - 0.5) * 0.18;
    const drift = 1 - i * 0.0021;
    const dayTvl = tvl * drift * (1 + wobble);
    out.push({
      id: String(day),
      day,
      timestamp: String(day * 86_400),
      totalValueLockedUSD: dayTvl.toFixed(2),
      dailyVolumeUSD: (dayTvl * 0.42 * (1 + wobble)).toFixed(2),
      dailySupplySideRevenueUSD: (dayTvl * 0.00021).toFixed(2),
      dailyProtocolSideRevenueUSD: (dayTvl * 0.00008).toFixed(2),
      dailyTotalRevenueUSD: (dayTvl * 0.00029).toFixed(2),
    });
  }
  return out;
}

/** Honour `first: N` so a fixture never returns more rows than the query asked
 *  for — an off-by-many here shows up as a broken-looking table. */
function limitOf(query: string, field: string, fallback: number): number {
  const match = new RegExp(`${field}\\s*\\(([^)]*)\\)`).exec(query);
  if (!match) return fallback;
  const first = /first\s*:\s*(\d+)/.exec(match[1]);
  return first ? Number(first[1]) : fallback;
}

/**
 * Build a fixture response for a query. Returns null only when the query asks
 * for nothing we recognise — callers treat that as a source failure, which is
 * the correct signal.
 */
export function fixtureFor<T = Record<string, unknown>>(
  subgraphId: string,
  query: string,
  hint: FixtureHint = {},
): T | null {
  const fixture: ProtocolFixture | undefined = PROTOCOL_FIXTURES[subgraphId];
  const protocolRow = fixture?.protocol ?? synthesiseProtocol(subgraphId, hint);
  const out: Record<string, unknown> = {};

  if (asksFor(query, "_meta")) {
    out._meta = {
      block: {
        number: 348_119_204 + (hash(subgraphId) % 90_000),
        timestamp: Math.floor(Date.now() / 1000) - (hash(subgraphId) % 45),
      },
      hasIndexingErrors: false,
      deployment: subgraphId,
    };
  }

  for (const root of PROTOCOL_ROOTS) {
    if (asksFor(query, root)) {
      out[root] = [protocolRow].slice(0, limitOf(query, root, 1));
      break;
    }
  }

  if (asksFor(query, "markets")) {
    const rows = MARKET_FIXTURES[subgraphId] ?? syntheticMarkets(subgraphId, protocolRow);
    out.markets = rows.slice(0, limitOf(query, "markets", 10));
  }

  for (const root of ["liquidityPools", "pools", "vaults"] as const) {
    if (asksFor(query, root)) {
      const rows = POOL_FIXTURES[subgraphId] ?? syntheticPools(subgraphId, protocolRow);
      out[root] = rows.slice(0, limitOf(query, root, 10));
    }
  }

  if (asksFor(query, "financialsDailySnapshots")) {
    out.financialsDailySnapshots = snapshots(
      protocolRow,
      limitOf(query, "financialsDailySnapshots", 30),
    );
  }

  if (asksFor(query, "usageMetricsDailySnapshots")) {
    const seed = hash(subgraphId);
    out.usageMetricsDailySnapshots = snapshots(protocolRow, 7).map((row, i) => ({
      id: row.id,
      day: row.day,
      dailyActiveUsers: 200 + ((seed + i * 331) % 9_000),
      cumulativeUniqueUsers: protocolRow.cumulativeUniqueUsers,
      dailyTransactionCount: 900 + ((seed + i * 977) % 40_000),
    }));
  }

  return Object.keys(out).length > 0 ? (out as T) : null;
}

function syntheticMarkets(subgraphId: string, protocolRow: Row): Row[] {
  const seed = hash(subgraphId);
  const tvl = Number(protocolRow.totalValueLockedUSD ?? 0);
  const symbols = ["WETH", "USDC", "WBTC", "USDT"];
  return symbols.slice(0, 2 + (seed % 3)).map((symbol, i) => {
    const share = [0.44, 0.31, 0.16, 0.09][i];
    return {
      id: `0x${((seed + i * 7919).toString(16) + "0".repeat(40)).slice(0, 40)}`,
      name: `${protocolRow.name} ${symbol}`,
      isActive: true,
      inputToken: { symbol, decimals: symbol === "USDC" || symbol === "USDT" ? 6 : 18 },
      rates: [
        { side: "LENDER", type: "VARIABLE", rate: (1.2 + ((seed + i) % 500) / 100).toFixed(2) },
        { side: "BORROWER", type: "VARIABLE", rate: (3.1 + ((seed + i) % 700) / 100).toFixed(2) },
      ],
      totalValueLockedUSD: (tvl * share).toFixed(2),
      totalDepositBalanceUSD: (tvl * share * 1.24).toFixed(2),
      totalBorrowBalanceUSD: (tvl * share * 0.47).toFixed(2),
    };
  });
}

function syntheticPools(subgraphId: string, protocolRow: Row): Row[] {
  const seed = hash(subgraphId);
  const tvl = Number(protocolRow.totalValueLockedUSD ?? 0);
  const pairs: [string, string][] = [
    ["WETH", "USDC"],
    ["WETH", "WBTC"],
    ["ARB", "WETH"],
  ];
  return pairs.slice(0, 1 + (seed % 3)).map(([a, b], i) => {
    const share = [0.52, 0.29, 0.19][i];
    return {
      id: `0x${((seed + i * 104729).toString(16) + "0".repeat(40)).slice(0, 40)}`,
      name: `${protocolRow.name} ${a}/${b}`,
      symbol: `${a}/${b}`,
      inputTokens: [{ symbol: a }, { symbol: b }],
      fees: [{ feePercentage: "0.30", feeType: "FIXED_TRADING_FEE" }],
      totalValueLockedUSD: (tvl * share).toFixed(2),
      cumulativeVolumeUSD: (tvl * share * 214).toFixed(2),
      dailyVolumeUSD: (tvl * share * 0.61).toFixed(2),
    };
  });
}
