/**
 * W2 — PER-TICK RE-READ.
 *
 * A Substreams tick says *when* to re-evaluate. It does not say what the answer
 * is. This module supplies the answer: on every block, re-run the app's own
 * query plan against its own health-checked sources and hand the resulting
 * scalars to the trigger evaluator.
 *
 * That split is the whole reason the architecture works. The block event is
 * cheap and exact; the metric is expensive and comes from The Graph. Polling
 * conflates them and lands you five minutes late (prd.md §10).
 *
 * WHAT THIS CAN AND CANNOT PRODUCE — read before writing a trigger condition:
 *
 *   CAN   protocol-level scalars that the Messari standardized schemas actually
 *         expose: `totalValueLockedUSD`, `cumulativeVolumeUSD`,
 *         `totalBorrowBalanceUSD`, `openInterestUSD` and friends. Namespaced by
 *         schema family, so a condition reads
 *         `lending.totalValueLockedUSD < 1000000`.
 *
 *   CANNOT `healthFactor`. It is a property of one user's position, and no
 *         standardized family exposes per-account positions in the query shape
 *         the fan-out uses. Any seed app whose condition names `healthFactor`
 *         therefore evaluates to false in production — which is the safe
 *         direction (`evaluateCondition` refuses to fire on a missing path), but
 *         it is a real gap and not a rounding error. Closing it needs a
 *         per-account query per lending deployment, which is a different
 *         workstream.
 *
 * Every value here is OURS — read by us, from a source we health-checked. That
 * is what earns it the right to outrank the untrusted stream payload in
 * `buildSignalData`.
 */
import type { PlanResult } from "@/lib/contracts/api";
import type { AgencyTier, DataPlan, SchemaFamily } from "@/lib/contracts/manifest";
import { fanOutDetailed } from "@/lib/kit/fanout";
import { getJournal, journal, type JournalStore } from "./journal";
import type { Enrich, SignalData } from "./stream-runner";

/** `lending-cdp@3.1.0` → `lending`. The prefix a condition writes. */
export function familyPrefix(schema: SchemaFamily): string {
  const [name] = schema.split("@");
  return name.replace(/-cdp$|-futures$|-aggregator$|-marketplace$/, "").replace(/-/g, "_");
}

/**
 * A data plan is not a plan result — the planner's output carries intent, tier
 * and provenance that a stored manifest has already consumed. Rebuild the
 * minimum the fan-out reads.
 */
export function planFromDataPlan(data: DataPlan, tier: AgencyTier, intent = ""): PlanResult {
  return {
    intent,
    schemas: data.schemas,
    networks: data.networks,
    queries: data.queries,
    variables: data.variables ?? {},
    tier,
    attestationRef: null,
    model: "none",
  };
}

/**
 * Numeric scalars from one row, flattened one level.
 *
 * Only finite numbers survive. A string that looks like a number is left as a
 * string on purpose: `evaluateCondition` refuses ordering comparisons on strings,
 * and a silent `Number()` coercion of indexed data is exactly how you end up
 * trading on `"7.2e22"` from a broken price feed.
 */
export function scalarsOf(row: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith("_")) continue; // _source, _schema, _suspect — metadata
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
      continue;
    }
    // The gateway returns BigDecimal as a string. Convert only when the whole
    // string is a number and the result is finite and plausible.
    if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) {
      const n = Number(value);
      if (Number.isFinite(n)) out[key] = n;
    }
  }
  return out;
}

export interface EnrichmentSnapshot extends Record<string, unknown> {
  sourcesQueried: number;
  sourcesHealthy: number;
  rows: number;
  rowsSuspect: number;
  costUsd: number;
  /** False when the fan-out answered from fixtures. Never hide this. */
  live: boolean;
}

/**
 * Collapses a fan-out into comparable values.
 *
 * Per family we take the FIRST row, which the fan-out has already ranked so that
 * `_suspect` rows sort last. Taking a max or a sum across deployments would mean
 * one broken upstream price feed decides whether an autonomous app spends.
 */
export function metricsFromFanOut(result: {
  bySchema: Record<string, Record<string, unknown>[]>;
  rows: Record<string, unknown>[];
  sourcesQueried: number;
  sourcesHealthy: number;
  rowsSuspect: number;
  costUsd: number;
  live: boolean;
}): EnrichmentSnapshot {
  const snapshot: EnrichmentSnapshot = {
    sourcesQueried: result.sourcesQueried,
    sourcesHealthy: result.sourcesHealthy,
    rows: result.rows.length,
    rowsSuspect: result.rowsSuspect,
    costUsd: result.costUsd,
    live: result.live,
  };

  for (const [schema, rows] of Object.entries(result.bySchema)) {
    const first = rows.find((r) => r["_suspect"] === undefined) ?? rows[0];
    if (!first) continue;
    snapshot[familyPrefix(schema as SchemaFamily)] = scalarsOf(first);
  }

  return snapshot;
}

export interface DataPlanEnrichOptions {
  appId: string;
  data: DataPlan;
  tier: AgencyTier;
  intent?: string;
  store?: JournalStore;
  /**
   * Re-read at most this often. A 250ms block time on Arbitrum would otherwise
   * mean four fan-outs a second, which is both slow and a real bill. Between
   * reads the previous snapshot is reused and marked `stale`.
   */
  minIntervalMs?: number;
  maxCostUsd?: number;
}

/**
 * Builds the `Enrich` the stream runner calls once per block.
 *
 * Failure is not fatal and is not silent: a failed read journals an ERROR and
 * returns the last good snapshot marked `stale: true`. A condition that must not
 * fire on stale data can test it — `stale == false and lending.tvl < x`.
 */
export function dataPlanEnrich(options: DataPlanEnrichOptions): Enrich {
  const store = options.store ?? getJournal();
  const minIntervalMs = options.minIntervalMs ?? 10_000;
  const plan = planFromDataPlan(options.data, options.tier, options.intent ?? "");
  let last: EnrichmentSnapshot | null = null;
  let lastAt = 0;

  return async (): Promise<SignalData> => {
    const now = Date.now();
    if (last && now - lastAt < minIntervalMs) {
      return { ...last, stale: true, ageMs: now - lastAt };
    }

    try {
      const result = await fanOutDetailed(plan, options.data.sources, {
        transport: options.data.transport,
        maxCostUsd: options.maxCostUsd ?? 0.25,
      });
      last = metricsFromFanOut(result);
      lastAt = now;
      await journal.query(
        store,
        options.appId,
        `re-read on block: ${result.sourcesHealthy}/${result.sourcesQueried} sources, ` +
          `${result.rows.length} rows, $${result.costUsd.toFixed(4)}${result.live ? "" : " (fixtures)"}`,
      );
      return { ...last, stale: false, ageMs: 0 };
    } catch (err) {
      await journal.error(
        store,
        options.appId,
        `re-read failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      if (!last) return { stale: true, ageMs: Number.POSITIVE_INFINITY };
      return { ...last, stale: true, ageMs: now - lastAt };
    }
  };
}
