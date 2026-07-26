/**
 * Data-shape detection.
 *
 * This is the product's central design claim: **components are chosen from
 * the shape of the returned data, never from keywords in the prompt.** A
 * bounded ratio becomes a gauge whether or not anyone said "gauge". A ranked
 * categorical becomes a leaderboard. Two entities over shared metrics become
 * a comparison grid. That is the defensible version of "generative UI" — the
 * catalog can grow without the output becoming arbitrary.
 *
 * Field *names* are used as weak evidence for the semantic role a column
 * plays (is this a timestamp, is this a health factor). They are never used
 * as instructions, and the user's prompt is never consulted here at all — the
 * plan is passed in only for hints like "the user asked about TVL, accent
 * that series" and for the agency tier.
 *
 * Coverage is enforced by the compiler: `SHAPE_DETECTORS` is a
 * `Record<DataShape, ...>` and `DETECTION_ORDER` is checked at the type level
 * to be a permutation of every `DataShape`. A shape nothing detects is a
 * component that never renders (contracts/README.md rule 3).
 */
import type { DataShape, DisplayComponent } from "@/lib/contracts/catalog";
import { SHAPE_TO_COMPONENT } from "@/lib/contracts/catalog";
import type { FanOutResult, PlanResult, RequestedMetric } from "@/lib/contracts/api";
import { sanitizeForPrompt, sanitizeKey } from "./inference";

export type Row = Record<string, unknown>;

/* ────────────────────────────────────────────────────────────────────────
 * Column profiling
 * ──────────────────────────────────────────────────────────────────────── */

export type ColumnKind = "number" | "string" | "boolean" | "time" | "id" | "empty";

export interface ColumnProfile {
  name: string;
  kind: ColumnKind;
  /** Distinct non-null values. */
  cardinality: number;
  nonNull: number;
  min: number | null;
  max: number | null;
  /** True when every value is in [0, 1]. */
  unitInterval: boolean;
  /** True when every value is >= 0. */
  nonNegative: boolean;
  /** Name matched a semantic pattern (see NAME_HINTS). */
  semantic: SemanticRole | null;
}

export type SemanticRole =
  | "time"
  | "identity"
  | "usd"
  /** A RAW token amount in the token's own decimals. Never a currency. */
  | "token"
  | "ratio"
  | "percent"
  | "count"
  | "price"
  | "delta"
  | "target"
  | "position"
  | "flow_source"
  | "flow_target"
  | "flag"
  | "ohlc";

/**
 * Columns that describe a *held* position rather than a protocol aggregate.
 * Matched directly rather than through `semantic`, because a single column
 * can only carry one semantic role and `healthFactor` is more useful as a
 * ratio (it drives the gauge) than as a position marker.
 */
const POSITION_RE =
  /(collateral|principal|entryprice|costbasis|pnl|unrealis|unrealiz|realis|realiz|leverage|liquidationprice|healthfactor|borrowed|shares|debt)/i;

const NAME_HINTS: ReadonlyArray<[SemanticRole, RegExp]> = [
  // Exact identity names come first: "account" would otherwise be swallowed
  // by the substring "count".
  // `source`/`destination` are deliberately absent — those are flow endpoints
  // (see the aliases the planner emits for bridge queries). `_source` is the
  // fan-out's provenance column and stays an identity.
  ["identity", /^(id|address|account|user|owner|wallet|hash|txhash|pool|market|vault|token|symbol|name|label|protocol|collection|network|chain|schema|_source|side|type)$/i],
  ["time", /^(timestamp|time|date|day|hour|block(number|timestamp)?|t|period|bucket|snapshotdate)$/i],
  ["time", /(timestamp|_at|date|_day|_hour)$/i],
  ["ohlc", /^(open|high|low|close|o|h|l|c)$/i],
  ["flow_source", /^(source|from|origin|src|fromchain|sourcechain|inputtoken|sender)$/i],
  ["flow_target", /^(destination|dest|to|target|dst|tochain|destinationchain|outputtoken|receiver|recipient)$/i],
  ["target", /(target|threshold|goal|cap|limit|quota|budget|max[a-z]*)$/i],
  ["delta", /(delta|change|diff|pctchange|percentchange|growth|_1d|_7d|_24h|chg)/i],
  ["ratio", /(healthfactor|utilization|utilisation|ltv|ratio|collateralratio|share|weight|dominance|allocation)/i],
  ["percent", /(apy|apr|rate|yield|pct|percent|fundingrate|interestrate)/i],
  // Raw token quantities MUST be classified before the usd rule.
  //
  // `outputTokenSupply` matched the old usd rule on the substring "supply", and
  // `inputTokenBalance` was one detector away from doing the same. That matters
  // beyond labelling: `pickMetric` prefers a column whose semantic is "usd", so
  // a raw token amount could be promoted to the headline metric of a whole
  // screen. Messari denominates in the NAME — a dollar field ends in `USD` — so
  // anything token-shaped without that suffix is a count of tokens, nothing more.
  ["token", /^(?!.*usd).*(tokenbalance|tokenbalances|tokensupply|tokenamount|emissionsamount)/i],
  ["usd", /(usd|tvl|volume|revenue|fees|supply|borrow|deposit|withdraw|liquidity|marketcap|notional|balanceusd|valuelocked)/i],
  ["price", /(price|pricepershare|exchangerate|last)/i],
  ["count", /(count|txcount|users|holders|transfers|swaps|trades|positions|transactions|blocks)/i],
  ["position", POSITION_RE],
  ["identity", /(id|address|symbol|name|slug)$/i],
  ["flag", /^(is[A-Z]|has[A-Z]|triggered|breached|alerting|active|healthy|liquidatable|paused)/],
  ["flag", /(triggered|breached|violated|alerting|isactive|ishealthy)$/i],
];

