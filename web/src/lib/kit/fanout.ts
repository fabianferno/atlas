/**
 * W1 — `FanOut` from contracts/api.ts. The centre of the whole project.
 *
 * Track 3 says outright that "simply querying one Subgraph with no composition
 * does not qualify". This is the composition: the same query shape fired at
 * every healthy deployment across two or more schema families and two or more
 * networks, merged into one table.
 *
 * Two invariants, both non-negotiable:
 *   1. It never throws. A dead source is a row in `sourcesFailed`, not an
 *      exception that takes the other thirty with it.
 *   2. It never retries a dead source inline. Retries turn one slow source into
 *      a slow fan-out, and the health check already told us who is alive.
 */
import type { SchemaFamily, Source } from "@/lib/contracts/manifest";
import type { FanOut, FanOutResult, PlanResult } from "@/lib/contracts/api";
import { graphQuery, isLive, type Transport } from "./gateway";
import { lookupEntry } from "./sources";

/** Fields on the Messari `Protocol` interface, present in every schema family
 *  and every schema version we register. This is what makes one query shape
 *  work across families at all. */
const PROTOCOL_CORE = `
    id
    name
    slug
    network
    type
    schemaVersion
    totalValueLockedUSD
    cumulativeSupplySideRevenueUSD
    cumulativeProtocolSideRevenueUSD
    cumulativeTotalRevenueUSD
    cumulativeUniqueUsers`;

/**
 * The last resort. Only interface fields, no arguments beyond `first` — if this
 * fails the deployment is not a standardized subgraph at all.
 */
const CORE_QUERY = `query GraphMinisCore {
  protocols(first: 1) {
    id
    name
    slug
    network
    type
    totalValueLockedUSD
    cumulativeUniqueUsers
  }
}`;

/**
 * Per-family defaults. Used when the plan has no query for a family — which is
 * the common case, because the planner writes one query for the family the user
 * asked about and the fan-out reaches four more.
 */
export const DEFAULT_QUERIES: Record<SchemaFamily, string> = {
  "generic@3.0.0": `query GraphMinisGeneric { protocols(first: 1) {${PROTOCOL_CORE} } }`,

  "dex-amm@1.3.2": `query GraphMinisDex {
  protocols(first: 1) {${PROTOCOL_CORE}
    ... on DexAmmProtocol { cumulativeVolumeUSD totalPoolCount }
  }
  liquidityPools(first: 5, orderBy: totalValueLockedUSD, orderDirection: desc) {
    id name symbol totalValueLockedUSD cumulativeVolumeUSD
    inputTokens { symbol }
  }
}`,

  "dex-amm-extended@4.0.1": `query GraphMinisDexExtended {
  protocols(first: 1) {${PROTOCOL_CORE}
    ... on DexAmmProtocol { cumulativeVolumeUSD totalPoolCount }
  }
  liquidityPools(first: 5, orderBy: totalValueLockedUSD, orderDirection: desc) {
    id name symbol totalValueLockedUSD cumulativeVolumeUSD
    inputTokens { symbol }
  }
}`,

  "dex-aggregator@1.0.2": `query GraphMinisDexAggregator { protocols(first: 1) {${PROTOCOL_CORE} } }`,

  "lending-cdp@3.1.0": `query GraphMinisLending {
  protocols(first: 1) {${PROTOCOL_CORE}
    ... on LendingProtocol {
      totalDepositBalanceUSD
      totalBorrowBalanceUSD
      cumulativeLiquidateUSD
    }
  }
  markets(first: 5, orderBy: totalValueLockedUSD, orderDirection: desc) {
    id name isActive totalValueLockedUSD totalDepositBalanceUSD totalBorrowBalanceUSD
    inputToken { symbol decimals }
    rates { side type rate }
  }
}`,

  "yield-aggregator@1.3.1": `query GraphMinisYield {
  protocols(first: 1) {${PROTOCOL_CORE}
    ... on YieldAggregator { protocolControlledValueUSD totalPoolCount }
  }
}`,

  // The NFT marketplace schema is the one family with no `Protocol` interface —
  // its root entity is `Marketplace`, with its own field names.
  //
  // AND it denominates in ETH, not USD. `cumulativeTradeVolumeUSD` /
  // `totalRevenueUSD` do not exist on `Marketplace`; asking for them is a hard
  // query error, so this family returned zero rows on every deployment until
  // the fields were read off the live schema. Verified by introspecting
  // OpenSea Seaport mainnet (`2GmLsgYGWoFoouZzKjp8biYDkfmeLTkEY3VDQyZqSJHA`)
  // on 2026-07-25: the only value fields are ETH-denominated. Anything
  // presenting these as dollars has to convert, and has to say it converted.
  "nft-marketplace@2.1.0": `query GraphMinisNft {
  marketplaces(first: 1) {
    id
    name
    slug
    network
    schemaVersion
    collectionCount
    tradeCount
    cumulativeTradeVolumeETH
    marketplaceRevenueETH
    creatorRevenueETH
    totalRevenueETH
    cumulativeUniqueTraders
  }
}`,

  // Likewise the network schema: root entity `Network`, no protocol at all.
  "network@1.2.0": `query GraphMinisNetwork {
  networks(first: 1) {
    id
    blockHeight
    cumulativeUniqueAuthors
    cumulativeDifficulty
    gasLimit
  }
}`,

  "bridge@1.2.0": `query GraphMinisBridge {
  protocols(first: 1) {${PROTOCOL_CORE}
    ... on BridgeProtocol { totalValueExportedUSD totalPoolCount }
  }
}`,

  "perp-futures@1.3.4": `query GraphMinisPerp {
  protocols(first: 1) {${PROTOCOL_CORE}
    ... on DerivPerpProtocol {
      cumulativeVolumeUSD
      longOpenInterestUSD
      shortOpenInterestUSD
      totalPoolCount
    }
  }
}`,

  "options@1.3.2": `query GraphMinisOptions { protocols(first: 1) {${PROTOCOL_CORE} } }`,
};

