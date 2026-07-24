/**
 * W3 — the planner. Natural language → a query plan.
 *
 * Implements `Plan` from contracts/api.ts. Runs on 0G Private Computer when a
 * key is present (attestation captured into `PlanResult.attestationRef`), and
 * on a deterministic rules engine otherwise. Both paths produce the same
 * shape, so the whole product demos with no keys at all.
 *
 * ── Reliable beats clever ────────────────────────────────────────────────
 * Ten intent patterns are hardcoded and always run first. They cover the
 * question shapes a demo actually asks. The model is used to *generalize
 * beyond* them — and even then it only chooses a template and its variables.
 * **The model never writes GraphQL.** Query text is assembled here from
 * `SCHEMA_QUERIES`, which means a hallucinated field name cannot reach a
 * gateway, and an offline model cannot take the demo down.
 *
 * ── Tier is the load-bearing output ──────────────────────────────────────
 *   "Show me top DEXs"                        → readonly
 *   "Tell me when USDC depegs"                → monitor
 *   "Sell ETH if health factor drops below 1.4" → autonomous
 * Tier drives border weight (prd.md §6 Rule 1) and what the policy engine
 * will even consider. The rules engine computes a tier floor; the model may
 * raise it and can never lower it. Over-classifying costs heavier chrome and
 * an empty allowlist. Under-classifying would let an app act with the chrome
 * of a chart. Only one of those is a bug worth having.
 *
 * ── Untrusted input ──────────────────────────────────────────────────────
 * The question is user text and is treated as intent, never as instructions
 * to a tool. Query *results* never reach this module — that is the whole
 * point of the seam (prd.md §7).
 */
import { z } from "zod";
import type { Plan, PlanInput, PlanResult } from "@/lib/contracts/api";
import type { AgencyTier, Network, SchemaFamily } from "@/lib/contracts/manifest";
import { AGENCY_TIERS, NETWORKS, SCHEMA_FAMILIES } from "@/lib/contracts/manifest";
import { chatJson, getInferenceConfig, sanitizeForPrompt, STUB_MODEL } from "./inference";

/* ────────────────────────────────────────────────────────────────────────
 * Wire schemas (used by /api/plan)
 * ──────────────────────────────────────────────────────────────────────── */

export const zPlanInput = z.object({
  question: z.string().min(1).max(2000),
  hints: z
    .object({
      networks: z.array(z.enum(NETWORKS)).optional(),
      schemas: z.array(z.enum(SCHEMA_FAMILIES)).optional(),
      tier: z.enum(AGENCY_TIERS).optional(),
    })
    .optional(),
});

export const zPlanResult = z.object({
  intent: z.string(),
  schemas: z.array(z.enum(SCHEMA_FAMILIES)).min(1),
  networks: z.array(z.enum(NETWORKS)).min(1),
  queries: z.record(z.string(), z.string()),
  variables: z.record(z.string(), z.unknown()),
  tier: z.enum(AGENCY_TIERS),
  attestationRef: z.string().nullable(),
  model: z.string(),
});

/* ────────────────────────────────────────────────────────────────────────
 * GraphQL template library — the only place query text is written
 *
 * Field aliases are used deliberately: aliasing `chainID` to `source` makes
 * the result set self-describing, so shape detection classifies it without
 * a per-schema special case.
 * ──────────────────────────────────────────────────────────────────────── */

export interface SchemaQueries {
  /** Top-N entities ordered by the family's headline metric. */
  rank: string;
  /** Daily snapshots over a window. */
  timeseries: string;
  /** Protocol-level totals — one row. */
  totals: string;
  /** A user's holdings. Only families that model them. */
  position?: string;
  /** source → destination volume. Bridges only. */
  flow?: string;
  /** Large individual events. */
  events?: string;
}

const FINANCIALS = (extra: string) => `query Financials($first: Int!, $since: Int!) {
  financialsDailySnapshots(
    first: $first
    orderBy: timestamp
    orderDirection: desc
    where: { timestamp_gte: $since }
  ) { timestamp totalValueLockedUSD ${extra} }
}`;

