/**
 * Fixture A2UI documents, built with the composer's own builders.
 *
 * These go through `buildDocument()` from `@/lib/kit/a2ui`, so if the wire
 * format moves, these break at compile time rather than at demo time. Every
 * component binds `/blocks/<its own id>` and the payloads are exactly the
 * shapes `buildPayload()` produces — this file is the renderer's contract test
 * against the composer.
 */

import { buildDocument, bind, serverEvent, type A2UIComponent, type A2UIDocument, type JsonValue } from "@/lib/kit/a2ui";
import type { Policy } from "@/lib/contracts/manifest";
import type { JournalEntry } from "@/lib/contracts/policy";

export const AAVE_V3_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";
export const UNISWAP_V3_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

/** A bound policy — what a published autonomous app looks like. */
export const DEMO_POLICY: Policy = {
  wallet: "0x9C4f2b1a7E3d5F6a8B0c1D2e3F4a5B6c7D8e9F01",
  maxSpendUsd: 500,
  maxPerTxUsd: 150,
  allowlist: [AAVE_V3_POOL, UNISWAP_V3_ROUTER],
  expiresAt: "2026-07-31T09:00:00.000Z",
  requireConfirm: true,
  killSwitch: true,
  halted: false,
};

export const DEMO_JOURNAL: JournalEntry[] = [
  {
    ts: "2026-07-24T09:14:02.000Z",
    kind: "STREAM",
    message: "substream aave-v3-arbitrum: 412 events, 1 position touched",
    ok: true,
  },
  {
    ts: "2026-07-24T09:14:02.400Z",
    kind: "TRIGGER",
    message: "healthFactor 1.28 < 1.35 — guard fired",
    ok: true,
  },
  {
    ts: "2026-07-24T09:14:02.610Z",
    kind: "POLICY",
    message: "repay 120 USDC → aave-v3 pool: within per-tx cap, target allowlisted",
    ok: true,
  },
  {
    ts: "2026-07-24T09:14:04.930Z",
    kind: "ACTION",
    message: "repay 120 USDC to Aave v3",
    spentUsd: 120.04,
    txHash: "0x4f2c9a1be7d3085c6a4b19ef0d27cc51a8b3f6027d9e1c4a5b6d7e8f90123456",
    ok: true,
  },
  {
    ts: "2026-07-24T09:14:05.120Z",
    kind: "QUERY",
    message: "refetch position — healthFactor 1.28 → 1.46",
    ok: true,
  },
  {
    ts: "2026-07-24T09:31:44.000Z",
    kind: "ERROR",
    message: "source radiant-arbitrum unreachable — skipped, 27 of 31 live",
    ok: false,
  },
];

function hfPoints(offset = 0, seed = 3): JsonValue {
  const start = Date.UTC(2026, 6, 21, 0, 0, 0) / 1000;
  const out: JsonValue = [];
  let v = 1.62 + offset;
  for (let i = 0; i < 48; i += 1) {
    v += Math.sin((i + seed) / 3.1) * 0.021 - 0.0042;
    (out as JsonValue[]).push({ t: start + i * 5400, v: Number(v.toFixed(4)) });
  }
  return out;
}

/* ── block payloads, in `buildPayload()` shape ─────────────────────────── */