/** Root fields whose rows we lift into the merged table. */
const ROW_ROOTS = [
  "protocols",
  "lendingProtocols",
  "dexAmmProtocols",
  "yieldAggregators",
  "bridgeProtocols",
  "derivPerpProtocols",
  "derivOptProtocols",
  "marketplaces",
  "networks",
  "markets",
  "liquidityPools",
  "pools",
  "vaults",
  "financialsDailySnapshots",
  "usageMetricsDailySnapshots",
] as const;

export interface FanOutFailure {
  subgraphId: string;
  label: string;
  schema: SchemaFamily;
  network: string;
  reason: string;
}

export interface FanOutOptions {
  transport?: Transport;
  /** Per-source budget. Anything slower is dead weight in a parallel batch. */
  timeoutMs?: number;
  concurrency?: number;
  /** Hard ceiling on spend. At x402's $0.01/query, 40 sources is $0.40 — cheap,
   *  but an agent with a wallet should never be able to run this unbounded. */
  maxCostUsd?: number;
  /** Skip the interface-only retry when a family query hits an unknown field.
   *  Off by default; older deployments are missing later fields constantly. */
  noCoreFallback?: boolean;
}

export type DetailedFanOutResult = FanOutResult & {
  failures: FanOutFailure[];
  /** False when the whole run answered from fixtures. */
  live: boolean;
  bySource: Record<string, number>;
  transport: Transport;
  /** Rows carrying a USD value that cannot be true — see `_suspect`. Surfaced
   *  so the UI can say so out loud instead of quietly reordering them. */
  rowsSuspect: number;
};

/** Does the plan carry a query written for this specific family? */
function planQueryFor(plan: PlanResult, schema: SchemaFamily): string | null {
  const queries = plan.queries ?? {};
  if (queries[schema]) return queries[schema];

  const short = schema.split("@")[0];
  if (queries[short]) return queries[short];

  // A single unkeyed query means the planner wrote one query for one question.
  // Firing it at every family is the right default — cross-schema reach is the
  // entire point — and the core fallback catches families it doesn't fit.
  const keys = Object.keys(queries);
  if (keys.length === 1) return queries[keys[0]];
  return queries.primary ?? queries.default ?? queries.main ?? null;
}

/** GraphQL validation failures are recoverable with a narrower query. Network
 *  and indexer failures are not, and retrying them is how a fan-out stalls. */