export const SCHEMA_QUERIES: Record<SchemaFamily, SchemaQueries> = {
  "generic@3.0.0": {
    rank: `query TopProtocols($first: Int!) {
  protocols(first: $first, orderBy: totalValueLockedUSD, orderDirection: desc) {
    id name: name totalValueLockedUSD cumulativeTotalRevenueUSD cumulativeUniqueUsers
  }
}`,
    timeseries: FINANCIALS("dailyTotalRevenueUSD dailySupplySideRevenueUSD"),
    totals: `query ProtocolTotals {
  protocols(first: 1) {
    id name totalValueLockedUSD cumulativeTotalRevenueUSD cumulativeUniqueUsers
  }
}`,
  },

  "dex-amm@1.3.2": {
    rank: `query TopPools($first: Int!) {
  liquidityPools(first: $first, orderBy: totalValueLockedUSD, orderDirection: desc) {
    id name totalValueLockedUSD cumulativeVolumeUSD cumulativeSupplySideRevenueUSD
  }
}`,
    timeseries: FINANCIALS("dailyVolumeUSD dailyTotalRevenueUSD"),
    totals: `query DexTotals {
  dexAmmProtocols(first: 1) {
    id name totalValueLockedUSD cumulativeVolumeUSD cumulativeUniqueUsers
  }
}`,
    events: `query LargeSwaps($first: Int!, $since: Int!, $minUsd: BigDecimal!) {
  swaps(
    first: $first
    orderBy: amountInUSD
    orderDirection: desc
    where: { timestamp_gte: $since, amountInUSD_gte: $minUsd }
  ) { id timestamp account: from amountInUSD amountOutUSD }
}`,
  },

  "dex-amm-extended@4.0.1": {
    rank: `query TopPoolsExtended($first: Int!) {
  liquidityPools(first: $first, orderBy: totalValueLockedUSD, orderDirection: desc) {
    id name totalValueLockedUSD cumulativeVolumeUSD activeLiquidity: activeLiquidityUSD
  }
}`,
    timeseries: FINANCIALS("dailyVolumeUSD dailyTotalRevenueUSD"),
    totals: `query DexExtendedTotals {
  dexAmmProtocols(first: 1) {
    id name totalValueLockedUSD cumulativeVolumeUSD cumulativeUniqueUsers
  }
}`,
  },

  "dex-aggregator@1.0.2": {
    rank: `query TopAggregators($first: Int!) {
  protocols(first: $first, orderBy: cumulativeVolumeUSD, orderDirection: desc) {
    id name cumulativeVolumeUSD cumulativeUniqueUsers
  }
}`,
    timeseries: FINANCIALS("dailyVolumeUSD dailyTotalRevenueUSD"),
    totals: `query AggregatorTotals {
  protocols(first: 1) { id name cumulativeVolumeUSD cumulativeUniqueUsers }
}`,
  },

  "lending-cdp@3.1.0": {
    rank: `query TopMarkets($first: Int!) {
  markets(first: $first, orderBy: totalValueLockedUSD, orderDirection: desc) {
    id name totalValueLockedUSD totalDepositBalanceUSD totalBorrowBalanceUSD
    maximumLTV liquidationThreshold
  }
}`,
    timeseries: FINANCIALS("dailyTotalRevenueUSD totalBorrowBalanceUSD"),
    totals: `query LendingTotals {
  lendingProtocols(first: 1) {
    id name totalValueLockedUSD totalDepositBalanceUSD totalBorrowBalanceUSD
  }
}`,
    position: `query AccountPositions($account: String!, $first: Int!) {
  positions(first: $first, where: { account: $account, hashClosed: null }) {
    id side balance: balance principal isCollateral
    market: market { id name maximumLTV liquidationThreshold inputTokenPriceUSD }
  }
}`,
  },

  "yield-aggregator@1.3.1": {
    rank: `query TopVaults($first: Int!) {
  vaults(first: $first, orderBy: totalValueLockedUSD, orderDirection: desc) {
    id name totalValueLockedUSD inputTokenBalance outputTokenPriceUSD
  }
}`,
    timeseries: FINANCIALS("dailyTotalRevenueUSD dailySupplySideRevenueUSD"),
    totals: `query YieldTotals {
  yieldAggregators(first: 1) {
    id name totalValueLockedUSD cumulativeTotalRevenueUSD cumulativeUniqueUsers
  }
}`,
    position: `query VaultPositions($account: String!, $first: Int!) {
  positions(first: $first, where: { account: $account }) {
    id balance: balance principal
    vault: vault { id name totalValueLockedUSD }
  }
}`,
  },

  "nft-marketplace@2.1.0": {
    rank: `query TopCollections($first: Int!) {
  collections(first: $first, orderBy: cumulativeTradeVolumeETH, orderDirection: desc) {
    id name cumulativeTradeVolumeETH tradeCount royaltyFee
  }
}`,
    timeseries: `query CollectionHistory($first: Int!, $since: Int!) {
  collectionDailySnapshots(
    first: $first
    orderBy: timestamp
    orderDirection: desc
    where: { timestamp_gte: $since }
  ) { timestamp dailyTradeVolumeETH dailyMinSalePrice dailyMaxSalePrice }
}`,
    totals: `query MarketplaceTotals {
  marketplaces(first: 1) {
    id name cumulativeTradeVolumeETH collectionCount tradeCount
  }
}`,
  },

  "network@1.2.0": {
    rank: `query NetworkTotals($first: Int!) {
  networks(first: $first) {
    id blockHeight dailyBlocks: dailyBlocks cumulativeUniqueAuthors
  }
}`,
    timeseries: `query NetworkActivity($first: Int!, $since: Int!) {
  dailySnapshots(
    first: $first
    orderBy: timestamp
    orderDirection: desc
    where: { timestamp_gte: $since }
  ) { timestamp dailyTransactionCount dailyActiveAuthors dailyGasUsed }
}`,
    totals: `query NetworkSummary {
  networks(first: 1) { id blockHeight cumulativeUniqueAuthors cumulativeTransactionCount }
}`,
  },

  "bridge@1.2.0": {
    rank: `query TopBridgePools($first: Int!) {
  pools(first: $first, orderBy: totalValueLockedUSD, orderDirection: desc) {
    id name totalValueLockedUSD cumulativeVolumeIn: cumulativeVolumeInUSD
    cumulativeVolumeOut: cumulativeVolumeOutUSD
  }
}`,
    timeseries: FINANCIALS("dailyVolumeInUSD dailyVolumeOutUSD"),
    totals: `query BridgeTotals {
  bridgeProtocols(first: 1) {
    id name totalValueLockedUSD cumulativeVolumeInUSD cumulativeVolumeOutUSD
  }
}`,
    flow: `query BridgeFlows($first: Int!, $since: Int!) {
  bridgeTransfers(
    first: $first
    orderBy: timestamp
    orderDirection: desc
    where: { timestamp_gte: $since }
  ) { id timestamp source: chainID destination: crossChainID amountUSD: amountReceivedUSD }
}`,
  },

  "perp-futures@1.3.4": {
    rank: `query PerpMarkets($first: Int!) {
  liquidityPools(first: $first, orderBy: totalValueLockedUSD, orderDirection: desc) {
    id name totalValueLockedUSD openInterestUSD
    longOpenInterestUSD shortOpenInterestUSD cumulativeVolumeUSD
  }
}`,
    timeseries: FINANCIALS("dailyVolumeUSD dailyTotalRevenueUSD"),
    totals: `query PerpTotals {
  derivPerpProtocols(first: 1) {
    id name totalValueLockedUSD openInterestUSD cumulativeVolumeUSD
  }
}`,
    position: `query PerpPositions($account: String!, $first: Int!) {
  positions(first: $first, where: { account: $account, hashClosed: null }) {
    id side balance: balanceUSD collateralBalanceUSD leverage
    realisedPnlUSD unrealisedPnlUSD liquidationPrice
  }
}`,
  },

  "options@1.3.2": {
    rank: `query OptionMarkets($first: Int!) {
  liquidityPools(first: $first, orderBy: totalValueLockedUSD, orderDirection: desc) {
    id name totalValueLockedUSD openInterestUSD cumulativeVolumeUSD
  }
}`,
    timeseries: FINANCIALS("dailyVolumeUSD dailyTotalRevenueUSD"),
    totals: `query OptionsTotals {
  derivOptProtocols(first: 1) {
    id name totalValueLockedUSD openInterestUSD cumulativeVolumeUSD
  }
}`,
  },
};

