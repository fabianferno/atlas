/**
 * W4 — the composer. Plan + data → an A2UI v0.9.1 document.
 *
 * Implements `Compose` from contracts/api.ts.
 *
 * ── The rule ─────────────────────────────────────────────────────────────
 * Components are chosen by `shapes.ts` from the SHAPE of the returned data,
 * never from keywords in the prompt. The composer's job is to turn those
 * detections into catalog components, precompute the payload each one needs,
 * and add the chrome the agency tier demands. It emits only names from
 * `ALL_COMPONENTS` — enforced by the `A2UIComponent` type and re-checked by
 * `validateDocument` before the document is returned.
 *
 * ── Autonomous tier ──────────────────────────────────────────────────────
 * `REQUIRED_FOR_AUTONOMOUS` (policy_badge, trade_log, kill_switch) is always
 * present. An agent that spends money shows its work. This is not left to the
 * model's discretion and not left to the composer's either — it is appended
 * unconditionally and asserted at the end.
 *
 * ── Untrusted data ───────────────────────────────────────────────────────
 * Every string that came from an indexer is passed through
 * `sanitizeForPrompt` before it is placed in the document. Token names, pool
 * names and account labels are attacker-controlled (prd.md §7). Data values
 * are never sent to a model as instructions; the optional narrative pass sees
 * column names and shapes only, never values.
 */
import { z } from "zod";
import type { Compose, ComposeResult, FanOutResult, PlanResult } from "@/lib/contracts/api";
import type { ComponentName } from "@/lib/contracts/catalog";
import { REQUIRED_FOR_AUTONOMOUS } from "@/lib/contracts/catalog";
import { AGENCY_TIERS, NETWORKS, SCHEMA_FAMILIES } from "@/lib/contracts/manifest";
import type { AgencyTier } from "@/lib/contracts/manifest";
import {
  buildDocument,
  serverEvent,
  validateDocument,
  bind,
  type A2UIComponent,
  type A2UIDocument,
  type A2UIHints,
  type JsonValue,
} from "./a2ui";
import { chatJson, getInferenceConfig, sanitizeForPrompt, sanitizeKey } from "./inference";
import { detectShapes, humanize, toNumber, type Row, type ShapeBlock } from "./shapes";

/* ────────────────────────────────────────────────────────────────────────
 * Wire schemas (used by /api/compose)
 * ──────────────────────────────────────────────────────────────────────── */

export const zFanOutResult = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).default([]),
  bySchema: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))).default({}),
  sourcesQueried: z.number().int().nonnegative().default(0),
  sourcesHealthy: z.number().int().nonnegative().default(0),
  sourcesFailed: z.array(z.string()).default([]),
  costUsd: z.number().nonnegative().default(0),
  elapsedMs: z.number().nonnegative().default(0),
});

export const zComposeInput = z.object({
  plan: z.object({
    intent: z.string(),
    schemas: z.array(z.enum(SCHEMA_FAMILIES)).min(1),
    networks: z.array(z.enum(NETWORKS)).min(1),
    queries: z.record(z.string(), z.string()).default({}),
    variables: z.record(z.string(), z.unknown()).default({}),
    tier: z.enum(AGENCY_TIERS),
    // MUST be listed here. `z.object` strips unknown keys, so a plan that
    // travelled POST /api/plan → POST /api/compose would arrive with the user's
    // stated metric silently removed, and the composer would go back to
    // answering whatever the data happened to contain. Defaults to null, which
    // means "the question named no metric" — never a guess.
    requestedMetric: z
      .object({
        phrase: z.string().min(1).max(60),
        candidates: z.array(z.string().min(1).max(60)).min(1).max(6),
      })
      .nullable()
      .default(null),
    attestationRef: z.string().nullable().default(null),
    model: z.string().default("unknown"),
  }),
  data: zFanOutResult,
});

/* ────────────────────────────────────────────────────────────────────────
 * JSON coercion + sanitization
 * ──────────────────────────────────────────────────────────────────────── */

function toJson(value: unknown, depth = 0): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return sanitizeForPrompt(value, 160);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (typeof value === "bigint") return Number(value);
  if (depth > 4) return null;
  if (Array.isArray(value)) return value.slice(0, 500).map((v) => toJson(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "function") continue;
      out[sanitizeKey(k)] = toJson(v, depth + 1);
    }
    return out;
  }
  return null;
}

/** Cell value for display: numbers stay numbers, everything else is text. */
function cell(row: Row, field: string | undefined): JsonValue {
  if (!field) return null;
  const raw = row[field];
  const n = toNumber(raw);
  if (n !== null && typeof raw !== "boolean") return n;
  return toJson(raw);
}

function label(row: Row, field: string | undefined, fallback: string): string {
  if (!field) return fallback;
  const v = row[field];
  const s = sanitizeForPrompt(v, 48);
  return s.length > 0 ? s : fallback;
}

/**
 * Split a field name into lowercase words. `totalValueLockedUSD` →
 * ["total","value","locked","usd"]; `usdcBalance` → ["usdc","balance"].
 *
 * Word membership, not substring matching, is the whole point: `usdcBalance` is
 * a raw USDC amount and must not be read as dollars just because the letters
 * "usd" appear in it.
 */