const blocks: Record<string, JsonValue> = {
  "b-health-factor": {
    shape: "bounded_ratio",
    title: "Health factor",
    reason: "A bounded ratio with a named threshold is a gauge, whatever the prompt said.",
    confidence: 0.94,
    rowCount: 1,
    value: 1.46,
    min: 1,
    max: 3,
    target: 1.35,
    label: "Health Factor",
    unit: "ratio",
  },
  "b-net-apy": {
    shape: "scalar_with_delta",
    title: "Net APY",
    reason: "Most recent point of the series, with change over the window.",
    confidence: 1,
    rowCount: 168,
    value: 3.42,
    delta: -0.151,
    label: "Net Apy",
    unit: "pct",
  },
  "b-debt": {
    shape: "scalar_vs_target",
    title: "Debt against cap",
    reason: "A scalar with a known target is a progress bar.",
    confidence: 0.88,
    rowCount: 1,
    value: 8420.55,
    target: 12000,
    pct: 0.7017,
    label: "Debt Usd",
    unit: "usd",
  },
  "b-hf-series": {
    shape: "timeseries_many_metrics",
    title: "Health factor, 72h",
    reason: "Timestamped rows with more than one metric.",
    confidence: 0.91,
    rowCount: 48,
    unit: "ratio",
    series: [
      { name: "Health Factor", key: "healthFactor", accent: true, points: hfPoints() },
      { name: "Market Avg", key: "marketAvg", accent: false, points: hfPoints(0.22, 7) },
    ],
  },
  "b-top-pools": {
    shape: "categorical_ranked",
    title: "Top pools by 24h fees",
    reason: "Categorical rows already ordered by the metric.",
    confidence: 0.96,
    rowCount: 5,
    metric: "Fees Usd",
    unit: "usd",
    rows: [
      { rank: 1, label: "WETH / USDC 0.05%", value: 214800, delta: 16300 },
      { rank: 2, label: "WETH / ARB 0.30%", value: 96400, delta: -3100 },
      { rank: 3, label: "WBTC / WETH 0.05%", value: 71200, delta: 980 },
      { rank: 4, label: "GMX / WETH 1.00%", value: 44900, delta: 8300 },
      { rank: 5, label: "USDC / USDT 0.01%", value: 38150, delta: -230 },
    ],
  },
  "b-position": {
    shape: "held_position",
    title: "WETH supply on Aave v3",
    reason: "One row describing something the wallet holds.",
    confidence: 0.9,
    rowCount: 1,
    label: "WETH supply",
    size: 15320.4,
    sizeLabel: "Collateral Usd",
    risk: 1.46,
    riskLabel: "Health Factor",
    entries: [
      { label: "Collateral Usd", value: 15320.4, unit: "usd" },
      { label: "Debt Usd", value: 8420.55, unit: "usd" },
      { label: "Liquidation Price", value: 2265.4, unit: "usd" },
      { label: "Supply Apy", value: 3.42, unit: "pct" },
    ],
    positions: [{ label: "WETH supply", size: 15320.4, risk: 1.46 }],
  },
  "b-watch": {
    shape: "triggered_condition",
    triggered: true,
    severity: "risk",
    condition: "Health Factor",
    operator: "lt",
    value: 1.28,
    threshold: 1.35,
    message:
      "Guard repaid 120 USDC to Aave v3. Health factor recovered to 1.46. Next check on the following block batch.",
    title: "Watch",
    reason: "Tier is autonomous — the condition being watched is always on screen.",
    confidence: 1,
    rowCount: 1,
  },
  "raw-rows": {
    shape: "rows_arbitrary_columns",
    title: "Rows",
    reason: "The result set the panels above were composed from.",
    confidence: 1,
    rowCount: 4,
    columns: ["Pool", "Network", "Fees Usd", "Tvl Usd", "Account"],
    columnKeys: ["pool", "network", "feesUsd", "tvlUsd", "account"],
    units: ["none", "none", "usd", "usd", "none"],
    rows: [
      ["WETH / USDC 0.05%", "arbitrum-one", 214800, 604200000, "0x9C4f2b1a7E3d5F6a8B0c1D2e3F4a5B6c7D8e9F01"],
      ["WETH / ARB 0.30%", "arbitrum-one", 96400, 141600000, "0x4A1b2C3d4E5f60718293a4B5c6D7e8F901234567"],
      ["WBTC / WETH 0.05%", "arbitrum-one", 71200, 288100000, "0xDeAd00000000000000000000000000000000BeEf"],
      ["USDC / USDT 0.01%", "arbitrum-one", 38150, 92400000, "0x00Ff11223344556677889900AaBbCcDdEeFf0011"],
    ],
  },
  "policy-badge": {
    tier: "autonomous",
    maxSpendUsd: 500,
    maxPerTxUsd: 150,
    allowlist: [AAVE_V3_POOL, UNISWAP_V3_ROUTER],
    expiresAt: "2026-07-31T09:00:00.000Z",
    requireConfirm: true,
    killSwitch: true,
    halted: false,
    spentUsd: 120.04,
  },
  "amount-input": {
    value: 120,
    min: 0,
    max: 150,
    step: 1,
    unit: "usd",
    cap: 150,
    note: "Bounded by the per-transaction cap at render time, not just at signing.",
  },
  "allowlist-picker": {
    options: [
      { address: AAVE_V3_POOL, label: "Aave v3 Pool" },
      { address: UNISWAP_V3_ROUTER, label: "Uniswap v3 Router" },
    ],
    selected: AAVE_V3_POOL,
    empty: false,
    note: "Only policy-approved targets are ever offered.",
  },
  "action-repay": {
    label: "Repay debt",
    kind: "repay",
    actionKey: "repay",
    blocked: false,
    blockedReason: "",
  },
  "confirm-dialog": {
    title: "Confirm repay debt",
    body: "This moves value out of the app's wallet. The policy engine still applies.",
    actionKey: "repay",
    requireConfirm: true,
  },
  "trade-log": {
    entries: DEMO_JOURNAL as unknown as JsonValue,
    streaming: true,
    note: "Streams from the action journal.",
  },
  "kill-switch": { halted: false, scope: "app", global: false },
};