/* ────────────────────────────────────────────────────────────────────────
 * Lexicon — schema families, networks, entities from the question text
 * ──────────────────────────────────────────────────────────────────────── */

const SCHEMA_KEYWORDS: ReadonlyArray<[SchemaFamily, RegExp]> = [
  ["dex-amm-extended@4.0.1", /\b(concentrated liquidity|tick|uniswap v3|uni v3|in[- ]range|position range)\b/i],
  ["dex-aggregator@1.0.2", /\b(aggregator|1inch|paraswap|0x|cowswap|odos|routing|best route)\b/i],
  ["dex-amm@1.3.2", /\b(dex|dexs|dexes|amm|swap|swaps|uniswap|sushi|curve|balancer|velodrome|aerodrome|camelot|liquidity pool|pools?|trading volume)\b/i],
  ["lending-cdp@3.1.0", /\b(lend|lending|borrow|borrowing|aave|compound|morpho|spark|radiant|maker|cdp|collateral|health factor|healthfactor|ltv|liquidation|debt|supply apy|utilization)\b/i],
  ["yield-aggregator@1.3.1", /\b(yield|vault|vaults|yearn|beefy|convex|autocompound|auto-compound|farm|farming|erc4626|apy)\b/i],
  ["nft-marketplace@2.1.0", /\b(nft|nfts|opensea|blur|looksrare|collection|collections|floor price|mint volume)\b/i],
  // "across" and "hop" are protocol names but also ordinary English — they
  // only count when they are unambiguously naming the protocol.
  ["bridge@1.2.0", /\b(bridge|bridged|bridging|cross[- ]chain|across (?:protocol|bridge)|hop (?:protocol|bridge)|stargate|wormhole|layerzero|synapse|inflow|outflow)\b/i],
  ["perp-futures@1.3.4", /\b(perp|perps|perpetual|funding rate|funding|open interest|gmx|hyperliquid|gains|futures|long\/short|leverage)\b/i],
  ["options@1.3.2", /\b(option|options|strike|expiry|call option|put option|lyra|premia|dopex|implied vol)\b/i],
  ["network@1.2.0", /\b(network|gas|gas price|blocks?|block time|chain activity|transactions per|daily transactions|active addresses)\b/i],
];

const NETWORK_KEYWORDS: ReadonlyArray<[Network, RegExp]> = [
  ["arbitrum-one", /\b(arbitrum|arb|arbitrum one)\b/i],
  ["optimism", /\b(optimism|op mainnet|\bop\b)\b/i],
  ["base", /\b(base|basechain)\b/i],
  ["mainnet", /\b(mainnet|ethereum|l1|eth mainnet)\b/i],
];

/** Default network set. Multi-chain is where standardized schemas pay off. */
export const DEFAULT_NETWORKS: Network[] = ["arbitrum-one", "optimism", "base"];

const ACTION_VERBS =
  /\b(sell|buy|swap|trade|rebalance|repay|borrow|supply|withdraw|deposit|claim|harvest|compound|unwind|close|exit|hedge|stake|unstake|top ?up|delever|deleverage)\b/i;
const CONDITIONAL = /\b(if|when|whenever|once|as soon as|in case|should|unless|until)\b/i;
const THRESHOLDY =
  /\b(drops?|falls?|rises?|exceeds?|crosses?|breaches?|below|above|under|over|reaches?|hits?|goes? (?:below|above)|less than|greater than|depegs?|less|more)\b/i;