function nameRole(name: string): SemanticRole | null {
  for (const [role, re] of NAME_HINTS) if (re.test(name)) return role;
  return null;
}

function looksLikeTimestamp(v: unknown): boolean {
  if (typeof v === "number") {
    // seconds or ms since epoch, 2001-01-01 .. 2100
    return (v > 1_000_000_000 && v < 4_102_444_800) || (v > 1e12 && v < 4.11e12);
  }
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(v);
  return false;
}

function looksLikeAddress(v: unknown): boolean {
  return typeof v === "string" && /^0x[0-9a-fA-F]{16,}$/.test(v);
}

/** Decimal-only. `Number("0x0000…")` is 0, and an address is not a number. */
const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "" || !DECIMAL.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Coerce a graph-ish value to a number: BigDecimal strings are common. */
export function toNumber(v: unknown): number | null {
  return asNumber(v);
}

export function profileColumns(rows: Row[]): ColumnProfile[] {
  const names = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) names.add(k);

  return [...names].map((name) => {
    const values = rows.map((r) => r[name]).filter((v) => v !== null && v !== undefined && v !== "");
    const distinct = new Set(values.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))));
    const nums = values.map(asNumber).filter((n): n is number => n !== null);
    const allNumeric = values.length > 0 && nums.length === values.length;
    const role = nameRole(name);

    let kind: ColumnKind;
    if (values.length === 0) kind = "empty";
    // A bare number in the unix-epoch range is not a timestamp unless the
    // column is *named* like one. `borrowCap: 1.2e9` is a dollar amount that
    // happens to fall in 2008–2100, and calling it a time axis produces a
    // line chart of one point.
    else if (role === "time" && values.every(looksLikeTimestamp)) kind = "time";
    else if (role === "time" && values.every((v) => typeof v === "string")) kind = "time";
    else if (!allNumeric && values.every(looksLikeTimestamp)) kind = "time";
    else if (allNumeric) kind = "number";
    else if (values.every((v) => typeof v === "boolean")) kind = "boolean";
    else if (values.every(looksLikeAddress) || (role === "identity" && distinct.size === values.length))
      kind = "id";
    else kind = "string";

    const min = nums.length > 0 ? Math.min(...nums) : null;
    const max = nums.length > 0 ? Math.max(...nums) : null;

    return {
      name,
      kind,
      cardinality: distinct.size,
      nonNull: values.length,
      min,
      max,
      unitInterval: nums.length > 0 && min !== null && max !== null && min >= 0 && max <= 1,
      nonNegative: nums.length > 0 && min !== null && min >= 0,
      semantic: role,
    };
  });
}

/* ────────────────────────────────────────────────────────────────────────
 * Detection result
 * ──────────────────────────────────────────────────────────────────────── */

/** Which column plays which role, resolved for the composer and renderer. */
export interface FieldRoles {
  /** Categorical axis: protocol name, pool, chain. */
  category?: string;
  /** Second categorical axis — heatmaps only. */
  category2?: string;
  /** Timestamp column. */
  time?: string;
  /** Numeric columns in display order. Always at least one when relevant. */
  metrics: string[];
  /** The single metric the question was about — gets the semantic accent. */
  primaryMetric?: string;
  /** Scalar value column, for metric_card / gauge / progress_bar. */
  value?: string;
  /** Delta column paired with `value`. */
  delta?: string;
  /** Target/threshold column paired with `value`. */
  target?: string;
  /** Domain for a bounded ratio. */
  min?: number;
  max?: number;
  /** OHLCV columns. */
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
  /** Flow endpoints. */
  source?: string;
  destination?: string;
  /** Boolean that fired. */
  condition?: string;
}

/**
 * The question asked for one metric and the panel is built on another.
 *
 * Present only when the substitution is real, so `metricGap !== null` is
 * exactly the condition under which a panel MUST say what it did. Never
 * resolved by picking a lookalike column — see `satisfiesRequest`.
 */
export interface MetricGap {
  /** The user's own words for what they asked to rank by. */
  requested: string;
  /** What the panel is actually built on, or null when it has no metric. */
  using: string | null;
  /**
   * "absent"   — no column in the result carries it. The standardized schema
   *              does not model it for these entities.
   * "unusable" — a column carries it but not as a rankable number (Messari's
   *              yield `rates` is a list of InterestRate objects, for example).
   */
  kind: "absent" | "unusable";
}

export interface DetectedShape {
  shape: DataShape;
  component: DisplayComponent;
  /** 0..1. Detectors are tried in order; the first over `minConfidence` wins. */
  confidence: number;
  fields: FieldRoles;
  rows: Row[];
  /** Human-readable, shown as provenance: "why this component". */
  reason: string;
  /** Non-null when the panel answers a different metric than the one asked for. */
  metricGap: MetricGap | null;
}