const components: A2UIComponent[] = [
  {
    id: "b-watch",
    component: "alert_banner",
    label: "Watching",
    data: bind("/blocks/b-watch"),
    tier: "autonomous",
    rationale: "Required chrome for a non-readonly app: show the standing condition.",
    hints: { accent: "risk", span: 12 },
  },
  {
    id: "b-health-factor",
    component: "gauge",
    label: "Health factor",
    caption: "bounded_ratio → gauge (confidence 0.94)",
    data: bind("/blocks/b-health-factor"),
    tier: "autonomous",
    hints: { accent: "risk", unit: "ratio", span: 4 },
  },
  {
    id: "b-net-apy",
    component: "metric_card",
    label: "Net APY",
    data: bind("/blocks/b-net-apy"),
    tier: "autonomous",
    hints: { accent: "live", unit: "pct", span: 4 },
  },
  {
    id: "b-debt",
    component: "progress_bar",
    label: "Debt against cap",
    data: bind("/blocks/b-debt"),
    tier: "autonomous",
    hints: { accent: "risk", unit: "usd", span: 4 },
  },
  {
    id: "b-hf-series",
    component: "time_series",
    label: "Health factor, 72h",
    caption: "timeseries_many_metrics → time_series (confidence 0.91)",
    data: bind("/blocks/b-hf-series"),
    tier: "autonomous",
    hints: { accentField: "healthFactor", accent: "live", unit: "ratio", span: 12 },
  },
  {
    id: "b-position",
    component: "position_card",
    label: "WETH supply on Aave v3",
    data: bind("/blocks/b-position"),
    tier: "autonomous",
    hints: { accent: "spend", unit: "usd", span: 4 },
  },
  {
    id: "b-top-pools",
    component: "leaderboard",
    label: "Top pools by 24h fees",
    data: bind("/blocks/b-top-pools"),
    tier: "autonomous",
    hints: { accent: "live", unit: "usd", span: 8 },
  },
  {
    id: "policy-badge",
    component: "policy_badge",
    label: "Policy",
    caption: "Enforced at the signer, not suggested to the model.",
    data: bind("/blocks/policy-badge"),
    tier: "autonomous",
    hints: { accent: "spend", span: 12 },
  },
  {
    id: "amount-input",
    component: "amount_input",
    label: "Amount (USD)",
    data: bind("/blocks/amount-input"),
    tier: "autonomous",
    action: serverEvent("amount_changed", { amount: bind("/inputs/amount") }),
    hints: { accent: "spend", span: 6 },
  },
  {
    id: "allowlist-picker",
    component: "allowlist_picker",
    label: "Target",
    data: bind("/blocks/allowlist-picker"),
    tier: "autonomous",
    action: serverEvent("target_changed", { target: bind("/inputs/target") }),
    hints: { span: 6 },
  },
  {
    id: "action-repay",
    component: "action_button",
    label: "Repay debt",
    data: bind("/blocks/action-repay"),
    tier: "autonomous",
    disabled: bind("/status/halted"),
    action: serverEvent("execute_action", {
      actionKey: "repay",
      kind: "repay",
      amountUsd: bind("/inputs/amount"),
      target: bind("/inputs/target"),
      userInitiated: true,
    }),
    hints: { accent: "spend", span: 6 },
  },
  {
    id: "confirm-dialog",
    component: "confirm_dialog",
    label: "Confirm repay debt",
    data: bind("/blocks/confirm-dialog"),
    tier: "autonomous",
    action: serverEvent("confirm_action", {
      actionKey: "repay",
      amountUsd: bind("/inputs/amount"),
      target: bind("/inputs/target"),
      confirmed: true,
    }),
    hints: { accent: "spend", span: 6 },
  },
  {
    id: "raw-rows",
    component: "data_table",
    label: "Rows",
    caption: "4 rows from 27 sources.",
    data: bind("/blocks/raw-rows"),
    tier: "autonomous",
    hints: { span: 12 },
  },
  {
    id: "trade-log",
    component: "trade_log",
    label: "Journal",
    caption: "Every query, trigger, policy decision and signature.",
    data: bind("/blocks/trade-log"),
    tier: "autonomous",
    hints: { accent: "live", span: 12 },
  },
  {
    id: "kill-switch",
    component: "kill_switch",
    label: "Halt this app",
    data: bind("/blocks/kill-switch"),
    tier: "autonomous",
    action: serverEvent("halt_agent", { scope: "app", halted: true }),
    localAction: { call: "setHalted", args: { halted: true } },
    hints: { accent: "loss", span: 12 },
  },
];