const NOTIFY =
  /\b(alert|alerts?|notify|notification|tell me|let me know|ping me?|warn|watch|monitor|track|remind|email me|dm me|heads up)\b/i;
const AUTONOMY_WORDS = /\b(automatically|automatic|autonomous|auto[- ]?(?:sell|buy|rebalance|repay)|on my behalf|without asking|for me)\b/i;
const ANALYTICS_OPENER = /^\s*(show|list|what|which|who|how|display|compare|find|give|chart|graph|plot|rank|top)\b/i;

/* ────────────────────────────────────────────────────────────────────────
 * Tier inference
 * ──────────────────────────────────────────────────────────────────────── */

const TIER_RANK: Record<AgencyTier, number> = { readonly: 0, monitor: 1, autonomous: 2 };

export function maxTier(a: AgencyTier, b: AgencyTier): AgencyTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

export interface TierVerdict {
  tier: AgencyTier;
  reason: string;
}

/**
 * Deterministic tier classification. Runs on every question, including when
 * the model is live — the model can raise the tier, never lower it.
 */
export function inferTier(question: string): TierVerdict {
  const q = question.trim();
  const hasAction = ACTION_VERBS.test(q);
  const hasConditional = CONDITIONAL.test(q) || THRESHOLDY.test(q);
  const hasNotify = NOTIFY.test(q);
  const hasAutonomy = AUTONOMY_WORDS.test(q);
  const firstPerson = /\bmy\b|\bmine\b|\bi (?:own|hold|have)\b/i.test(q);
  const startsWithAction = ACTION_VERBS.test(q.split(/\s+/).slice(0, 2).join(" "));
  const isAnalyticsQuestion = ANALYTICS_OPENER.test(q);
  const hasAmount = /(\$\s?[\d,.]+|\b[\d,.]+\s?(usdc|usdt|dai|eth|weth|wbtc|btc|usd)\b)/i.test(q);

  if (hasAutonomy && (hasAction || hasConditional)) {
    return { tier: "autonomous", reason: "Asks the app to act on its own." };
  }
  if (hasAction && !isAnalyticsQuestion) {
    if (hasConditional) return { tier: "autonomous", reason: "An action gated on a condition — the app must be able to execute." };
    if (firstPerson) return { tier: "autonomous", reason: "An action on the user's own position." };
    if (startsWithAction) return { tier: "autonomous", reason: "Imperative action request." };
    if (hasAmount) return { tier: "autonomous", reason: "An action with an explicit amount." };
  }
  if (hasNotify) return { tier: "monitor", reason: "Wants to be told when something happens — watches, cannot spend." };
  if (hasConditional && !isAnalyticsQuestion) {
    return { tier: "monitor", reason: "A standing condition to evaluate — watches, cannot spend." };
  }
  return { tier: "readonly", reason: "A question about data. Nothing to execute." };
}

/* ────────────────────────────────────────────────────────────────────────
 * Extraction
 * ──────────────────────────────────────────────────────────────────────── */

export interface Extracted {
  schemas: SchemaFamily[];
  networks: Network[];
  limit: number;
  days: number;
  account: string | null;
  tokens: string[];
  threshold: { field: string; op: "lt" | "lte" | "gt" | "gte"; value: number } | null;
  minUsd: number;
}

const KNOWN_SYMBOLS =
  /\b(ETH|WETH|BTC|WBTC|USDC|USDT|DAI|ARB|OP|GMX|LINK|UNI|AAVE|CRV|LDO|MKR|PENDLE|RDNT|SUSHI|FRAX|GHO|WSTETH|RETH|CBETH)\b/g;

export function extract(question: string, hints?: PlanInput["hints"]): Extracted {
  const q = question;

  const matchedSchemas = SCHEMA_KEYWORDS.filter(([, re]) => re.test(q)).map(([s]) => s);
  const schemas = dedupe([...(hints?.schemas ?? []), ...matchedSchemas]);
  if (schemas.length === 0) schemas.push("generic@3.0.0");

  const matchedNetworks = NETWORK_KEYWORDS.filter(([, re]) => re.test(q)).map(([n]) => n);
  const networks = dedupe([...(hints?.networks ?? []), ...matchedNetworks]);
  if (networks.length === 0) networks.push(...DEFAULT_NETWORKS);

  const topN = q.match(/\btop\s+(\d{1,3})\b/i) ?? q.match(/\b(\d{1,3})\s+(?:biggest|largest|best|worst)\b/i);
  const limit = clamp(topN ? Number(topN[1]) : 10, 1, 100);

  const days = extractDays(q);

  const addr = q.match(/\b0x[0-9a-fA-F]{40}\b/);
  const ens = q.match(/\b[a-z0-9-]{3,}\.eth\b/i);
  const account = addr ? addr[0].toLowerCase() : ens ? ens[0].toLowerCase() : null;

  const tokens = dedupe([...(q.toUpperCase().match(KNOWN_SYMBOLS) ?? [])]).slice(0, 6);

  return {
    schemas: schemas.slice(0, 4),
    networks: networks.slice(0, 4),
    limit,
    days,
    account,
    tokens,
    threshold: extractThreshold(q),
    minUsd: extractMinUsd(q),
  };
}