interface Candidate {
  fields: FieldRoles;
  confidence: number;
  reason: string;
  /** Optional row transform (sorting, truncation). */
  rows?: Row[];
}

export interface DetectContext {
  rows: Row[];
  cols: ColumnProfile[];
  numeric: ColumnProfile[];
  categorical: ColumnProfile[];
  timeCols: ColumnProfile[];
  boolCols: ColumnProfile[];
  /** Metric the plan was about, if the planner named one. */
  preferredMetric: string | null;
  /**
   * The metric the QUESTION asked for, or null when it named none.
   *
   * Ranks above `preferredMetric` because `preferredMetric` comes from
   * `variables.orderBy`, which the rules engine defaults to
   * `totalValueLockedUSD` — indistinguishable from a real request. This one is
   * only ever non-null because the user's own words said so.
   */
  requestedMetric: RequestedMetric | null;
  tier: PlanResult["tier"];
  /** True when the plan's query asked for an ordered top-N. */
  ranked: boolean;
}

type Detector = (ctx: DetectContext) => Candidate | null;

/* ────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Does this column answer what the question asked for?
 *
 * Provenance columns are never candidates — `_source` would satisfy a request
 * for "source" and that is a subgraph id, not a measurement.
 */
export function satisfiesRequest(columnName: string, req: RequestedMetric): boolean {
  if (columnName.startsWith("_")) return false;
  const n = columnName.toLowerCase();
  return req.candidates.some((c) => n.includes(c.toLowerCase()));
}

/**
 * The metric a panel is built around.
 *
 * Order matters, and it is an order of *authority*, not of confidence:
 *   1. what the question asked for, when the rows actually carry it — the only
 *      entry here that reflects a stated human intent;
 *   2. the plan's `orderBy`, which may be a real request or a house default;
 *   3. a USD column, because that is the most legible default;
 *   4. whatever came first.
 *
 * (1) used to be absent entirely, and that is why "rank vaults by net APY" came
 * back ranked by `totalValueLockedUSD`: the composer only ever asked the data
 * what it contained, never the question what it wanted. When (1) misses,
 * `detectShape` records a `metricGap` so the panel says so out loud instead of
 * quietly answering a different question.
 */
function pickMetric(ctx: DetectContext, metrics: ColumnProfile[]): string | undefined {
  if (metrics.length === 0) return undefined;
  const req = ctx.requestedMetric;
  if (req) {
    const asked = metrics.find((m) => satisfiesRequest(m.name, req));
    if (asked) return asked.name;
  }
  if (ctx.preferredMetric) {
    const exact = metrics.find((m) => m.name.toLowerCase() === ctx.preferredMetric?.toLowerCase());
    if (exact) return exact.name;
    const partial = metrics.find((m) =>
      m.name.toLowerCase().includes((ctx.preferredMetric ?? "").toLowerCase()),
    );
    if (partial) return partial.name;
  }
  // A raw token balance is never a sensible default headline: it is a number in
  // the token's own decimals, so `2.6e22` and `$40,020` describe the same vault.
  const usd = metrics.find((m) => m.semantic === "usd");
  return (usd ?? metrics.find((m) => m.semantic !== "token") ?? metrics[0]).name;
}

function byName(cols: ColumnProfile[], re: RegExp): ColumnProfile | undefined {
  return cols.find((c) => re.test(c.name));
}

/** A boolean that means "something went wrong" — the only kind that is an alert. */
const BREACH_FLAG_RE = /(trigger|breach|violat|alert|liquidat|halt|paused|stale|frozen)/i;

/**
 * A boolean that means "operating normally". Never an alert, however `is…`-shaped
 * the name looks: `isActive` is true for every healthy market on every lending
 * deployment we query.
 */
const STATUS_FLAG_RE = /^(is)?(active|healthy|enabled|open|live|valid)$/i;

/**
 * Columns that identify a *deployment*, not an entity. Real values, useless as a
 * leaderboard label — a board reading "1.3.2 · #2 · #3" is what you get when the
 * lowest-cardinality string column wins, and on Messari rows that column is
 * `schemaVersion`.
 */
const NON_LABEL_COLUMNS = new Set([
  "id",
  "network",
  "slug",
  "schemaVersion",
  "subgraphVersion",
  "methodologyVersion",
]);

/** Column names that ARE the entity, in preference order. */
const LABEL_PREFERENCE = ["name", "title", "symbol", "label", "protocol", "_label"];

/**
 * The column a human would read as "which one is this".
 *
 * `ctx.categorical` is sorted by ascending cardinality because heatmap axes want
 * the coarsest column. A leaderboard wants the opposite: the column that names
 * the thing. Preference first, then the most distinctive non-metadata string.
 */
function pickLabelColumn(ctx: DetectContext): ColumnProfile | undefined {
  for (const preferred of LABEL_PREFERENCE) {
    const hit = ctx.categorical.find((c) => c.name === preferred);
    if (hit) return hit;
  }
  const usable = ctx.categorical.filter((c) => !NON_LABEL_COLUMNS.has(c.name));
  if (usable.length > 0) {
    // Most distinctive first — the inverse of the heatmap ordering.
    return [...usable].sort((a, b) => b.cardinality - a.cardinality)[0];
  }
  // Nothing but metadata. An address is a poor label but a TRUE one; a version
  // string labels three different markets identically, which is worse than ugly.
  return ctx.categorical.find((c) => c.name === "id") ?? ctx.categorical[0];
}