function isSchemaMismatch(errors: string[]): boolean {
  return errors.some((e) =>
    /cannot query field|unknown field|unknown argument|no field named|does not exist on type|type .* has no field|unknown type/i.test(
      e,
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Above this, a USD figure is not a big number — it is a broken one.
 *
 * Total DeFi TVL across every chain is on the order of $100-200B, so a single
 * protocol reporting $1T is impossible by roughly an order of magnitude, and
 * the values we actually see are far past arguable: SushiSwap on Arbitrum
 * reports totalValueLockedUSD of 7.2e22, and Camelot V2 4.1e17. These come from
 * broken price feeds inside the standardized deployments themselves — the data
 * is live and correctly fetched, it is simply wrong at the source.
 *
 * 14 of 74 rows tripped this on a routine two-family fan-out, so it is not an
 * edge case, and the default TVL sort put the very worst row at the top of the
 * table. A leaderboard opening with "$72 sextillion" reads as broken software
 * rather than as bad upstream data.
 */
const USD_PLAUSIBILITY_CEILING = 1e12;

/**
 * USD fields on this row that cannot be true. Flagged, never deleted: dropping
 * a row silently would be its own kind of lie, and the point of health-checking
 * data is to say what is wrong with it, not to hide it.
 */
function suspectUsdFields(row: Record<string, unknown>): string[] {
  const bad: string[] = [];
  for (const [key, raw] of Object.entries(row)) {
    if (!key.includes("USD")) continue;
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (Number.isFinite(n) && Math.abs(n) > USD_PLAUSIBILITY_CEILING) bad.push(key);
  }
  return bad;
}

function numeric(row: Record<string, unknown>, key: string): number {
  const raw = row[key];
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Fan out across sources. Returns everything `FanOutResult` requires plus the
 * failure reasons — the extra fields make the return type a subtype, so this is
 * still assignable to `FanOut`.
 */
export async function fanOutDetailed(
  plan: PlanResult,
  sources: Source[],
  options: FanOutOptions = {},
): Promise<DetailedFanOutResult> {
  const started = Date.now();
  const transport: Transport = options.transport ?? "gateway";
  const concurrency = options.concurrency ?? 10;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const maxCostUsd = options.maxCostUsd ?? 1;

  // A caller may hand us the raw resolution. Honour `healthy` rather than
  // trusting them to have filtered — this is the last gate before spend.
  const live = sources.filter((s) => s.healthy);
  const skipped = sources.filter((s) => !s.healthy);

  const rows: Record<string, unknown>[] = [];
  const bySchema: Record<string, Record<string, unknown>[]> = {};
  const bySource: Record<string, number> = {};
  const failures: FanOutFailure[] = [];
  let costUsd = 0;
  let succeeded = 0;

  for (const source of skipped) {
    failures.push({
      subgraphId: source.subgraphId,
      label: source.label ?? source.subgraphId,
      schema: source.schema,
      network: source.network,
      reason: "skipped — health check failed",
    });
  }

  let cursor = 0;
  const budgetExceeded = () => costUsd >= maxCostUsd;

  async function runOne(source: Source): Promise<void> {
    const entry = lookupEntry(source.subgraphId);
    const label = source.label ?? entry?.label ?? source.subgraphId;
    const fixtureHint = { label, schema: source.schema, network: source.network };
    const query = planQueryFor(plan, source.schema) ?? DEFAULT_QUERIES[source.schema];

    let result = await graphQuery<Record<string, unknown>>({
      subgraphId: source.subgraphId,
      query,
      variables: plan.variables ?? {},
      transport,
      timeoutMs,
      fixtureHint,
    });
    costUsd += result.costUsd;

    // One narrowing retry, and only for a schema mismatch. A deployment running
    // dex-amm 1.3.0 genuinely cannot answer a 4.0.1 query, and dropping it
    // would silently shrink the fan-out that is the whole submission.
    if (
      !options.noCoreFallback &&
      (result.data === null || result.errors.length > 0) &&
      isSchemaMismatch(result.errors) &&
      query !== CORE_QUERY
    ) {
      result = await graphQuery<Record<string, unknown>>({
        subgraphId: source.subgraphId,
        query: CORE_QUERY,
        transport,
        timeoutMs,
        fixtureHint,
      });
      costUsd += result.costUsd;
    }

    if (result.data === null) {
      failures.push({
        subgraphId: source.subgraphId,
        label,
        schema: source.schema,
        network: source.network,
        reason: result.errors[0] ?? "empty response",
      });
      return;
    }

    const extracted: Record<string, unknown>[] = [];
    for (const root of ROW_ROOTS) {
      const value = result.data[root];
      if (!Array.isArray(value)) continue;
      for (const item of value) {
        if (!isRecord(item)) continue;
        const suspect = suspectUsdFields(item);
        extracted.push({
          ...item,
          // Present only when something is wrong, so `_suspect in row` is a
          // clean test and untouched rows stay byte-identical to the source.
          ...(suspect.length > 0 ? { _suspect: suspect } : {}),
          // Provenance travels with every row. Without it a merged table across
          // 27 deployments is unattributable, and Graph Track 2 explicitly asks
          // which subgraphs were used.
          _source: source.subgraphId,
          _label: label,
          _schema: source.schema,
          _network: source.network,
          _entity: root,
        });
      }
    }

    if (extracted.length === 0) {
      failures.push({
        subgraphId: source.subgraphId,
        label,
        schema: source.schema,
        network: source.network,
        reason: result.errors[0] ?? "response carried no rows",
      });
      return;
    }

    succeeded += 1;
    bySource[source.subgraphId] = extracted.length;
    rows.push(...extracted);
    (bySchema[source.schema] ??= []).push(...extracted);
  }

  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= live.length) return;
      const source = live[i];
      if (budgetExceeded()) {
        failures.push({
          subgraphId: source.subgraphId,
          label: source.label ?? source.subgraphId,
          schema: source.schema,
          network: source.network,
          reason: `skipped — cost budget $${maxCostUsd.toFixed(2)} exhausted`,
        });
        continue;
      }
      // runOne never rejects, but a bug that made it reject would silently kill
      // a worker and hang the batch. Belt and braces on the most important path.
      try {
        await runOne(source);
      } catch (err) {
        failures.push({
          subgraphId: source.subgraphId,
          label: source.label ?? source.subgraphId,
          schema: source.schema,
          network: source.network,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, live.length) }, worker));

  // Biggest first. A merged cross-protocol table sorted by nothing reads as
  // noise, and TVL is the one field every family shares.
  //
  // Rows with impossible USD values rank last regardless of size. Sorting them
  // by the very field that is broken is what put $7.2e22 at the top of the
  // table; they stay in the result, they just stop leading it.
  const byTvl = (a: Record<string, unknown>, b: Record<string, unknown>) => {
    const aBad = "_suspect" in a ? 1 : 0;
    const bBad = "_suspect" in b ? 1 : 0;
    if (aBad !== bBad) return aBad - bBad;
    return numeric(b, "totalValueLockedUSD") - numeric(a, "totalValueLockedUSD");
  };
  rows.sort(byTvl);
  for (const key of Object.keys(bySchema)) {
    bySchema[key].sort(byTvl);
  }

  return {
    rows,
    bySchema,
    sourcesQueried: sources.length,
    sourcesHealthy: succeeded,
    // Raw IDs so callers can join back to their own source list. Human-readable
    // reasons live in `failures`.
    sourcesFailed: failures.map((f) => f.subgraphId),
    costUsd: Number(costUsd.toFixed(6)),
    elapsedMs: Date.now() - started,
    failures,
    live: isLive(transport),
    bySource,
    transport,
    rowsSuspect: rows.reduce((n, r) => n + ("_suspect" in r ? 1 : 0), 0),
  };
}

/** The contracts/api.ts signature. */
export const fanOut: FanOut = (plan, sources) => fanOutDetailed(plan, sources);

/**
 * Summary counts for the UI strip. Named so the call site reads like the thing
 * the demo says out loud: "27 of 31 live".
 */
export function fanOutSummary(result: FanOutResult): {
  live: number;
  total: number;
  schemas: number;
  networks: number;
  costUsd: number;
  elapsedMs: number;
} {
  const networks = new Set(result.rows.map((r) => r._network));
  return {
    live: result.sourcesHealthy,
    total: result.sourcesQueried,
    schemas: Object.keys(result.bySchema).length,
    networks: networks.size,
    costUsd: result.costUsd,
    elapsedMs: result.elapsedMs,
  };
}