function extractDays(q: string): number {
  const explicit = q.match(/\b(?:last|past|previous)\s+(\d{1,3})\s*(hour|hours|h|day|days|d|week|weeks|w|month|months|mo|year|years|y)\b/i);
  if (explicit) {
    const n = Number(explicit[1]);
    const unit = explicit[2].toLowerCase();
    if (unit.startsWith("h")) return clamp(Math.ceil(n / 24), 1, 365);
    if (unit.startsWith("w")) return clamp(n * 7, 1, 365);
    if (unit.startsWith("mo") || unit === "m") return clamp(n * 30, 1, 365);
    if (unit.startsWith("y")) return clamp(n * 365, 1, 365);
    return clamp(n, 1, 365);
  }
  if (/\b(24h|24 hours|today|daily|yesterday)\b/i.test(q)) return 1;
  if (/\b(7d|week|weekly)\b/i.test(q)) return 7;
  if (/\b(30d|month|monthly)\b/i.test(q)) return 30;
  if (/\b(90d|quarter)\b/i.test(q)) return 90;
  if (/\b(year|ytd|annual)\b/i.test(q)) return 365;
  return 30;
}

const THRESHOLD_FIELDS: ReadonlyArray<[string, RegExp]> = [
  ["healthFactor", /\bhealth ?factor\b|\bhf\b/i],
  ["totalValueLockedUSD", /\btvl\b|total value locked/i],
  ["inputTokenPriceUSD", /\bprice\b|\bdepegs?\b/i],
  ["fundingRate", /funding ?rate/i],
  ["utilization", /utili[sz]ation/i],
  ["maximumLTV", /\bltv\b/i],
  ["cumulativeVolumeUSD", /\bvolume\b/i],
];

function extractThreshold(q: string): Extracted["threshold"] {
  const cmp = q.match(
    /\b(below|under|less than|<|drops? (?:below|under)|falls? (?:below|under)|above|over|greater than|>|exceeds?|rises? above|crosses? above)\s*\$?\s*([\d]+(?:\.\d+)?)\s*(%)?/i,
  );
  if (!cmp) return null;
  const word = cmp[1].toLowerCase();
  const isLower = /below|under|less|<|drop|fall/.test(word);
  let value = Number(cmp[2]);
  if (cmp[3] === "%") value = value / 100;
  const field = THRESHOLD_FIELDS.find(([, re]) => re.test(q))?.[0] ?? "value";
  return { field, op: isLower ? "lt" : "gt", value };
}

function extractMinUsd(q: string): number {
  const m = q.match(/\$\s?([\d,]+(?:\.\d+)?)\s*(k|m|mm|b)?/i);
  if (!m) return 100_000;
  let n = Number(m[1].replace(/,/g, ""));
  const suffix = (m[2] ?? "").toLowerCase();
  if (suffix === "k") n *= 1_000;
  if (suffix === "m" || suffix === "mm") n *= 1_000_000;
  if (suffix === "b") n *= 1_000_000_000;
  return clamp(n, 1_000, 1_000_000_000);
}

function dedupe<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
function clamp(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}

/* ────────────────────────────────────────────────────────────────────────
 * The ten hardcoded intent patterns
 * ──────────────────────────────────────────────────────────────────────── */

export type IntentId =
  | "top_n_by_metric"
  | "metric_over_time"
  | "compare_entities"
  | "watch_threshold"
  | "rebalance_on_threshold"
  | "portfolio_position"
  | "cross_protocol_tvl"
  | "funding_rates"
  | "whale_movements"
  | "bridge_flows";

export interface IntentPattern {
  id: IntentId;
  /** Higher wins when several patterns match. */
  priority: number;
  /** Tier floor this pattern implies, before `inferTier` is applied. */
  tierFloor: AgencyTier;
  match: (q: string) => boolean;
  /** Schemas this pattern forces, on top of whatever was extracted. */
  schemas?: SchemaFamily[];
  build: (q: string, ex: Extracted) => { intent: string; queries: Record<string, string>; variables: Record<string, unknown> };
}

function sinceFor(days: number): number {
  return Math.floor(Date.now() / 1000) - days * 86_400;
}

/** Pull the family-appropriate template, falling back to generic. */
function q(schema: SchemaFamily, key: keyof SchemaQueries): string {
  const set = SCHEMA_QUERIES[schema];
  const found = set[key];
  if (typeof found === "string") return found;
  const generic = SCHEMA_QUERIES["generic@3.0.0"];
  const fallback = generic[key];
  return typeof fallback === "string" ? fallback : generic.rank;
}

function rankQueries(ex: Extracted): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of ex.schemas) out[`rank:${s}`] = q(s, "rank");
  return out;
}

function timeseriesQueries(ex: Extracted): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of ex.schemas) out[`history:${s}`] = q(s, "timeseries");
  return out;
}