/**
 * True when a row carries an impossible USD value, flagged upstream by the
 * fan-out. Never dropped, never allowed to lead.
 */
function isSuspect(row: Row): boolean {
  return "_suspect" in row;
}

/**
 * Descending by `key`, with suspect rows forced last.
 *
 * The fan-out already ranks suspect rows last, and re-sorting on the metric threw
 * that away — which is how `$7.2e22` from a broken SushiSwap price feed ended up
 * at the top of a leaderboard. Sorting by the very field that is broken is the
 * documented failure (prd.md §17); it has to be defended at every sort, not just
 * the first one.
 */
function rankDescending(rows: Row[], key: string): Row[] {
  return [...rows].sort((a, b) => {
    const aBad = isSuspect(a) ? 1 : 0;
    const bBad = isSuspect(b) ? 1 : 0;
    if (aBad !== bBad) return aBad - bBad;
    return (asNumber(b[key]) ?? 0) - (asNumber(a[key]) ?? 0);
  });
}

/**
 * Whether `rows` is already ranked by `key`.
 *
 * Suspect rows are skipped rather than compared: they sit at the end with
 * arbitrary magnitudes, so including them would report a correctly-ordered list
 * as unsorted and trigger a re-sort that puts them back on top.
 */
function isDescending(rows: Row[], key: string): boolean {
  let seen = 0;
  let prev = Number.POSITIVE_INFINITY;
  for (const r of rows) {
    if (isSuspect(r)) continue;
    const n = asNumber(r[key]);
    if (n === null) continue;
    if (n > prev + 1e-9) return false;
    prev = n;
    seen++;
  }
  return seen >= 3;
}

/* ────────────────────────────────────────────────────────────────────────
 * The detectors — one per DataShape. Record<DataShape, …> means the compiler
 * fails the build if a shape is ever added without a rule that reaches it.
 * ──────────────────────────────────────────────────────────────────────── */

