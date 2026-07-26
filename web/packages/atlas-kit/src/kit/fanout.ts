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
import type { SchemaFamily, Source } from "../contracts/manifest";
import type { FanOut, FanOutResult, PlanResult } from "../contracts/api";
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
const CORE_QUERY = `query AtlasCore {
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
  "generic@3.0.0": `query AtlasGeneric { protocols(first: 1) {${PROTOCOL_CORE} } }`,

  "dex-amm@1.3.2": `query AtlasDex {
  protocols(first: 1) {${PROTOCOL_CORE}
    ... on DexAmmProtocol { cumulativeVolumeUSD totalPoolCount }
  }
  liquidityPools(first: 5, orderBy: totalValueLockedUSD, orderDirection: desc) {
    id name symbol totalValueLockedUSD cumulativeVolumeUSD
    inputTokens { symbol }
  }
}`,

  "dex-amm-extended@4.0.1": `query AtlasDexExtended {
  protocols(first: 1) {${PROTOCOL_CORE}
    ... on DexAmmProtocol { cumulativeVolumeUSD totalPoolCount }
  }
  liquidityPools(first: 5, orderBy: totalValueLockedUSD, orderDirection: desc) {
    id name symbol totalValueLockedUSD cumulativeVolumeUSD
    inputTokens { symbol }
  }
}`,

  "dex-aggregator@1.0.2": `query AtlasDexAggregator { protocols(first: 1) {${PROTOCOL_CORE} } }`,

  "lending-cdp@3.1.0": `query AtlasLending {
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

  "yield-aggregator@1.3.1": `query AtlasYield {
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
  "nft-marketplace@2.1.0": `query AtlasNft {
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
  "network@1.2.0": `query AtlasNetwork {
  networks(first: 1) {
    id
    blockHeight
    cumulativeUniqueAuthors
    cumulativeDifficulty
    gasLimit
  }
}`,

  "bridge@1.2.0": `query AtlasBridge {
  protocols(first: 1) {${PROTOCOL_CORE}
    ... on BridgeProtocol { totalValueExportedUSD totalPoolCount }
  }
}`,

  "perp-futures@1.3.4": `query AtlasPerp {
  protocols(first: 1) {${PROTOCOL_CORE}
    ... on DerivPerpProtocol {
      cumulativeVolumeUSD
      longOpenInterestUSD
      shortOpenInterestUSD
      totalPoolCount
    }
  }
}`,

  "options@1.3.2": `query AtlasOptions { protocols(first: 1) {${PROTOCOL_CORE} } }`,
};

/**
 * Root fields whose rows we lift into the merged table.
 *
 * THIS IS AN ALLOWLIST, and a root missing from it is data fetched, paid for and
 * dropped on the floor — the same failure `planQueriesFor` above describes, one
 * layer down. It had fifteen entries while the planner's templates selected six
 * roots that were not among them, so:
 *
 *   `positions`               the `position` template, every family that models
 *                             one — so `position_card` could never render
 *   `swaps`                   the `events` template (whale movements) — so
 *                             `distribution` had nothing with the right shape
 *   `bridgeTransfers`         the `flow` template — the source → destination
 *                             rows that ARE a flow diagram, which is why
 *                             `bridge-flows` renders a comparison grid
 *   `collections`,            the whole nft-marketplace family's rank and
 *   `collectionDailySnapshots` history queries
 *   `dailySnapshots`          the network family's history query
 *
 * The last two are worse than a missing component: two declared schema families
 * could return rows and have every one of them discarded.
 *
 * Adding a root here is safe in one direction and not the other. Nothing in
 * `DEFAULT_QUERIES` selects any of the six, so no panel that renders today
 * changes — they arrive only when a plan asked for them. Removing one silently
 * deletes data, which is how this list got wrong in the first place.
 *
 * Kept in two groups because `shapes.ts` needs the distinction: the aggregates
 * are what a family's default query returns together and compose into one panel;
 * a detail entity answers a different question and gets its own.
 */
const AGGREGATE_ROOTS = [
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
] as const;

/** Rows a plan went out of its way to ask for. One panel each — see `shapes.ts`. */
export const DETAIL_ROOTS = [
  "financialsDailySnapshots",
  "usageMetricsDailySnapshots",
  "dailySnapshots",
  "collectionDailySnapshots",
  "collections",
  "positions",
  "swaps",
  "bridgeTransfers",
] as const;

const ROW_ROOTS = [...AGGREGATE_ROOTS, ...DETAIL_ROOTS] as const;

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

/**
 * Every query the plan wants fired at this family, plus the family's baseline.
 *
 * THE BUG THIS REPLACES, because it was silent and it cost the product its
 * charts. The old `planQueryFor` returned ONE query and only recognised three
 * key shapes: the bare family (`lending-cdp@3.1.0`), its short name, or a lone
 * unkeyed entry. The planner does not write keys like that. `rankQueries` emits
 * `rank:<family>`, `timeseriesQueries` emits `history:<family>`, the patterns
 * emit bare `flow`/`events`/`guard`/`watch`, and the model contributes keys of
 * its own invention (`timeseries:<family>` was observed live). So every plan
 * carrying two or more queries matched nothing, returned `null`, and fell
 * through to `DEFAULT_QUERIES` — the plan was computed, paid for, displayed in
 * the trace, and then thrown away.
 *
 * What that cost: ask for "daily TVL over the last 30 days as a chart" and the
 * planner correctly writes a `financialsDailySnapshots` query, the fan-out fires
 * `markets(first: 5)` instead, no row comes back carrying a timestamp, and the
 * composer — which chooses from the shape of the data and is right to — has no
 * series to find. `time_series`, `area_stack`, `candlestick` and `flow_diagram`
 * were unreachable for this reason, not because their detectors were wrong.
 *
 * THE RULES, in order:
 *   1. `<anything>:<family>` and `<anything>:<short>` — every prefix, not one.
 *      Prefixes are an open namespace: the model writes them too, so matching a
 *      fixed list would reintroduce the same failure the next time it invents
 *      one.
 *   2. Exact `<family>` / `<short>` keys, which some plans still use.
 *   3. Unprefixed keys with no `:` at all. The planner scopes these to
 *      `ex.schemas[0]` and means them for the question rather than a family, and
 *      firing them at every family is the original comment's intent — cross-
 *      schema reach is the point, and the narrowing retry catches the misses.
 *   4. `DEFAULT_QUERIES[schema]`, ALWAYS, deduped against the above.
 *
 * Rule 4 is the one to justify. The default is the family's baseline shape —
 * protocol totals plus its top entities — and it is what every panel on the
 * board is currently composed from. A plan whose only query is `rank:` returns
 * markets and no protocol row, so honouring the plan *instead of* the default
 * would have deleted the metric card from screens that have one today. Additive
 * is the correct relationship: the default is what the family always answers,
 * the plan's queries are the shapes this question asked for on top. Nothing that
 * renders today stops rendering; what was asked for now arrives as well.
 *
 * Cost is linear and small — one gateway query is $0.0001 — and `runOne` fires
 * a source's queries concurrently, so the extra shapes cost latency only when
 * one of them is slower than the baseline was.
 */
function planQueriesFor(plan: PlanResult, schema: SchemaFamily): string[] {
  const queries = plan.queries ?? {};
  const short = schema.split("@")[0];
  const out: string[] = [];

  for (const [key, query] of Object.entries(queries)) {
    if (typeof query !== "string" || query.length === 0) continue;
    const colon = key.indexOf(":");
    if (colon >= 0) {
      const scope = key.slice(colon + 1);
      if (scope === schema || scope === short) out.push(query);
      continue;
    }
    if (key === schema || key === short) out.push(query);
  }

  // Family-agnostic keys, only once no family-scoped query claimed this schema —
  // a plan that wrote `rank:bridge@1.2.0` AND a bare `flow` means both for
  // bridges, so these are appended rather than used as an either/or.
  for (const [key, query] of Object.entries(queries)) {
    if (typeof query !== "string" || query.length === 0) continue;
    if (key.includes(":") || key === schema || key === short) continue;
    out.push(query);
  }

  out.push(DEFAULT_QUERIES[schema]);
  return [...new Set(out)];
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
    const planned = planQueriesFor(plan, source.schema);

    // Deduped as it accumulates. Two of a plan's queries can select the same
    // root — `rank:` and a bare `totals` both return `protocols` — and the same
    // protocol row arriving twice would double a metric card's sum. Keyed on
    // entity + id rather than the whole row because the two queries ask for
    // different field sets, so the objects differ while the entity does not.
    const extracted: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    const errors: string[] = [];

    const collect = (data: Record<string, unknown>): number => {
      let added = 0;
      for (const root of ROW_ROOTS) {
        const value = data[root];
        if (!Array.isArray(value)) continue;
        for (const item of value) {
          if (!isRecord(item)) continue;
          const key = `${root} ${String(item.id ?? JSON.stringify(item))}`;
          if (seen.has(key)) continue;
          seen.add(key);
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
          added += 1;
        }
      }
      return added;
    };

    // Concurrently, so asking a deployment for a second shape costs a request
    // and not a round trip. `budgetExceeded` is checked before the batch rather
    // than inside it — a half-fired set would report rows for a source whose
    // other shape was silently dropped.
    const results = await Promise.all(
      planned.map((query) =>
        graphQuery<Record<string, unknown>>({
          subgraphId: source.subgraphId,
          query,
          variables: plan.variables ?? {},
          transport,
          timeoutMs,
          fixtureHint,
        }),
      ),
    );

    for (const result of results) {
      costUsd += result.costUsd;
      errors.push(...result.errors);
      if (result.data !== null) collect(result.data);
    }

    // One narrowing retry, and only for a schema mismatch. A deployment running
    // dex-amm 1.3.0 genuinely cannot answer a 4.0.1 query, and dropping it
    // would silently shrink the fan-out that is the whole submission.
    //
    // Gated on the source having produced NOTHING. With a set of queries rather
    // than one, a mismatch on the shape the plan added is not a reason to throw
    // away the baseline rows that did arrive and replace them with the core
    // query's single protocol row.
    if (
      !options.noCoreFallback &&
      extracted.length === 0 &&
      isSchemaMismatch(errors) &&
      !planned.includes(CORE_QUERY)
    ) {
      const retry = await graphQuery<Record<string, unknown>>({
        subgraphId: source.subgraphId,
        query: CORE_QUERY,
        transport,
        timeoutMs,
        fixtureHint,
      });
      costUsd += retry.costUsd;
      errors.push(...retry.errors);
      if (retry.data !== null) collect(retry.data);
    }

    if (extracted.length === 0) {
      failures.push({
        subgraphId: source.subgraphId,
        label,
        schema: source.schema,
        network: source.network,
        reason: errors[0] ?? "response carried no rows",
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