export const INTENT_PATTERNS: IntentPattern[] = [
  {
    id: "rebalance_on_threshold",
    priority: 100,
    tierFloor: "autonomous",
    match: (s) => ACTION_VERBS.test(s) && (CONDITIONAL.test(s) || THRESHOLDY.test(s) || AUTONOMY_WORDS.test(s)),
    build: (s, ex) => {
      const th = ex.threshold ?? { field: "healthFactor", op: "lt" as const, value: 1.4 };
      const verb = (s.match(ACTION_VERBS)?.[0] ?? "swap").toLowerCase();
      return {
        intent: `Watch ${th.field} and ${verb} when it goes ${th.op === "lt" ? "below" : "above"} ${th.value}.`,
        queries: {
          ...rankQueries(ex),
          ...(ex.account ? { position: q(ex.schemas[0], "position") } : {}),
          guard: q(ex.schemas[0], "totals"),
        },
        variables: {
          first: ex.limit,
          since: sinceFor(ex.days),
          days: ex.days,
          account: ex.account,
          tokens: ex.tokens,
          threshold: th,
          orderBy: th.field,
          action: { kind: actionKindFor(verb), label: capitalize(verb), verb },
        },
      };
    },
  },
  {
    id: "watch_threshold",
    priority: 90,
    tierFloor: "monitor",
    match: (s) => NOTIFY.test(s) || (CONDITIONAL.test(s) && THRESHOLDY.test(s)),
    build: (s, ex) => {
      const th = ex.threshold ?? { field: "totalValueLockedUSD", op: "lt" as const, value: 0 };
      return {
        intent: `Watch ${th.field} and alert when it goes ${th.op === "lt" ? "below" : "above"} ${th.value}.`,
        queries: {
          ...rankQueries(ex),
          watch: q(ex.schemas[0], "totals"),
          ...timeseriesQueries(ex),
        },
        variables: {
          first: ex.limit,
          since: sinceFor(ex.days),
          days: ex.days,
          threshold: th,
          tokens: ex.tokens,
          orderBy: th.field,
        },
      };
    },
  },
  {
    id: "portfolio_position",
    priority: 80,
    tierFloor: "readonly",
    match: (s) => /\b(my|portfolio|position|positions|holdings|wallet|exposure)\b/i.test(s) || /\b0x[0-9a-fA-F]{40}\b/.test(s),
    build: (_s, ex) => ({
      intent: `Show the position${ex.account ? ` held by ${ex.account}` : ""}.`,
      queries: {
        position: q(ex.schemas[0], "position"),
        market: q(ex.schemas[0], "rank"),
      },
      variables: { account: ex.account, first: Math.max(ex.limit, 25), tokens: ex.tokens, orderBy: "balance" },
    }),
  },
  {
    id: "funding_rates",
    priority: 75,
    tierFloor: "readonly",
    schemas: ["perp-futures@1.3.4"],
    match: (s) => /\b(funding rate|funding|open interest|perp|perpetual|long\/short|basis)\b/i.test(s),
    build: (_s, ex) => ({
      intent: "Compare funding rates and open interest across perp venues.",
      queries: { "rank:perp-futures@1.3.4": q("perp-futures@1.3.4", "rank"), ...timeseriesQueries(ex) },
      variables: { first: ex.limit, since: sinceFor(ex.days), days: ex.days, orderBy: "openInterestUSD" },
    }),
  },
  {
    id: "bridge_flows",
    priority: 74,
    tierFloor: "readonly",
    schemas: ["bridge@1.2.0"],
    match: (s) => /\b(bridge|bridged|bridging|cross[- ]chain|flows? (?:between|from|to)|inflow|outflow)\b/i.test(s),
    build: (_s, ex) => ({
      intent: "Show bridge flows between chains by volume.",
      queries: { flow: q("bridge@1.2.0", "flow"), "rank:bridge@1.2.0": q("bridge@1.2.0", "rank") },
      variables: { first: Math.max(ex.limit, 25), since: sinceFor(ex.days), days: ex.days, orderBy: "amountUSD" },
    }),
  },
  {
    id: "whale_movements",
    priority: 72,
    tierFloor: "readonly",
    schemas: ["dex-amm@1.3.2"],
    match: (s) => /\b(whale|whales|large (?:swap|trade|transfer|buy|sell)s?|big (?:trades?|swaps?)|smart money)\b/i.test(s),
    build: (_s, ex) => ({
      intent: "Surface the largest recent swaps.",
      queries: { events: q("dex-amm@1.3.2", "events") },
      variables: {
        first: Math.max(ex.limit, 50),
        since: sinceFor(Math.min(ex.days, 7)),
        days: Math.min(ex.days, 7),
        minUsd: ex.minUsd,
        orderBy: "amountInUSD",
      },
    }),
  },
  {
    id: "cross_protocol_tvl",
    priority: 70,
    tierFloor: "readonly",
    match: (s) => /\b(tvl|total value locked)\b/i.test(s) && /\b(across|by chain|per chain|all|every|breakdown|split)\b/i.test(s),
    build: (_s, ex) => ({
      intent: "Break total value locked down across protocols and chains.",
      queries: { ...rankQueries(ex), ...timeseriesQueries(ex) },
      variables: { first: ex.limit, since: sinceFor(ex.days), days: ex.days, orderBy: "totalValueLockedUSD" },
    }),
  },
  {
    id: "compare_entities",
    priority: 65,
    tierFloor: "readonly",
    match: (s) => /\b(compare|versus|\bvs\b|against each other|side by side|difference between|better)\b/i.test(s),
    build: (_s, ex) => ({
      intent: "Compare the named protocols across their shared metrics.",
      queries: { ...rankQueries(ex), ...timeseriesQueries(ex) },
      variables: { first: Math.min(ex.limit, 6), since: sinceFor(ex.days), days: ex.days, orderBy: "totalValueLockedUSD" },
    }),
  },
  {
    id: "metric_over_time",
    priority: 60,
    tierFloor: "readonly",
    match: (s) => /\b(over time|history|historical|trend|trending|chart|graph|plot|daily|weekly|monthly|last \d+|past \d+|growth|since)\b/i.test(s),
    build: (_s, ex) => ({
      intent: `Chart the headline metric over the last ${ex.days} days.`,
      queries: { ...timeseriesQueries(ex) },
      variables: { first: Math.min(ex.days, 365), since: sinceFor(ex.days), days: ex.days, orderBy: "totalValueLockedUSD" },
    }),
  },
  {
    id: "top_n_by_metric",
    priority: 50,
    tierFloor: "readonly",
    match: (s) => /\b(top|best|largest|biggest|highest|leading|rank|ranking|most|worst|lowest)\b/i.test(s),
    build: (_s, ex) => ({
      intent: `Rank the top ${ex.limit} by their headline metric.`,
      queries: { ...rankQueries(ex) },
      variables: { first: ex.limit, orderBy: "totalValueLockedUSD", orderDirection: "desc", since: sinceFor(ex.days), days: ex.days },
    }),
  },
];