export const SHAPE_DETECTORS: Record<DataShape, Detector> = {
  /** A boolean that fired, or a monitor/autonomous plan with a breach column. */
  triggered_condition: (ctx) => {
    // A fired condition must be BREACH-shaped, not merely boolean.
    //
    // `semantic === "flag"` is too loose here: NAME_HINTS classifies anything
    // starting `is…`/`has…` as a flag, so a Messari market's `isActive: true` —
    // the normal, healthy state of every market — rendered as "Is Active has
    // fired" in an alert banner on an autonomous app. A false alert on a screen
    // that can move money is worse than no alert.
    const flag =
      byName(ctx.boolCols, BREACH_FLAG_RE) ??
      ctx.boolCols.find((c) => c.semantic === "flag" && !STATUS_FLAG_RE.test(c.name));
    if (!flag) return null;
    const fired = ctx.rows.some((r) => r[flag.name] === true);
    if (!fired && ctx.tier === "readonly") return null;
    const metric = ctx.numeric.find((c) => c.semantic === "ratio") ?? ctx.numeric[0];
    return {
      confidence: fired ? 0.98 : 0.6,
      fields: {
        condition: flag.name,
        value: metric?.name,
        metrics: metric ? [metric.name] : [],
        target: byName(ctx.numeric, /(threshold|target|limit)/i)?.name,
      },
      reason: `Boolean "${sanitizeKey(flag.name)}" is a fired condition — an alert banner, not a chart.`,
    };
  },

  /** A held position: size plus at least one risk/PnL dimension. */
  held_position: (ctx) => {
    if (ctx.rows.length > 8) return null;
    const positional = ctx.numeric.filter((c) => POSITION_RE.test(c.name));
    const size = byName(ctx.numeric, /(balance|size|amount|collateral|principal|shares|supplied|borrowed)/i);
    const risk = byName(ctx.numeric, /(healthfactor|pnl|unrealized|liquidationprice|leverage|entryprice|costbasis)/i);
    if (!size || !risk || positional.length === 0) return null;
    return {
      confidence: 0.94,
      fields: {
        value: size.name,
        metrics: ctx.numeric.map((c) => c.name),
        primaryMetric: risk.name,
        category: ctx.categorical[0]?.name,
      },
      reason: `Size (${sanitizeKey(size.name)}) plus risk (${sanitizeKey(risk.name)}) is a held position.`,
    };
  },

  /** Open/high/low/close over time. */
  ohlcv: (ctx) => {
    const time = ctx.timeCols[0];
    const o = byName(ctx.numeric, /^open$/i);
    const h = byName(ctx.numeric, /^high$/i);
    const l = byName(ctx.numeric, /^low$/i);
    const c = byName(ctx.numeric, /^close$/i);
    if (!time || !o || !h || !l || !c) return null;
    return {
      confidence: 0.97,
      fields: {
        time: time.name,
        open: o.name,
        high: h.name,
        low: l.name,
        close: c.name,
        volume: byName(ctx.numeric, /^volume/i)?.name,
        metrics: [o.name, h.name, l.name, c.name],
        primaryMetric: c.name,
      },
      reason: "Open/high/low/close over time is a candlestick series.",
    };
  },

  /** source → destination with a volume. Bridges, routing. */
  source_target_volume: (ctx) => {
    const src = ctx.cols.find((c) => c.semantic === "flow_source");
    const dst = ctx.cols.find((c) => c.semantic === "flow_target");
    if (!src || !dst || src.name === dst.name) return null;
    const metric = pickMetric(ctx, ctx.numeric);
    if (!metric) return null;
    return {
      confidence: 0.93,
      fields: {
        source: src.name,
        destination: dst.name,
        value: metric,
        primaryMetric: metric,
        metrics: ctx.numeric.map((c) => c.name),
      },
      reason: `${sanitizeKey(src.name)} → ${sanitizeKey(dst.name)} carrying ${sanitizeKey(metric)} is a flow.`,
    };
  },

  /** A single ratio with a known domain. Health factors, utilization, LTV. */
  bounded_ratio: (ctx) => {
    if (ctx.rows.length !== 1) return null;
    const ratio =
      ctx.numeric.find((c) => c.semantic === "ratio") ??
      // "token" joins the exclusions: a dust-sized raw token balance lands in
      // [0,1] and would otherwise be drawn as a gauge with a 0..1 dial, which
      // reads as a percentage of something.
      ctx.numeric.find(
        (c) => c.unitInterval && c.semantic !== "usd" && c.semantic !== "count" && c.semantic !== "token",
      );
    if (!ratio) return null;
    const isHealth = /healthfactor/i.test(ratio.name);
    return {
      confidence: 0.95,
      fields: {
        value: ratio.name,
        metrics: [ratio.name],
        primaryMetric: ratio.name,
        min: 0,
        // Health factor is unbounded above; 3 is the conventional "very safe"
        // end of the dial. Everything else in [0,1] is a fraction.
        max: isHealth ? 3 : ratio.unitInterval ? 1 : Math.max(1, ratio.max ?? 1),
        target: byName(ctx.numeric, /(threshold|target|liquidationthreshold)/i)?.name,
      },
      reason: `"${sanitizeKey(ratio.name)}" is a bounded ratio — that is a gauge, whatever the question said.`,
    };
  },

  /** A scalar measured against a known target. */
  scalar_vs_target: (ctx) => {
    if (ctx.rows.length !== 1) return null;
    const target = ctx.numeric.find((c) => c.semantic === "target");
    if (!target) return null;
    const value = ctx.numeric.find((c) => c.name !== target.name && c.semantic !== "delta");
    if (!value) return null;
    return {
      confidence: 0.9,
      fields: {
        value: value.name,
        target: target.name,
        metrics: [value.name],
        primaryMetric: value.name,
        min: 0,
        max: asNumber(ctx.rows[0][target.name]) ?? undefined,
      },
      reason: `${sanitizeKey(value.name)} against ${sanitizeKey(target.name)} is progress toward a target.`,
    };
  },

  /** One number with a change. */
  scalar_with_delta: (ctx) => {
    if (ctx.rows.length !== 1) return null;
    const delta = ctx.numeric.find((c) => c.semantic === "delta");
    const value = ctx.numeric.find((c) => c.semantic !== "delta" && c.semantic !== "target");
    if (!delta || !value) return null;
    return {
      confidence: 0.9,
      fields: { value: value.name, delta: delta.name, metrics: [value.name], primaryMetric: value.name },
      reason: `One figure (${sanitizeKey(value.name)}) with a change (${sanitizeKey(delta.name)}).`,
    };
  },

  /** One number. */
  scalar: (ctx) => {
    if (ctx.rows.length !== 1) return null;
    if (ctx.numeric.length === 0 || ctx.numeric.length > 2) return null;
    if (ctx.timeCols.length > 0) return null;
    const value = pickMetric(ctx, ctx.numeric);
    if (!value) return null;
    return {
      confidence: 0.85,
      fields: { value, metrics: [value], primaryMetric: value },
      reason: "A single row with a single figure.",
    };
  },

  /** time × category × one metric summing toward a whole. */
  timeseries_composition: (ctx) => {
    const time = ctx.timeCols[0];
    if (!time) return null;
    const cat = ctx.categorical.find((c) => c.cardinality >= 2 && c.cardinality <= 8);
    if (!cat) return null;
    const metrics = ctx.numeric.filter((c) => c.semantic !== "delta");
    if (metrics.length !== 1) return null;
    if (!metrics[0].nonNegative) return null;
    return {
      confidence: 0.88,
      fields: {
        time: time.name,
        category: cat.name,
        metrics: [metrics[0].name],
        primaryMetric: metrics[0].name,
      },
      reason: `${sanitizeKey(cat.name)} split of ${sanitizeKey(metrics[0].name)} over time composes a whole — stacked area.`,
    };
  },

  /** time × several metrics. */
  timeseries_many_metrics: (ctx) => {
    const time = ctx.timeCols[0];
    if (!time) return null;
    const metrics = ctx.numeric.filter((c) => c.name !== time.name);
    if (metrics.length < 2) return null;
    return {
      confidence: 0.86,
      fields: {
        time: time.name,
        metrics: metrics.map((c) => c.name),
        primaryMetric: pickMetric(ctx, metrics),
        category: ctx.categorical.find((c) => c.cardinality > 1)?.name,
      },
      reason: `${metrics.length} metrics on a shared time axis.`,
    };
  },

  /** time × one metric. */
  timeseries_one_metric: (ctx) => {
    const time = ctx.timeCols[0];
    if (!time) return null;
    const metrics = ctx.numeric.filter((c) => c.name !== time.name);
    if (metrics.length !== 1) return null;
    return {
      confidence: 0.9,
      fields: { time: time.name, metrics: [metrics[0].name], primaryMetric: metrics[0].name },
      reason: `${sanitizeKey(metrics[0].name)} over time.`,
    };
  },

  /** Two categorical axes with one metric. Protocol × chain. */
  two_categoricals_one_metric: (ctx) => {
    const cats = ctx.categorical.filter((c) => c.cardinality >= 2);
    if (cats.length < 2) return null;
    const [a, b] = cats;
    // Must be genuinely two-dimensional, not a label riding along with an id.
    if (a.cardinality * b.cardinality < ctx.rows.length) return null;
    if (Math.max(a.cardinality, b.cardinality) >= ctx.rows.length) return null;
    const metrics = ctx.numeric.filter((c) => c.semantic !== "delta");
    if (metrics.length < 1) return null;
    const metric = pickMetric(ctx, metrics);
    if (!metric) return null;
    return {
      confidence: 0.87,
      fields: { category: a.name, category2: b.name, value: metric, primaryMetric: metric, metrics: [metric] },
      reason: `${sanitizeKey(a.name)} × ${sanitizeKey(b.name)} over ${sanitizeKey(metric)} is a matrix — heatmap.`,
    };
  },

  /** A handful of entities compared across several shared metrics. */
  entities_shared_metrics: (ctx) => {
    if (ctx.rows.length < 2 || ctx.rows.length > 6) return null;
    if (ctx.timeCols.length > 0) return null;
    const cat = ctx.categorical[0];
    const metrics = ctx.numeric.filter((c) => c.semantic !== "delta");
    if (!cat || metrics.length < 3) return null;
    return {
      confidence: 0.91,
      fields: {
        category: cat.name,
        metrics: metrics.map((c) => c.name),
        primaryMetric: pickMetric(ctx, metrics),
      },
      reason: `${ctx.rows.length} entities across ${metrics.length} shared metrics — a comparison grid.`,
    };
  },

  /** Many observations of one metric over near-unique subjects. */
  many_observations: (ctx) => {
    if (ctx.rows.length < 25) return null;
    if (ctx.timeCols.length > 0) return null;
    const metrics = ctx.numeric.filter((c) => c.semantic !== "delta");
    if (metrics.length !== 1) return null;
    const subject = ctx.cols.find(
      (c) => (c.kind === "id" || c.kind === "string") && c.cardinality >= ctx.rows.length * 0.9,
    );
    if (!subject) return null;
    return {
      confidence: 0.89,
      fields: { category: subject.name, value: metrics[0].name, primaryMetric: metrics[0].name, metrics: [metrics[0].name] },
      reason: `${ctx.rows.length} near-unique observations of ${sanitizeKey(metrics[0].name)} — show the distribution, not 200 bars.`,
    };
  },

  /** A ranked categorical. The most common question shape there is. */
  categorical_ranked: (ctx) => {
    const cat = pickLabelColumn(ctx);
    if (!cat || ctx.timeCols.length > 0) return null;
    const metrics = ctx.numeric.filter((c) => c.semantic !== "delta");
    if (metrics.length === 0) return null;
    const metric = pickMetric(ctx, metrics);
    if (!metric) return null;
    if (ctx.rows.length < 3 || ctx.rows.length > 50) return null;
    const sorted = isDescending(ctx.rows, metric);
    if (!sorted && !ctx.ranked) return null;
    // Even when already descending, re-rank: `isDescending` ignores suspect rows,
    // so "sorted" says nothing about where they sit.
    const rows = rankDescending(ctx.rows, metric);
    return {
      confidence: sorted ? 0.93 : 0.8,
      rows,
      fields: {
        category: cat.name,
        value: metric,
        primaryMetric: metric,
        metrics: metrics.map((c) => c.name),
        delta: ctx.numeric.find((c) => c.semantic === "delta")?.name,
      },
      reason: `Ranked ${sanitizeKey(cat.name)} by ${sanitizeKey(metric)} — a leaderboard.`,
    };
  },

  /** categorical × several metrics. */
  categorical_many_metrics: (ctx) => {
    const cat = ctx.categorical[0];
    if (!cat || ctx.timeCols.length > 0) return null;
    const metrics = ctx.numeric.filter((c) => c.semantic !== "delta");
    if (metrics.length < 2) return null;
    return {
      confidence: 0.84,
      fields: {
        category: cat.name,
        metrics: metrics.map((c) => c.name),
        primaryMetric: pickMetric(ctx, metrics),
      },
      reason: `${sanitizeKey(cat.name)} across ${metrics.length} metrics — grouped bars.`,
    };
  },

  /** categorical × one metric. */
  categorical_one_metric: (ctx) => {
    const cat = ctx.categorical[0];
    if (!cat || ctx.timeCols.length > 0) return null;
    const metrics = ctx.numeric.filter((c) => c.semantic !== "delta");
    if (metrics.length !== 1) return null;
    return {
      confidence: 0.82,
      fields: { category: cat.name, value: metrics[0].name, primaryMetric: metrics[0].name, metrics: [metrics[0].name] },
      reason: `${sanitizeKey(cat.name)} by ${sanitizeKey(metrics[0].name)}.`,
    };
  },

  /** The fallback. Always matches, so every result renders something. */
  rows_arbitrary_columns: (ctx) => ({
    confidence: ctx.rows.length > 0 ? 0.4 : 0.2,
    fields: {
      metrics: ctx.numeric.map((c) => c.name),
      category: ctx.categorical[0]?.name,
      primaryMetric: pickMetric(ctx, ctx.numeric),
    },
    reason: "No stronger shape fits — fall back to a table rather than guess.",
  }),
};