function fieldWords(field: string): string[] {
  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

/** Field names that are a ratio however their words parse. */
const RATIO_NAME_RE = /(healthfactor|pricepershare|exchangerate|collateralratio|^ratio$|ltv|leverage)/i;

/**
 * The unit a figure is denominated in.
 *
 * ── What this used to do, and why it was wrong ───────────────────────────
 * One regex — `/usd|tvl|volume|revenue|fees|balance|notional|marketcap|price/i`
 * — returned "usd" on a substring hit. `balance` and `price` are both too
 * loose to carry a currency symbol: Messari's `inputTokenBalance` and
 * `outputTokenSupply` are RAW TOKEN AMOUNTS in the token's own decimals, so a
 * vault holding ~$40k of WETH rendered `INPUT TOKEN BALANCE $26551393887T` in
 * the data table. `volume` and `revenue` were wrong in a second way:
 * `cumulativeTradeVolumeETH`, `creatorRevenueETH` and `marketplaceRevenueETH`
 * are live NFT-marketplace fields denominated in ether, and every one of them
 * was drawn with a dollar sign.
 *
 * ── The rule now ─────────────────────────────────────────────────────────
 * Messari encodes denomination IN THE FIELD NAME and the suffix is the only
 * thing that can be trusted: a dollar field ends in `USD`, an ether field ends
 * in `ETH`. So only a field whose words actually contain "usd" gets a dollar
 * sign. `outputTokenPriceUSD` is dollars and says so; `inputTokenBalance` is a
 * token count and gets one; `dailyMinSalePrice` names no denomination at all,
 * so it gets none rather than a `$` the schema cannot back.
 *
 * That last case is the governing rule applied to a unit hint: a figure that
 * looks like a measurement in dollars, and is not, is exactly the thing this
 * product promises never to render.
 */
function unitFor(field: string | undefined): A2UIHints["unit"] {
  if (!field) return "none";
  const w = fieldWords(field);
  const has = (word: string): boolean => w.includes(word);

  // Denomination first — it outranks every other hint in the name.
  // `outputTokenPriceUSD` contains "token" and is still dollars.
  if (has("usd") || has("tvl")) return "usd";
  // Only the `…ETH` suffix, which Messari uses for BigDecimal ether amounts.
  // A field like `wethBalance` is deliberately NOT ether: raw token balances
  // are in wei, and calling that "eth" would be wrong by eighteen decimals —
  // the same class of mistake as the dollar sign this function just removed.
  if (has("eth")) return "eth";

  if (RATIO_NAME_RE.test(field)) return "ratio";
  if (w.some((x) => /^(apy|apys|apr|aprs|rate|rates|pct|percent|percentage|utilization|utilisation|yield|dominance|allocation)$/.test(x))) {
    return "pct";
  }
  // "share" alone is a fraction; "shares" is a token quantity (vault shares).
  if (has("share")) return "pct";
  if (w.some((x) => /^(count|counts|users|holders|traders|authors|transfers|swaps|trades|blocks|transactions|positions|height)$/.test(x))) {
    return "count";
  }
  // Raw token quantities. A bare compact magnitude and nothing else — the
  // renderer's "token" branch prints the number with no unit attached, which is
  // the only honest thing to print for a figure whose decimals we do not know.
  if (w.some((x) => /^(balance|balances|supply|amount|amounts|shares|principal|emissions|reserves)$/.test(x))) {
    return "token";
  }
  return "none";
}

/* ────────────────────────────────────────────────────────────────────────
 * Per-shape payload builders
 *
 * The renderer receives finished, bounded data. It never re-derives series
 * from raw rows — that is what kept the catalog implementable by a parallel
 * agent working from `CatalogComponentProps` alone.
 * ──────────────────────────────────────────────────────────────────────── */

const MAX_ROWS = 200;

/* ────────────────────────────────────────────────────────────────────────
 * Suspect rows — one decision, applied to every panel that shows a figure
 *
 * ── What this used to do, and why it was wrong ───────────────────────────
 * `summaryOf` dropped `_suspect` rows from the headline and captioned it
 * "20 row(s) with impossible values excluded", while the leaderboard directly
 * beneath it went on ranking those same twenty rows at `$26101137179950`. The
 * argument for the asymmetry was that a list lets the reader see the outlier
 * and a scalar does not — true as far as it goes, but on screen the reader was
 * told a number was impossible in one panel and then shown it as a rank in the
 * next. Two panels contradicting each other is worse than either one alone.
 *
 * ── The rule now ─────────────────────────────────────────────────────────
 * A row the fan-out flagged as impossible is excluded from every panel that
 * presents a figure AS A MEASUREMENT — headline, leaderboard, chart, gauge —
 * and the count and the reason are stated in that panel's own caption, so the
 * disclosure is where the reader is looking rather than one panel away. The
 * excluded rows are still carried in the payload under `suspect`, and they are
 * still in the raw Rows table in full, because deleting them would replace one
 * dishonest screen with a quieter one. Nothing is shortened silently.
 * ──────────────────────────────────────────────────────────────────────── */

interface SuspectSplit {
  /** Rows safe to present as a measurement. */
  usable: Row[];
  /** Rows the fan-out flagged. Kept, never deleted. */
  excluded: Row[];
  /** Distinct field names that failed the plausibility ceiling. */
  fields: string[];
}

function splitSuspect(rows: Row[]): SuspectSplit {
  const usable: Row[] = [];
  const excluded: Row[] = [];
  const fields = new Set<string>();
  for (const r of rows) {
    if ("_suspect" in r) {
      excluded.push(r);
      const flagged = r["_suspect"];
      if (Array.isArray(flagged)) for (const f of flagged) fields.add(sanitizeKey(String(f)));
    } else {
      usable.push(r);
    }
  }
  return { usable, excluded, fields: [...fields].slice(0, 4) };
}

/**
 * The sentence a panel says about its own excluded rows. Empty when there are
 * none — a disclosure that fires on every panel stops being read.
 *
 * `kept: true` is the raw table, which shows the flagged rows rather than
 * dropping them and has to say the opposite thing.
 */
function suspectNote(split: SuspectSplit, total: number, kept = false): string {
  const n = split.excluded.length;
  if (n === 0) return "";
  const where = split.fields.length > 0 ? ` (${split.fields.join(", ")})` : "";
  const what = `${n} of ${total} row${total === 1 ? "" : "s"} report a USD value beyond any plausible magnitude${where}`;
  // Deliberately panel-agnostic. An earlier draft said "excluded from the total
  // above", which is false when the panel saying it IS the total.
  return kept
    ? ` ${what}; they are shown here unaltered and excluded from the panels above.`
    : ` ${what} — excluded from this panel and from the total, and still listed in full in Rows below.`;
}

/**
 * The sentence a panel says when it is built on a metric nobody asked for.
 *
 * Non-empty exactly when `block.metricGap` is set, which shapes.ts only does
 * when the substitution is real. Option (b) of the honesty rule: never swap the
 * metric silently — say what was asked, say why it is unavailable, say what was
 * used instead.
 */
function metricGapNote(block: ShapeBlock): string {
  const gap = block.metricGap;
  if (!gap) return "";
  const asked = sanitizeForPrompt(gap.requested, 60);
  const why =
    gap.kind === "absent"
      ? "the standardized schema does not carry it for these entities"
      : "these rows carry it, but not as a number this panel can rank on";
  const instead = gap.using
    ? `, so this panel uses ${humanize(gap.using)} instead`
    : ", so this panel does not answer it";
  return ` Asked for ${asked}: ${why}${instead}.`;
}

function buildPayload(block: ShapeBlock, split: SuspectSplit): JsonValue {
  const f = block.fields;
  // Every shape below reads `rows`, so excluding once here is what makes the
  // headline and the leaderboard agree by construction rather than by two
  // filters that have to be kept in step.
  const rows = split.usable.slice(0, MAX_ROWS);
  const notes = `${suspectNote(split, block.rows.length)}${metricGapNote(block)}`;
  const base: Record<string, JsonValue> = {
    shape: block.shape,
    title: block.title,
    reason: `${block.reason}${notes}`,
    confidence: Math.round(block.confidence * 100) / 100,
    // The count of what is actually drawn. Reporting `block.rows.length` here
    // while drawing fewer would be the silent shortening this whole section
    // exists to prevent.
    rowCount: rows.length,
    ...(split.excluded.length > 0
      ? {
          suspectCount: split.excluded.length,
          suspectFields: split.fields.slice(),
          suspectNote: suspectNote(split, block.rows.length).trim(),
          // Carried, not drawn. A catalog component that wants to render these
          // as flagged has everything it needs; nothing ranks them.
          suspect: split.excluded.slice(0, 20).map((r, i) => ({
            label: label(r, f.category, `#${i + 1}`),
            value: cell(r, f.value ?? f.primaryMetric),
            fields: Array.isArray(r["_suspect"]) ? toJson(r["_suspect"]) : null,
          })),
        }
      : {}),
    ...(block.metricGap
      ? {
          metricGap: {
            requested: sanitizeForPrompt(block.metricGap.requested, 60),
            using: block.metricGap.using ? sanitizeKey(block.metricGap.using) : null,
            kind: block.metricGap.kind,
            note: metricGapNote(block).trim(),
          },
        }
      : {}),
  };

  switch (block.shape) {
    case "scalar":
    case "scalar_with_delta": {
      const row = rows[0] ?? {};
      return {
        ...base,
        value: cell(row, f.value),
        delta: cell(row, f.delta),
        label: humanize(f.value ?? "Value"),
        unit: unitFor(f.value) ?? "none",
      };
    }

    case "bounded_ratio": {
      const row = rows[0] ?? {};
      return {
        ...base,
        value: cell(row, f.value),
        min: f.min ?? 0,
        max: f.max ?? 1,
        target: cell(row, f.target),
        label: humanize(f.value ?? "Ratio"),
        unit: unitFor(f.value) ?? "ratio",
      };
    }

    case "scalar_vs_target": {
      const row = rows[0] ?? {};
      const v = toNumber(row[f.value ?? ""]) ?? 0;
      const t = toNumber(row[f.target ?? ""]) ?? f.max ?? 0;
      return {
        ...base,
        value: v,
        target: t,
        pct: t > 0 ? Math.min(1, v / t) : 0,
        label: humanize(f.value ?? "Progress"),
        unit: unitFor(f.value) ?? "none",
      };
    }

    case "categorical_one_metric": {
      return {
        ...base,
        metric: humanize(f.value ?? "Value"),
        unit: unitFor(f.value) ?? "none",
        categories: rows.map((r, i) => ({
          label: label(r, f.category, `#${i + 1}`),
          value: cell(r, f.value),
        })),
      };
    }

    case "categorical_many_metrics": {
      const metrics = f.metrics.slice(0, 5);
      return {
        ...base,
        metrics: metrics.map(humanize),
        metricKeys: metrics,
        categories: rows.map((r, i) => label(r, f.category, `#${i + 1}`)),
        series: metrics.map((m) => ({
          name: humanize(m),
          key: m,
          accent: m === f.primaryMetric,
          values: rows.map((r) => cell(r, m)),
        })),
      };
    }

    case "categorical_ranked": {
      return {
        ...base,
        metric: humanize(f.value ?? f.primaryMetric ?? "Value"),
        unit: unitFor(f.value ?? f.primaryMetric) ?? "none",
        rows: rows.map((r, i) => ({
          rank: i + 1,
          label: label(r, f.category, `#${i + 1}`),
          value: cell(r, f.value ?? f.primaryMetric),
          delta: cell(r, f.delta),
        })),
      };
    }

    case "timeseries_one_metric":
    case "timeseries_many_metrics": {
      const metrics = f.metrics.slice(0, 5);
      const points = sortByTime(rows, f.time);
      return {
        ...base,
        unit: unitFor(f.primaryMetric ?? metrics[0]) ?? "none",
        series: metrics.map((m) => ({
          name: humanize(m),
          key: m,
          accent: m === f.primaryMetric,
          points: points.map((r) => ({ t: cell(r, f.time), v: cell(r, m) })),
        })),
      };
    }

    case "timeseries_composition": {
      const metric = f.primaryMetric ?? f.metrics[0];
      const points = sortByTime(rows, f.time);
      const groups = new Map<string, Array<{ t: JsonValue; v: JsonValue }>>();
      for (const r of points) {
        const key = label(r, f.category, "other");
        const list = groups.get(key) ?? [];
        list.push({ t: cell(r, f.time), v: cell(r, metric) });
        groups.set(key, list);
      }
      return {
        ...base,
        unit: unitFor(metric) ?? "none",
        metric: humanize(metric ?? "Value"),
        series: [...groups.entries()].slice(0, 8).map(([name, pts]) => ({ name, key: name, accent: false, points: pts })),
      };
    }

    case "ohlcv": {
      const points = sortByTime(rows, f.time);
      return {
        ...base,
        points: points.map((r) => ({
          t: cell(r, f.time),
          o: cell(r, f.open),
          h: cell(r, f.high),
          l: cell(r, f.low),
          c: cell(r, f.close),
          v: cell(r, f.volume),
        })),
      };
    }

    case "entities_shared_metrics": {
      const metrics = f.metrics.slice(0, 8);
      return {
        ...base,
        metrics: metrics.map(humanize),
        metricKeys: metrics,
        units: metrics.map((m) => unitFor(m) ?? "none"),
        entities: rows.map((r, i) => ({
          label: label(r, f.category, `Entity ${i + 1}`),
          values: metrics.map((m) => cell(r, m)),
        })),
      };
    }

    case "two_categoricals_one_metric": {
      const rowKeys = uniqueLabels(rows, f.category);
      const colKeys = uniqueLabels(rows, f.category2);
      const index = new Map<string, number>();
      for (const r of rows) {
        const k = `${label(r, f.category, "?")}||${label(r, f.category2, "?")}`;
        index.set(k, toNumber(r[f.value ?? ""]) ?? 0);
      }
      return {
        ...base,
        metric: humanize(f.value ?? "Value"),
        unit: unitFor(f.value) ?? "none",
        rowLabels: rowKeys,
        colLabels: colKeys,
        cells: rowKeys.map((rk) => colKeys.map((ck) => index.get(`${rk}||${ck}`) ?? null)),
      };
    }

    case "many_observations": {
      const metric = f.value ?? f.primaryMetric;
      const values = rows.map((r) => toNumber(r[metric ?? ""])).filter((n): n is number => n !== null);
      return {
        ...base,
        metric: humanize(metric ?? "Value"),
        unit: unitFor(metric) ?? "none",
        count: values.length,
        total: values.reduce((a, b) => a + b, 0),
        buckets: histogram(values, 12),
        top: rows.slice(0, 10).map((r, i) => ({
          label: label(r, f.category, `#${i + 1}`),
          value: cell(r, metric),
        })),
      };
    }

    case "source_target_volume": {
      const flows = rows.map((r) => ({
        source: label(r, f.source, "?"),
        target: label(r, f.destination, "?"),
        value: cell(r, f.value),
      }));
      const nodes = [...new Set(flows.flatMap((fl) => [fl.source, fl.target]))];
      return { ...base, unit: unitFor(f.value) ?? "usd", metric: humanize(f.value ?? "Volume"), nodes, flows };
    }

    case "held_position": {
      const row = rows[0] ?? {};
      return {
        ...base,
        label: label(row, f.category, "Position"),
        size: cell(row, f.value),
        sizeLabel: humanize(f.value ?? "Size"),
        risk: cell(row, f.primaryMetric),
        riskLabel: humanize(f.primaryMetric ?? "Risk"),
        entries: f.metrics.slice(0, 8).map((m) => ({
          label: humanize(m),
          value: cell(row, m),
          unit: unitFor(m) ?? "none",
        })),
        positions: rows.slice(0, 8).map((r, i) => ({
          label: label(r, f.category, `Position ${i + 1}`),
          size: cell(r, f.value),
          risk: cell(r, f.primaryMetric),
        })),
      };
    }

    case "triggered_condition": {
      const fired = rows.find((r) => r[f.condition ?? ""] === true) ?? rows[0] ?? {};
      const triggered = fired[f.condition ?? ""] === true;
      return {
        ...base,
        triggered,
        severity: triggered ? "loss" : "risk",
        condition: humanize(f.condition ?? "Condition"),
        value: cell(fired, f.value),
        threshold: cell(fired, f.target),
        message: triggered
          ? `${humanize(f.condition ?? "Condition")} has fired.`
          : `${humanize(f.condition ?? "Condition")} is being watched.`,
      };
    }

    case "rows_arbitrary_columns":
    default: {
      // The table is the show-your-work surface, so it is the ONE panel that
      // keeps the flagged rows: a reader told "20 rows were excluded" must be
      // able to go and look at them. Its note says the opposite of the others'.
      const all = block.rows.slice(0, MAX_ROWS);
      const columns = [...new Set(all.flatMap((r) => Object.keys(r)))].slice(0, 12);
      return {
        ...base,
        reason: `${block.reason}${suspectNote(split, block.rows.length, true)}${metricGapNote(block)}`,
        rowCount: all.length,
        columns: columns.map(humanize),
        columnKeys: columns,
        units: columns.map((c) => unitFor(c) ?? "none"),
        rows: all.slice(0, 100).map((r) => columns.map((c) => cell(r, c))),
      };
    }
  }
}

function sortByTime(rows: Row[], time?: string): Row[] {
  if (!time) return rows;
  return [...rows].sort((a, b) => {
    const ta = timeValue(a[time]);
    const tb = timeValue(b[time]);
    return ta - tb;
  });
}

function timeValue(v: unknown): number {
  const n = toNumber(v);
  if (n !== null) return n < 1e12 ? n * 1000 : n;
  if (typeof v === "string") {
    const parsed = Date.parse(v);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function uniqueLabels(rows: Row[], field?: string): string[] {
  if (!field) return [];
  return [...new Set(rows.map((r) => label(r, field, "?")))].slice(0, 24);
}

function histogram(values: number[], bins: number): JsonValue {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min) / bins || 1;
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) {
    const i = Math.min(bins - 1, Math.max(0, Math.floor((v - min) / width)));
    counts[i] += 1;
  }
  return counts.map((count, i) => ({ from: min + i * width, to: min + (i + 1) * width, count }));
}

/* ────────────────────────────────────────────────────────────────────────
 * Policy / agency defaults
 * ──────────────────────────────────────────────────────────────────────── */

export interface ComposePolicyView {
  tier: AgencyTier;
  maxSpendUsd: number;
  maxPerTxUsd: number;
  allowlist: string[];
  expiresAt: string | null;
  requireConfirm: boolean;
  killSwitch: boolean;
  halted: boolean;
  spentUsd: number;
}

/**
 * Conservative defaults. The composer renders a policy; it never grants one.
 * An empty allowlist means no actions, no exceptions (prd.md §7) — so every
 * action button is disabled until the user or the publish step supplies
 * targets, and the badge says exactly that.
 */
function defaultPolicy(tier: AgencyTier): ComposePolicyView {
  return {
    tier,
    maxSpendUsd: tier === "autonomous" ? 500 : 0,
    maxPerTxUsd: tier === "autonomous" ? 50 : 0,
    allowlist: [],
    expiresAt: null,
    requireConfirm: true,
    killSwitch: true,
    halted: false,
    spentUsd: 0,
  };
}

interface PlanAction {
  kind: string;
  label: string;
  verb: string;
}

function planAction(plan: PlanResult): PlanAction | null {
  const raw = plan.variables?.action;
  if (typeof raw !== "object" || raw === null) return null;
  const a = raw as Partial<PlanAction>;
  if (typeof a.kind !== "string" || typeof a.label !== "string") return null;
  return { kind: a.kind, label: sanitizeForPrompt(a.label, 24) || "Execute", verb: a.verb ?? a.kind };
}

/* ────────────────────────────────────────────────────────────────────────
 * Optional narrative pass (runs on 0G when a key is present)
 *
 * The model sees the intent, the detected shapes and the COLUMN NAMES. It
 * never sees a single data value — so no indexed string can influence it.
 * ──────────────────────────────────────────────────────────────────────── */

const zNarrative = z.object({
  title: z.string().min(2).max(80),
  blocks: z.array(z.object({ key: z.string().max(80), label: z.string().min(1).max(60) })).max(12),
});

const NARRATIVE_SYSTEM = `You label panels in a generated onchain dashboard. You are given the user's intent and, for each panel, the detected data shape and the column names. You never see data values and must not invent any.

Return JSON only: {"title": string, "blocks": [{"key": string, "label": string}]}
- title: <= 6 words, names the whole screen.
- label: <= 5 words, names one panel. Reuse the given key verbatim.
Plain nouns. No emoji, no marketing language, no metrics you were not given.`;

async function narrate(
  plan: PlanResult,
  blocks: ShapeBlock[],
): Promise<{ title: string | null; labels: Map<string, string>; attestationRef: string | null; model: string | null }> {
  const empty = { title: null, labels: new Map<string, string>(), attestationRef: null, model: null };
  if (!getInferenceConfig().live) return empty;

  const outline = blocks.map((b) => ({
    key: b.key,
    shape: b.shape,
    component: b.component,
    columns: [b.fields.category, b.fields.time, ...b.fields.metrics].filter(Boolean).slice(0, 8).map((c) => sanitizeKey(String(c))),
  }));

  const outcome = await chatJson(zNarrative, {
    system: NARRATIVE_SYSTEM,
    user: `Intent: """${sanitizeForPrompt(plan.intent, 240)}"""\nTier: ${plan.tier}\nPanels: ${JSON.stringify(outline)}`,
    temperature: 0.2,
    maxTokens: 400,
    timeoutMs: 12_000,
  });
  if (!outcome) return empty;

  const labels = new Map<string, string>();
  for (const b of outcome.value.blocks) labels.set(b.key, sanitizeForPrompt(b.label, 60));
  return {
    title: sanitizeForPrompt(outcome.value.title, 80),
    labels,
    attestationRef: outcome.attestationRef,
    model: outcome.model,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * compose()
 * ──────────────────────────────────────────────────────────────────────── */

function surfaceIdFor(plan: PlanResult): string {
  const slug = sanitizeForPrompt(plan.intent, 40)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `mini-${slug || "app"}`;
}

export const compose: Compose = async (
  plan: PlanResult,
  data: FanOutResult,
): Promise<ComposeResult> => {
  const safeData: FanOutResult = zFanOutResult.safeParse(data).data ?? {
    rows: [],
    bySchema: {},
    sourcesQueried: 0,
    sourcesHealthy: 0,
    sourcesFailed: [],
    costUsd: 0,
    elapsedMs: 0,
  };

  const tier = plan.tier;
  const blocks = detectShapes(safeData, plan);
  const narrative = await narrate(plan, blocks);

  const surfaceId = surfaceIdFor(plan);
  const components: A2UIComponent[] = [];
  const blockData: Record<string, JsonValue> = {};
  const seenIds = new Set<string>();

  const uniqueId = (base: string): string => {
    let id = sanitizeKey(base) || "c";
    let n = 1;
    while (seenIds.has(id)) id = `${sanitizeKey(base)}-${++n}`;
    seenIds.add(id);
    return id;
  };

  /* ── Display: one component per detected shape ─────────────────────── */
  for (const block of blocks) {
    const id = uniqueId(`b-${block.key}`);
    const split = splitSuspect(block.rows);
    blockData[id] = buildPayload(block, split);
    // The caption is what the renderer actually prints under the panel title,
    // so it is where the two disclosures have to live. `label` is not: the
    // narrative pass may replace it with a model-chosen name, and a disclosure
    // a model can overwrite is not a disclosure.
    const caption =
      block.shape === "rows_arbitrary_columns"
        ? `${block.reason}${suspectNote(split, block.rows.length, true)}${metricGapNote(block)}`
        : `${block.reason}${suspectNote(split, block.rows.length)}${metricGapNote(block)}`;
    components.push({
      id,
      component: block.component,
      label: narrative.labels.get(block.key) ?? block.title,
      caption,
      data: bind(`/blocks/${id}`),
      tier,
      rationale: `${block.shape} → ${block.component} (confidence ${block.confidence.toFixed(2)})`,
      hints: {
        accentField: block.fields.primaryMetric,
        accent: accentFor(block, tier),
        unit: unitFor(block.fields.primaryMetric ?? block.fields.value),
        fields: {
          category: block.fields.category,
          time: block.fields.time,
          metrics: block.fields.metrics,
          primaryMetric: block.fields.primaryMetric,
        },
        span: spanFor(block.component),
      },
    });
  }

  /* ── Derived headline ───────────────────────────────────────────────
   * The aggregate of a ranked or timestamped metric is itself a scalar, and
   * a scalar is a metric_card. This is a derivation of the data's shape, not
   * a decoration: it exists only when there is a single metric to aggregate.
   */
  const headline = summaryOf(blocks[0]);
  if (headline) {
    const id = uniqueId("headline");
    blockData[id] = headline.payload;
    components.unshift({
      id,
      component: "metric_card",
      label: headline.label,
      caption: headline.caption,
      data: bind(`/blocks/${id}`),
      tier,
      rationale: "Aggregate of the primary metric is a scalar → metric_card.",
      hints: { accent: tier === "readonly" ? "gain" : "live", unit: headline.unit, span: 4 },
    });
  }

  /* ── Show your work: the rows the panels were built from ───────────── */
  const rawRows = safeData.rows.length > 0 ? safeData.rows : blocks[0]?.rows ?? [];
  if (rawRows.length > 0 && !components.some((c) => c.component === "data_table")) {
    const id = uniqueId("raw-rows");
    // This table keeps every row, flagged ones included — it is where a reader
    // who was told "20 rows were excluded" goes to see the twenty. So it
    // reports the count as a presence, not as a removal.
    const rawSplit = splitSuspect(rawRows);
    const rawNote = suspectNote(rawSplit, rawRows.length, true);
    const columns = [...new Set(rawRows.flatMap((r) => Object.keys(r)))].slice(0, 12);
    blockData[id] = {
      shape: "rows_arbitrary_columns",
      title: "Rows",
      reason: `The result set the panels above were composed from.${rawNote}`,
      confidence: 1,
      rowCount: rawRows.length,
      ...(rawSplit.excluded.length > 0
        ? { suspectCount: rawSplit.excluded.length, suspectFields: rawSplit.fields.slice(), suspectNote: rawNote.trim() }
        : {}),
      columns: columns.map(humanize),
      columnKeys: columns,
      units: columns.map((c) => unitFor(c) ?? "none"),
      rows: rawRows.slice(0, 100).map((r) => columns.map((c) => cell(r, c))),
    };
    components.push({
      id,
      component: "data_table",
      label: "Rows",
      caption: `${rawRows.length} row${rawRows.length === 1 ? "" : "s"} from ${safeData.sourcesHealthy || "the"} source${safeData.sourcesHealthy === 1 ? "" : "s"}.${rawNote}`,
      data: bind(`/blocks/${id}`),
      tier,
      rationale: "Brutalism shows the structure: the raw result set stays on screen.",
      hints: { span: 12 },
    });
  }

  /* ── Monitor chrome: the condition being watched, always visible ───── */
  const hasAlert = components.some((c) => c.component === "alert_banner");
  const threshold = plan.variables?.threshold;
  if (tier !== "readonly" && !hasAlert) {
    const id = uniqueId("watch-banner");
    const th =
      typeof threshold === "object" && threshold !== null
        ? (threshold as { field?: string; op?: string; value?: number })
        : null;
    blockData[id] = {
      shape: "triggered_condition",
      triggered: false,
      severity: "risk",
      condition: th?.field ? humanize(th.field) : "Watch condition",
      threshold: th?.value ?? null,
      operator: th?.op ?? null,
      message: th?.field
        ? `Watching ${humanize(th.field)} ${th.op === "gt" || th.op === "gte" ? "above" : "below"} ${th.value ?? "—"}.`
        : "Watching for the condition in this app's intent.",
      title: "Watch",
      reason: "Tier is monitor or autonomous — the condition being watched is always on screen.",
      confidence: 1,
      rowCount: 0,
    };
    components.push({
      id,
      component: "alert_banner",
      label: "Watching",
      data: bind(`/blocks/${id}`),
      tier,
      rationale: "Required chrome for a non-readonly app: show the standing condition.",
      hints: { accent: "risk", span: 12 },
    });
  }

  /* ── Autonomous chrome: non-negotiable ─────────────────────────────── */
  const policy = defaultPolicy(tier);
  const action = planAction(plan);

  if (tier === "autonomous") {
    const policyId = uniqueId("policy-badge");
    blockData[policyId] = toJson(policy);
    components.push({
      id: policyId,
      component: "policy_badge",
      label: "Policy",
      caption: "Enforced at the signer, not suggested to the model.",
      data: bind(`/blocks/${policyId}`),
      tier,
      rationale: "REQUIRED_FOR_AUTONOMOUS — the user should never have to ask what it can do.",
      hints: { accent: "spend", span: 12 },
    });

    const amountId = uniqueId("amount-input");
    blockData[amountId] = {
      value: 0,
      min: 0,
      max: policy.maxPerTxUsd,
      step: 1,
      unit: "usd",
      cap: policy.maxPerTxUsd,
      note: "Bounded by the per-transaction cap at render time, not just at signing.",
    };
    components.push({
      id: amountId,
      component: "amount_input",
      label: "Amount (USD)",
      data: bind(`/blocks/${amountId}`),
      tier,
      action: serverEvent("amount_changed", { amount: bind("/inputs/amount") }),
      rationale: "Feeds the action context; clamped to maxPerTxUsd.",
      hints: { accent: "spend", span: 6 },
    });

    const allowlistId = uniqueId("allowlist-picker");
    blockData[allowlistId] = {
      options: policy.allowlist.map((addr) => ({ address: addr, label: addr })),
      selected: policy.allowlist[0] ?? null,
      empty: policy.allowlist.length === 0,
      note: "Only policy-approved targets are ever offered. Empty allowlist means no actions.",
    };
    components.push({
      id: allowlistId,
      component: "allowlist_picker",
      label: "Target",
      data: bind(`/blocks/${allowlistId}`),
      tier,
      action: serverEvent("target_changed", { target: bind("/inputs/target") }),
      disabled: policy.allowlist.length === 0,
      rationale: "Renders only allowlisted addresses.",
      hints: { span: 6 },
    });

    const actionKey = action?.verb ?? "execute";
    const buttonId = uniqueId(`action-${actionKey}`);
    blockData[buttonId] = {
      label: action?.label ?? "Execute",
      kind: action?.kind ?? "swap",
      actionKey,
      blocked: policy.allowlist.length === 0,
      blockedReason: "Allowlist is empty — the policy engine will reject every target.",
    };
    components.push({
      id: buttonId,
      component: "action_button",
      label: action?.label ?? "Execute",
      data: bind(`/blocks/${buttonId}`),
      tier,
      disabled: bind("/status/halted"),
      action: serverEvent("execute_action", {
        actionKey,
        kind: action?.kind ?? "swap",
        amountUsd: bind("/inputs/amount"),
        target: bind("/inputs/target"),
        userInitiated: true,
      }),
      rationale: "The core action primitive. Server Event → policy engine → signer.",
      hints: { accent: "spend", span: 6 },
    });

    if (policy.requireConfirm) {
      const confirmId = uniqueId("confirm-dialog");
      blockData[confirmId] = {
        title: `Confirm ${action?.label ?? "action"}`,
        body: "This moves value out of the app's wallet. The policy engine still applies.",
        actionKey,
        requireConfirm: true,
      };
      components.push({
        id: confirmId,
        component: "confirm_dialog",
        label: `Confirm ${action?.label ?? "action"}`,
        data: bind(`/blocks/${confirmId}`),
        tier,
        action: serverEvent("confirm_action", {
          actionKey,
          amountUsd: bind("/inputs/amount"),
          target: bind("/inputs/target"),
          confirmed: true,
        }),
        rationale: "policy.requireConfirm is true, so the action is gated on an explicit confirm.",
        hints: { accent: "spend", span: 6 },
      });
    }

    const logId = uniqueId("trade-log");
    blockData[logId] = { entries: [], streaming: true, note: "Streams from the action journal." };
    components.push({
      id: logId,
      component: "trade_log",
      label: "Journal",
      caption: "Every query, trigger, policy decision and signature.",
      data: bind(`/blocks/${logId}`),
      tier,
      rationale: "REQUIRED_FOR_AUTONOMOUS — an agent that spends must show its work.",
      hints: { accent: "live", span: 12 },
    });

    const killId = uniqueId("kill-switch");
    blockData[killId] = { halted: false, scope: "app", global: false };
    components.push({
      id: killId,
      component: "kill_switch",
      label: "Halt this app",
      data: bind(`/blocks/${killId}`),
      tier,
      // Local first so the UI stops instantly, then the server event makes it
      // durable. A2UI's `action` is one or the other, so the local half rides
      // on our `localAction` extension.
      action: serverEvent("halt_agent", { scope: "app", halted: true }),
      localAction: { call: "setHalted", args: { halted: true } },
      rationale: "REQUIRED_FOR_AUTONOMOUS — killSwitch is true, and runaway loops need an off switch.",
      hints: { accent: "loss", span: 12 },
    });
  }

  /* ── Data model ────────────────────────────────────────────────────── */
  const dataModel: JsonValue = {
    meta: {
      intent: sanitizeForPrompt(plan.intent, 300),
      tier,
      model: sanitizeForPrompt(plan.model, 64),
      attestationRef: plan.attestationRef,
      composedAt: new Date().toISOString(),
      schemas: plan.schemas.slice(),
      networks: plan.networks.slice(),
      queryCount: Object.keys(plan.queries ?? {}).length,
      title: narrative.title ?? sanitizeForPrompt(plan.intent, 60),
    },
    sources: {
      queried: safeData.sourcesQueried,
      healthy: safeData.sourcesHealthy,
      failed: safeData.sourcesFailed.map((s) => sanitizeForPrompt(s, 80)),
      costUsd: safeData.costUsd,
      elapsedMs: safeData.elapsedMs,
      summary: `${safeData.sourcesHealthy} of ${safeData.sourcesQueried} live`,
    },
    blocks: blockData,
    policy: toJson(policy),
    inputs: { amount: 0, target: policy.allowlist[0] ?? null },
    status: { halted: false, streaming: tier !== "readonly" },
    journal: [],
  };

  let ui: A2UIDocument = buildDocument({
    surfaceId,
    components,
    dataModel,
    theme: { tier, primaryColor: "#0047FF" },
    columns: 12,
  });

  /* ── Never return something the renderer cannot draw ───────────────── */
  let validation = validateDocument(ui);
  if (!validation.valid) {
    ui = fallbackDocument(surfaceId, plan, safeData, tier);
    validation = validateDocument(ui);
  }

  const componentsUsed = dedupeComponents(validation.componentsUsed);
  assertAutonomousChrome(tier, componentsUsed);

  return {
    ui,
    componentsUsed,
    attestationRef: narrative.attestationRef ?? plan.attestationRef,
  };
};

interface Headline {
  label: string;
  caption: string;
  unit: A2UIHints["unit"];
  payload: JsonValue;
}

/**
 * The scalar hiding inside a multi-row shape. Sum for a ranked or flow
 * shape, latest for a series. Returns null when there is nothing honest to
 * aggregate — no invented numbers.
 */
function summaryOf(block: ShapeBlock | undefined): Headline | null {
  if (!block) return null;
  const metric = block.fields.primaryMetric ?? block.fields.value;
  if (!metric || block.rows.length < 2) return null;

  // Suspect rows are excluded from the AGGREGATE, and — since this pass — from
  // every other panel that presents a figure as a measurement.
  //
  // A sum is where a single broken upstream value does the most damage: one
  // SushiSwap row reporting 7.2e22 turned a $600M TVL headline into
  // "$131685267736T" at the very top of the page. The old comment here argued
  // that ranking a bad row last was enough for a list, because the reader can
  // see the outlier sitting at the bottom. That argument was wrong in practice:
  // this card said "20 row(s) with impossible values excluded" while the
  // leaderboard immediately below it ranked those same twenty at
  // $26101137179950 — the reader was told the number was impossible and then
  // shown it as a rank. Both panels now filter through `splitSuspect`, so the
  // counts cannot drift apart, and both say the same sentence.
  const split = splitSuspect(block.rows);
  const values = split.usable.map((r) => toNumber(r[metric])).filter((n): n is number => n !== null);
  if (values.length === 0) return null;

  const unit = unitFor(metric);
  // `humanize("totalValueLockedUSD")` already starts with "Total", and prefixing
  // it again read as "Total Total Value Locked USD".
  const name = humanize(metric);
  const totalLabel = /^total\b/i.test(name) ? name : `Total ${name}`;
  // Identical wording to the panels below, on purpose: two different sentences
  // about the same twenty rows is how a reader ends up counting them twice.
  const excludedNote = `${suspectNote(split, block.rows.length)}${metricGapNote(block)}`;

  const summable =
    block.shape === "categorical_ranked" ||
    block.shape === "categorical_one_metric" ||
    block.shape === "many_observations" ||
    block.shape === "source_target_volume";
  const latest =
    block.shape === "timeseries_one_metric" ||
    block.shape === "timeseries_many_metrics" ||
    block.shape === "timeseries_composition";

  if (!summable && !latest) return null;

  if (summable) {
    const total = values.reduce((a, b) => a + b, 0);
    return {
      label: totalLabel,
      caption: `Summed across ${values.length} rows.${excludedNote}`,
      unit,
      payload: {
        shape: "scalar",
        title: totalLabel,
        // Deliberately NOT also set as `sublabel`: metric_card renders
        // `sublabel` inside the card and the renderer already prints `caption`
        // beneath it, so carrying it twice would print the same disclosure
        // twice in one panel and read as a bug rather than as a warning.
        reason: `Aggregate of the ranked metric.${excludedNote}`,
        confidence: 1,
        rowCount: values.length,
        // Carried on the headline too, so a reader inspecting the data model
        // finds the same number the leaderboard reports rather than having to
        // infer it from a difference of two row counts.
        ...(split.excluded.length > 0
          ? { suspectCount: split.excluded.length, suspectFields: split.fields.slice() }
          : {}),
        value: total,
        delta: null,
        label: totalLabel,
        unit: unit ?? "none",
      },
    };
  }

  const first = values[0];
  const last = values[values.length - 1];
  const delta = first !== 0 ? (last - first) / Math.abs(first) : null;
  return {
    label: `Latest ${name}`,
    caption: `Latest of ${values.length} observations.${excludedNote}`,
    unit,
    payload: {
      shape: "scalar_with_delta",
      title: `Latest ${name}`,
      reason: `Most recent point of the series, with change over the window.${excludedNote}`,
      confidence: 1,
      rowCount: values.length,
      value: last,
      delta,
      label: `Latest ${name}`,
      unit: unit ?? "none",
    },
  };
}

function accentFor(block: ShapeBlock, tier: AgencyTier): A2UIHints["accent"] {
  if (block.shape === "triggered_condition") return "loss";
  if (block.shape === "bounded_ratio" || block.shape === "scalar_vs_target") return "risk";
  if (block.shape === "held_position") return tier === "autonomous" ? "spend" : "gain";
  if (tier !== "readonly") return "live";
  return "gain";
}

function spanFor(component: ComponentName): number {
  switch (component) {
    case "metric_card":
    case "gauge":
    case "progress_bar":
    case "position_card":
      return 4;
    case "bar_chart":
    case "grouped_bar":
    case "distribution":
      return 6;
    default:
      return 12;
  }
}

function dedupeComponents(used: ComponentName[]): ComponentName[] {
  return [...new Set(used)];
}

/**
 * The composer cannot be the reason an autonomous app ships without its
 * safety chrome. If this ever fires, the bug is above, not here.
 */
function assertAutonomousChrome(tier: AgencyTier, used: ComponentName[]): void {
  if (tier !== "autonomous") return;
  const missing = REQUIRED_FOR_AUTONOMOUS.filter((c) => !used.includes(c));
  if (missing.length > 0) {
    throw new Error(`Autonomous mini app is missing required components: ${missing.join(", ")}`);
  }
}

/** Last resort: a document that always validates. */
function fallbackDocument(
  surfaceId: string,
  plan: PlanResult,
  data: FanOutResult,
  tier: AgencyTier,
): A2UIDocument {
  const columns = [...new Set(data.rows.flatMap((r) => Object.keys(r)))].slice(0, 12);
  const components: A2UIComponent[] = [
    {
      id: "fallback-table",
      component: "data_table",
      label: sanitizeForPrompt(plan.intent, 60) || "Results",
      caption: "Composed from the raw result set.",
      data: bind("/blocks/fallback-table"),
      tier,
    },
  ];
  const blocks: Record<string, JsonValue> = {
    "fallback-table": {
      shape: "rows_arbitrary_columns",
      title: "Results",
      reason: "Fallback path.",
      confidence: 0.2,
      rowCount: data.rows.length,
      columns: columns.map(humanize),
      columnKeys: columns,
      rows: data.rows.slice(0, 100).map((r) => columns.map((c) => cell(r, c))),
    },
  };

  if (tier === "autonomous") {
    const policy = defaultPolicy(tier);
    blocks["policy-badge"] = toJson(policy);
    blocks["trade-log"] = { entries: [], streaming: true };
    blocks["kill-switch"] = { halted: false, scope: "app" };
    components.push(
      { id: "policy-badge", component: "policy_badge", label: "Policy", data: bind("/blocks/policy-badge"), tier },
      { id: "trade-log", component: "trade_log", label: "Journal", data: bind("/blocks/trade-log"), tier },
      {
        id: "kill-switch",
        component: "kill_switch",
        label: "Halt this app",
        data: bind("/blocks/kill-switch"),
        tier,
        action: serverEvent("halt_agent", { scope: "app", halted: true }),
        localAction: { call: "setHalted", args: { halted: true } },
      },
    );
  }

  return buildDocument({
    surfaceId,
    components,
    dataModel: {
      meta: { intent: sanitizeForPrompt(plan.intent, 300), tier, title: "Results", fallback: true },
      blocks,
      policy: toJson(defaultPolicy(tier)),
      inputs: { amount: 0, target: null },
      status: { halted: false, streaming: false },
      journal: [],
      sources: { queried: data.sourcesQueried, healthy: data.sourcesHealthy, failed: [], costUsd: data.costUsd, elapsedMs: data.elapsedMs, summary: "fallback" },
    },
    theme: { tier },
  });
}

export default compose;
