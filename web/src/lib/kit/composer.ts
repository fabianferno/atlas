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

function unitFor(field: string | undefined): A2UIHints["unit"] {
  if (!field) return "none";
  if (/usd|tvl|volume|revenue|fees|balance|notional|marketcap|price/i.test(field)) return "usd";
  if (/apy|apr|rate|pct|percent|share|utilization|utilisation/i.test(field)) return "pct";
  if (/count|users|holders|transfers|swaps|trades|blocks/i.test(field)) return "count";
  if (/healthfactor|ratio|ltv|leverage/i.test(field)) return "ratio";
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

function buildPayload(block: ShapeBlock): JsonValue {
  const f = block.fields;
  const rows = block.rows.slice(0, MAX_ROWS);
  const base: Record<string, JsonValue> = {
    shape: block.shape,
    title: block.title,
    reason: block.reason,
    confidence: Math.round(block.confidence * 100) / 100,
    rowCount: block.rows.length,
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
      const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].slice(0, 12);
      return {
        ...base,
        columns: columns.map(humanize),
        columnKeys: columns,
        units: columns.map((c) => unitFor(c) ?? "none"),
        rows: rows.slice(0, 100).map((r) => columns.map((c) => cell(r, c))),
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
    blockData[id] = buildPayload(block);
    components.push({
      id,
      component: block.component,
      label: narrative.labels.get(block.key) ?? block.title,
      caption: block.reason,
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
    const columns = [...new Set(rawRows.flatMap((r) => Object.keys(r)))].slice(0, 12);
    blockData[id] = {
      shape: "rows_arbitrary_columns",
      title: "Rows",
      reason: "The result set the panels above were composed from.",
      confidence: 1,
      rowCount: rawRows.length,
      columns: columns.map(humanize),
      columnKeys: columns,
      units: columns.map((c) => unitFor(c) ?? "none"),
      rows: rawRows.slice(0, 100).map((r) => columns.map((c) => cell(r, c))),
    };
    components.push({
      id,
      component: "data_table",
      label: "Rows",
      caption: `${rawRows.length} row${rawRows.length === 1 ? "" : "s"} from ${safeData.sourcesHealthy || "the"} source${safeData.sourcesHealthy === 1 ? "" : "s"}.`,
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

  // Suspect rows are excluded from the AGGREGATE, not from the table.
  //
  // A sum is the one place a single broken upstream value destroys the whole
  // figure: one SushiSwap row reporting 7.2e22 turned a $600M TVL headline into
  // "$131685267736T" at the very top of the page. Ranking them last is enough for
  // a list, where a reader can see the outlier sitting at the bottom; for a scalar
  // there is nothing to see, just a wrong number. So they are dropped here and the
  // caption says how many, because a quietly filtered total is its own lie.
  const usable = block.rows.filter((r) => !("_suspect" in r));
  const excluded = block.rows.length - usable.length;
  const values = usable.map((r) => toNumber(r[metric])).filter((n): n is number => n !== null);
  if (values.length === 0) return null;

  const unit = unitFor(metric);
  // `humanize("totalValueLockedUSD")` already starts with "Total", and prefixing
  // it again read as "Total Total Value Locked USD".
  const name = humanize(metric);
  const totalLabel = /^total\b/i.test(name) ? name : `Total ${name}`;
  const excludedNote = excluded > 0 ? ` ${excluded} row(s) with impossible values excluded.` : "";

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
        reason: `Aggregate of the ranked metric.${excludedNote}`,
        confidence: 1,
        rowCount: values.length,
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
      reason: "Most recent point of the series, with change over the window.",
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