/**
 * Try order. Specific shapes first; `rows_arbitrary_columns` last because it
 * always matches. The type assertion below fails to compile if a `DataShape`
 * is missing from this tuple.
 */
export const DETECTION_ORDER = [
  "triggered_condition",
  "held_position",
  "ohlcv",
  "source_target_volume",
  "bounded_ratio",
  "scalar_vs_target",
  "scalar_with_delta",
  "scalar",
  "timeseries_composition",
  "timeseries_many_metrics",
  "timeseries_one_metric",
  "two_categoricals_one_metric",
  "entities_shared_metrics",
  "many_observations",
  "categorical_ranked",
  "categorical_many_metrics",
  "categorical_one_metric",
  "rows_arbitrary_columns",
] as const satisfies readonly DataShape[];

/** Compile-time coverage check: every DataShape appears in DETECTION_ORDER. */
type MissingFromOrder = Exclude<DataShape, (typeof DETECTION_ORDER)[number]>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile-time assertion only
type _AllShapesOrdered = MissingFromOrder extends never ? true : ["missing", MissingFromOrder];
const _shapeCoverage: MissingFromOrder[] = [];
void _shapeCoverage;

/* ────────────────────────────────────────────────────────────────────────
 * Public entry points
 * ──────────────────────────────────────────────────────────────────────── */