function actionKindFor(verb: string): "swap" | "supply" | "withdraw" | "repay" | "claim" | "notify" {
  if (/repay|delever/.test(verb)) return "repay";
  if (/supply|deposit|stake|top ?up/.test(verb)) return "supply";
  if (/withdraw|unstake|exit|close|unwind/.test(verb)) return "withdraw";
  if (/claim|harvest/.test(verb)) return "claim";
  if (/sell|buy|swap|trade|rebalance|hedge|borrow/.test(verb)) return "swap";
  return "notify";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface PatternHit {
  pattern: IntentPattern;
  intent: string;
  queries: Record<string, string>;
  variables: Record<string, unknown>;
  extracted: Extracted;
}

/** Best hardcoded pattern for a question, or null. */
export function matchPattern(question: string, hints?: PlanInput["hints"]): PatternHit | null {
  const hit = INTENT_PATTERNS.filter((p) => p.match(question)).sort((a, b) => b.priority - a.priority)[0];
  if (!hit) return null;
  const base = extract(question, hints);
  const extracted: Extracted = hit.schemas
    ? { ...base, schemas: dedupe([...hit.schemas, ...base.schemas]).slice(0, 4) }
    : base;
  const built = hit.build(question, extracted);
  return { pattern: hit, extracted, ...built };
}

/* ────────────────────────────────────────────────────────────────────────
 * The rules-only plan — always available, no keys required
 * ──────────────────────────────────────────────────────────────────────── */

export function planWithRules(input: PlanInput): PlanResult {
  const question = sanitizeForPrompt(input.question, 400);
  const verdict = inferTier(input.question);
  const hit = matchPattern(input.question, input.hints);
  const ex = hit?.extracted ?? extract(input.question, input.hints);

  let tier = verdict.tier;
  if (hit) tier = maxTier(tier, hit.pattern.tierFloor);
  if (input.hints?.tier) tier = maxTier(tier, input.hints.tier);

  const queries = hit?.queries ?? { ...rankQueries(ex), ...timeseriesQueries(ex) };
  const variables: Record<string, unknown> = {
    first: ex.limit,
    since: sinceFor(ex.days),
    days: ex.days,
    orderBy: "totalValueLockedUSD",
    orderDirection: "desc",
    ...(hit?.variables ?? {}),
    account: hit?.variables.account ?? ex.account,
    tokens: ex.tokens,
    minUsd: ex.minUsd,
    threshold: ex.threshold ?? (hit?.variables.threshold as Extracted["threshold"] | undefined) ?? null,
    _pattern: hit?.pattern.id ?? "generic_fallback",
    _tierReason: verdict.reason,
    _question: question,
  };

  if (tier === "autonomous" && !variables.action) {
    const verb = (input.question.match(ACTION_VERBS)?.[0] ?? "swap").toLowerCase();
    variables.action = { kind: actionKindFor(verb), label: capitalize(verb), verb };
  }

  return {
    intent: hit?.intent ?? `Answer: ${question}`,
    schemas: ex.schemas,
    networks: ex.networks,
    queries,
    variables,
    tier,
    attestationRef: null,
    model: STUB_MODEL,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * The model path — generalizes beyond the ten patterns
 * ──────────────────────────────────────────────────────────────────────── */

const zModelPlan = z.object({
  intent: z.string().min(4).max(300),
  schemas: z.array(z.enum(SCHEMA_FAMILIES)).min(1).max(4),
  networks: z.array(z.enum(NETWORKS)).min(1).max(4),
  tier: z.enum(AGENCY_TIERS),
  /** Which template family to use. The model never writes GraphQL. */
  shape: z.enum(["rank", "timeseries", "totals", "position", "flow", "events"]),
  metric: z.string().max(60).nullable().optional(),
  limit: z.number().int().min(1).max(100).nullable().optional(),
  days: z.number().int().min(1).max(365).nullable().optional(),
  threshold: z
    .object({ field: z.string().max(60), op: z.enum(["lt", "lte", "gt", "gte"]), value: z.number() })
    .nullable()
    .optional(),
  actionVerb: z.string().max(24).nullable().optional(),
});
type ModelPlan = z.infer<typeof zModelPlan>;

const SYSTEM_PROMPT = `You are the query planner for Graph Mini Apps. You turn one natural-language question about onchain data into a structured plan.

You do NOT write GraphQL. You choose a schema family, the networks, a template shape, and its variables. The runtime assembles the query.

Schema families (Messari standardized schemas via The Graph):
${SCHEMA_FAMILIES.join("\n")}

Networks: ${NETWORKS.join(", ")}

Template shapes:
- rank        top-N entities ordered by a headline metric
- timeseries  daily snapshots over a window
- totals      protocol-level totals, one row
- position    one account's holdings (needs an address)
- flow        source -> destination volume (bridge family only)
- events      large individual events (swaps)

Agency tier — the most important field. Get it right:
- readonly    a question about data. "Show me the top DEXs by volume."
- monitor     a standing condition someone wants to be told about. Watches, cannot spend. "Tell me when USDC depegs."
- autonomous  the app is asked to take an onchain action, usually gated on a condition. It will hold a wallet. "Sell ETH if my health factor drops below 1.4."
If the request implies executing a trade, repayment, deposit or withdrawal, it is autonomous. If it only implies being told something, it is monitor.

Reply with JSON only, matching exactly:
{"intent":string,"schemas":[string],"networks":[string],"tier":"readonly"|"monitor"|"autonomous","shape":string,"metric":string|null,"limit":number|null,"days":number|null,"threshold":{"field":string,"op":"lt"|"lte"|"gt"|"gte","value":number}|null,"actionVerb":string|null}`;

function queriesForModelPlan(mp: ModelPlan, ex: Extracted): Record<string, string> {
  const out: Record<string, string> = {};
  const key = mp.shape;
  for (const s of mp.schemas) {
    const set = SCHEMA_QUERIES[s];
    const template = set[key];
    if (typeof template === "string") {
      out[`${key}:${s}`] = template;
    } else {
      out[`rank:${s}`] = set.rank;
    }
  }
  // A monitor or autonomous app always needs the current value it is watching.
  if (mp.tier !== "readonly") out.watch = q(mp.schemas[0], "totals");
  if (Object.keys(out).length === 0) Object.assign(out, rankQueries(ex));
  return out;
}

/* ────────────────────────────────────────────────────────────────────────
 * plan()
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * `Plan` from contracts/api.ts.
 *
 * Rules first, model second, rules again on any failure. The rules result is
 * never thrown away — it supplies the tier floor and every variable the model
 * did not produce.
 */
export const plan: Plan = async (input: PlanInput): Promise<PlanResult> => {
  const parsed = zPlanInput.safeParse(input);
  const safeInput: PlanInput = parsed.success
    ? parsed.data
    : { question: String(input?.question ?? "").slice(0, 2000), hints: input?.hints };

  const rules = planWithRules(safeInput);
  const cfg = getInferenceConfig();
  if (!cfg.live) return rules;

  const outcome = await chatJson(zModelPlan, {
    system: SYSTEM_PROMPT,
    // The question is quoted, not interpolated into an instruction. It is the
    // subject of the task, not part of it.
    user: `Question:\n"""${sanitizeForPrompt(safeInput.question, 600)}"""\n\nReturn the plan JSON.`,
    temperature: 0.1,
    maxTokens: 700,
    timeoutMs: 15_000,
  });

  if (!outcome) return rules;

  const mp = outcome.value;
  const ex = extract(safeInput.question, safeInput.hints);
  const days = mp.days ?? ex.days;
  const limit = mp.limit ?? ex.limit;

  // The model may raise the tier. It may never lower it below what the rules
  // engine and the caller's hint already established.
  let tier = maxTier(rules.tier, mp.tier);
  if (safeInput.hints?.tier) tier = maxTier(tier, safeInput.hints.tier);

  const variables: Record<string, unknown> = {
    ...rules.variables,
    first: limit,
    since: sinceFor(days),
    days,
    orderBy: mp.metric ?? rules.variables.orderBy,
    threshold: mp.threshold ?? rules.variables.threshold ?? null,
    _pattern: rules.variables._pattern,
    _generalized: true,
    _shape: mp.shape,
  };

  if (tier === "autonomous") {
    const verb = (mp.actionVerb ?? safeInput.question.match(ACTION_VERBS)?.[0] ?? "swap").toLowerCase();
    variables.action = { kind: actionKindFor(verb), label: capitalize(verb), verb };
  }

  const modelQueries = queriesForModelPlan({ ...mp, tier }, ex);

  return {
    intent: sanitizeForPrompt(mp.intent, 300) || rules.intent,
    schemas: dedupe([...mp.schemas, ...(tier === "autonomous" ? rules.schemas : [])]).slice(0, 4),
    networks: mp.networks.length > 0 ? mp.networks : rules.networks,
    // Keep the pattern's queries alongside the model's: if the model picked a
    // narrower shape we still have the reliable one to render from.
    queries: { ...modelQueries, ...(rules.variables._pattern !== "generic_fallback" ? rules.queries : {}) },
    variables,
    tier,
    attestationRef: outcome.attestationRef,
    model: outcome.model,
  };
};

export default plan;