const dataModel: JsonValue = {
  meta: {
    intent: "Keep my Aave v3 health factor above 1.35 on Arbitrum",
    tier: "autonomous",
    title: "Health factor guard",
    composedAt: "2026-07-24T09:14:00.000Z",
    schemas: ["lending-cdp@3.1.0", "dex-amm@1.3.2"],
    networks: ["arbitrum-one"],
  },
  sources: { queried: 31, healthy: 27, failed: [], costUsd: 0.0042, elapsedMs: 810, summary: "27 of 31 live" },
  blocks,
  policy: blocks["policy-badge"],
  inputs: { amount: 120, target: AAVE_V3_POOL },
  status: { halted: false, streaming: true },
  journal: DEMO_JOURNAL as unknown as JsonValue,
};

/** The canonical three-message document, autonomous tier. */
export const HEALTH_GUARD_DOC: A2UIDocument = buildDocument({
  surfaceId: "mini-health-factor-guard",
  components,
  dataModel,
  theme: { tier: "autonomous", primaryColor: "#0047FF" },
  columns: 12,
});

/**
 * The same surface with two extra streamed messages appended — proves the
 * renderer folds `updateDataModel` at a sub-path, not just at the root.
 */
export const HEALTH_GUARD_STREAM: A2UIDocument = [
  ...HEALTH_GUARD_DOC,
  { version: "v0.9.1", updateDataModel: { surfaceId: "mini-health-factor-guard", path: "/blocks/b-health-factor/value", value: 1.61 } },
  { version: "v0.9.1", updateDataModel: { surfaceId: "mini-health-factor-guard", path: "/inputs/amount", value: 45 } },
];

/**
 * A document that names something outside the catalog, plus a dangling data
 * binding. Proves the fallback path: `validateDocument` reports both, the
 * unknown component renders inert, and the valid panel still draws.
 *
 * The `as` casts are deliberate — the composer's types make this document
 * unrepresentable, which is the point. Only a hand-edited or hostile payload
 * can produce it, so the fixture has to reach past the type system to build it.
 */
export const HOSTILE_DOC: A2UIDocument = [
  {
    version: "v0.9.1",
    createSurface: {
      surfaceId: "hostile",
      catalogId: "atlas",
      theme: { tier: "readonly" },
      layout: { order: ["ok", "bad", "dangling"], columns: 12 },
    },
  },
  {
    version: "v0.9.1",
    updateComponents: {
      surfaceId: "hostile",
      components: [
        {
          id: "ok",
          component: "metric_card",
          label: "Renders fine",
          data: bind("/blocks/ok"),
          hints: { span: 4 },
        },
        {
          id: "bad",
          component: "script_tag" as A2UIComponent["component"],
          label: "Not in the catalog",
          hints: { span: 4 },
        },
        {
          id: "dangling",
          component: "gauge",
          label: "Binding goes nowhere",
          data: bind("/blocks/does-not-exist"),
          hints: { span: 4 },
        },
      ],
    },
  },
  {
    version: "v0.9.1",
    updateDataModel: {
      surfaceId: "hostile",
      path: "/",
      value: {
        blocks: {
          ok: { shape: "scalar", title: "Fine", reason: "", confidence: 1, rowCount: 1, value: 42, label: "Fine", unit: "count" },
        },
      },
    },
  },
];