export interface DetectOptions {
  /** Column name the plan cares about — gets the semantic accent. */
  preferredMetric?: string | null;
  /** What the question asked to rank by. Null/absent means it named nothing. */
  requestedMetric?: RequestedMetric | null;
  tier?: PlanResult["tier"];
  /** True when the query asked for an ordered top-N. */
  ranked?: boolean;
  /** Below this, only the fallback is used. */
  minConfidence?: number;
}

function buildContext(rows: Row[], opts: DetectOptions): DetectContext {
  const cols = profileColumns(rows);
  return {
    rows,
    cols,
    numeric: cols.filter((c) => c.kind === "number"),
    categorical: cols
      .filter((c) => (c.kind === "string" || c.kind === "id") && c.cardinality > 1)
      .sort((a, b) => a.cardinality - b.cardinality),
    timeCols: cols.filter((c) => c.kind === "time"),
    boolCols: cols.filter((c) => c.kind === "boolean"),
    preferredMetric: opts.preferredMetric ?? null,
    requestedMetric: opts.requestedMetric ?? null,
    tier: opts.tier ?? "readonly",
    ranked: opts.ranked ?? false,
  };
}

/**
 * Did the panel end up answering the question it was asked?
 *
 * Returns null when nothing was asked, or when the chosen metric satisfies the
 * request. Otherwise it names the gap so the composer can put it on screen. The
 * two kinds are distinguished because they are different admissions: "the
 * standardized schema does not carry this" is a coverage statement about The
 * Graph's Messari families; "it is here but not as a number" is about this
 * result set.
 */
function metricGapFor(ctx: DetectContext, fields: FieldRoles): MetricGap | null {
  const req = ctx.requestedMetric;
  if (!req) return null;
  const using = fields.primaryMetric ?? fields.value ?? null;
  if (using && satisfiesRequest(using, req)) return null;

  const carrying = ctx.cols.find((c) => satisfiesRequest(c.name, req));
  return { requested: req.phrase, using, kind: carrying ? "unusable" : "absent" };
}

/** Classify one homogeneous set of rows. Never returns null. */
export function detectShape(rows: Row[], opts: DetectOptions = {}): DetectedShape {
  const ctx = buildContext(rows, opts);
  const min = opts.minConfidence ?? 0.5;
  for (const shape of DETECTION_ORDER) {
    const candidate = SHAPE_DETECTORS[shape](ctx);
    if (candidate && candidate.confidence >= min) {
      return {
        shape,
        component: SHAPE_TO_COMPONENT[shape],
        confidence: candidate.confidence,
        fields: candidate.fields,
        rows: candidate.rows ?? rows,
        reason: candidate.reason,
        metricGap: metricGapFor(ctx, candidate.fields),
      };
    }
  }
  const fallback = SHAPE_DETECTORS.rows_arbitrary_columns(ctx);
  const fallbackFields = fallback?.fields ?? { metrics: [] };
  return {
    shape: "rows_arbitrary_columns",
    component: "data_table",
    confidence: fallback?.confidence ?? 0.2,
    fields: fallbackFields,
    rows,
    reason: fallback?.reason ?? "Fallback.",
    metricGap: metricGapFor(ctx, fallbackFields),
  };
}

/** Rank every shape against these rows. Useful for debugging the selection. */
export function scoreShapes(rows: Row[], opts: DetectOptions = {}): Array<{ shape: DataShape; confidence: number; reason: string }> {
  const ctx = buildContext(rows, opts);
  return DETECTION_ORDER.map((shape) => {
    const c = SHAPE_DETECTORS[shape](ctx);
    return { shape, confidence: c?.confidence ?? 0, reason: c?.reason ?? "no match" };
  })
    .filter((s) => s.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);
}

export interface ShapeBlock extends DetectedShape {
  /** Stable id derived from the group key. */
  key: string;
  /** Sanitized human title for the panel. */
  title: string;
  /** Schema family or "all" the rows came from. */
  group: string;
}

/**
 * Classify a whole fan-out result into the panels a screen is made of.
 *
 * Groups are the fan-out's `bySchema` buckets — one schema family answers one
 * sub-question, so one bucket is one panel. `rows` (the merged set) is
 * classified too, and used when there are no buckets or when the merged view
 * produces a stronger shape than the parts (that is where the cross-schema
 * comparison grid comes from).
 */
export function detectShapes(data: FanOutResult, plan?: PlanResult): ShapeBlock[] {
  const opts: DetectOptions = {
    preferredMetric: typeof plan?.variables?.orderBy === "string" ? plan.variables.orderBy : null,
    // Optional on the contract and nullable on the wire, so `?? null` is the
    // whole of the compatibility story: an older plan simply asked for nothing.
    requestedMetric: plan?.requestedMetric ?? null,
    tier: plan?.tier ?? "readonly",
    ranked: isRankedPlan(plan),
  };

  const blocks: ShapeBlock[] = [];
  const buckets = Object.entries(data.bySchema ?? {}).filter(([, rows]) => Array.isArray(rows) && rows.length > 0);

  for (const [group, rows] of buckets) {
    const detected = detectShape(rows, opts);
    blocks.push({
      ...detected,
      key: sanitizeKey(group) || `group-${blocks.length}`,
      group,
      title: titleFor(detected, group),
    });
  }

  const merged = Array.isArray(data.rows) ? data.rows : [];
  if (blocks.length === 0 && merged.length > 0) {
    const detected = detectShape(merged, opts);
    blocks.push({ ...detected, key: "primary", group: "all", title: titleFor(detected, "all") });
  } else if (buckets.length > 1 && merged.length > 0) {
    // A cross-schema view can be a stronger shape than any single bucket —
    // this is where comparison_grid and heatmap come from.
    const detected = detectShape(merged, opts);
    const best = Math.max(...blocks.map((b) => b.confidence));
    if (
      detected.confidence >= best - 0.05 &&
      (detected.shape === "entities_shared_metrics" ||
        detected.shape === "two_categoricals_one_metric" ||
        detected.shape === "categorical_ranked" ||
        detected.shape === "held_position" ||
        detected.shape === "triggered_condition")
    ) {
      blocks.unshift({ ...detected, key: "cross-schema", group: "all", title: titleFor(detected, "all") });
    }
  }

  if (blocks.length === 0) {
    blocks.push({
      shape: "rows_arbitrary_columns",
      component: "data_table",
      confidence: 0.2,
      fields: { metrics: [] },
      rows: [],
      reason: "No source returned rows.",
      // Nothing came back, so nothing was substituted. A gap here would be a
      // claim about data that does not exist.
      metricGap: null,
      key: "empty",
      group: "all",
      title: "No data",
    });
  }

  return blocks;
}

function isRankedPlan(plan?: PlanResult): boolean {
  if (!plan) return false;
  if (typeof plan.variables?.orderBy === "string") return true;
  return Object.values(plan.queries ?? {}).some((q) => /orderBy|orderDirection|first:/.test(q));
}

const SHAPE_TITLES: Record<DataShape, string> = {
  scalar: "Total",
  scalar_with_delta: "Total",
  bounded_ratio: "Health",
  scalar_vs_target: "Progress",
  categorical_one_metric: "By category",
  categorical_many_metrics: "By category",
  categorical_ranked: "Leaderboard",
  timeseries_one_metric: "Over time",
  timeseries_many_metrics: "Over time",
  timeseries_composition: "Composition over time",
  ohlcv: "Price",
  entities_shared_metrics: "Comparison",
  two_categoricals_one_metric: "Matrix",
  many_observations: "Distribution",
  source_target_volume: "Flows",
  held_position: "Position",
  triggered_condition: "Alert",
  rows_arbitrary_columns: "Results",
};

function titleFor(d: DetectedShape, group: string): string {
  const base = SHAPE_TITLES[d.shape];
  const metric = d.fields.primaryMetric ?? d.fields.value;
  const label = metric ? humanize(metric) : null;
  const family = group === "all" ? null : humanize(group.replace(/@.*$/, ""));
  if (label && family) return `${label} — ${family}`;
  if (label) return `${label} · ${base}`;
  if (family) return `${family} · ${base}`;
  return base;
}

/** camelCase / snake_case column name → a label safe to render. */
export function humanize(name: string): string {
  const spaced = sanitizeForPrompt(name, 48)
    .replace(/[-_]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (spaced.length === 0) return "Value";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
