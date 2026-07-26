/**
 * The three surfaces the landing's morph animation assembles.
 *
 * Authored, not measured — the landing says so under the frame, and the
 * measured runs are in the receipts section below it. But authored THROUGH the
 * composer's own builders, for the same reason `renderer/fixture.tsx` is: if
 * the wire format moves these break at compile time instead of at demo time,
 * and they render through the real renderer and the real client-held catalog
 * rather than being pictures of it.
 *
 * The three questions are the same subject asked three ways, so the animation
 * teaches the tier ladder before the depth section arrives:
 *
 *   ranked categorical  → leaderboard,  readonly,   sits flush
 *   bounded ratio       → gauge,        monitor,    lifts on a live rim
 *   a policy to act on  → the trio,     autonomous, stands proud
 *
 * The middle scene is the argument in one frame: the SAME subject as the first,
 * asked as a threshold question instead of a ranking question, produces a gauge
 * instead of a leaderboard. Form follows the shape of the answer, not words in
 * the prompt.
 */
import {
  bind,
  buildDocument,
  serverEvent,
  type A2UIComponent,
  type A2UIDocument,
  type JsonValue,
} from "@/lib/kit/a2ui";
import { AAVE_V3_POOL, DEMO_JOURNAL, DEMO_POLICY, UNISWAP_V3_ROUTER } from "@/components/renderer/fixture";

export interface Scene {
  /** Stable key, used for React keys and the scene dots. */
  key: "analytics" | "monitor" | "autonomous";
  /** What the reader watches being typed. */
  prompt: string;
  /** The mono trace that prints while the surface is being built. */
  trace: readonly string[];
  doc: A2UIDocument;
}

/**
 * A deterministic health-factor walk. Same approach as `hfPoints` in
 * `renderer/fixture.tsx` — a sine walk rather than `Math.random`, because a
 * fixture that renders differently on every reload cannot be reviewed, and this
 * one is on a landing page where it loops in front of the reader.
 */
function walk(start: number, seed: number, drift: number): JsonValue {
  const t0 = Date.UTC(2026, 6, 21, 0, 0, 0) / 1000;
  const out: JsonValue[] = [];
  let v = start;
  for (let i = 0; i < 48; i += 1) {
    v += Math.sin((i + seed) / 3.1) * 0.021 + drift;
    out.push({ t: t0 + i * 5400, v: Number(v.toFixed(4)) });
  }
  return out as JsonValue;
}

/* ── scene 1 — a ranking question ──────────────────────────────────────── */

const ANALYTICS_BLOCKS: Record<string, JsonValue> = {
  "a-markets": {
    shape: "categorical_ranked",
    title: "Closest to liquidation",
    reason: "Categorical rows already ordered by the metric.",
    confidence: 0.95,
    rowCount: 5,
    metric: "Health Factor",
    unit: "ratio",
    rows: [
      { rank: 1, label: "GMX / WETH — Aave v3", value: 1.08, delta: -0.14 },
      { rank: 2, label: "ARB / USDC — Compound v3", value: 1.19, delta: -0.06 },
      { rank: 3, label: "WBTC / USDT — dForce", value: 1.31, delta: 0.03 },
      { rank: 4, label: "WETH / USDC — Aave v3", value: 1.46, delta: 0.11 },
      { rank: 5, label: "USDC / DAI — Abracadabra", value: 1.72, delta: 0.02 },
    ],
  },
  /*
   * `delta` is a FRACTION of the value, not an absolute change — `metric_card`
   * renders it as a percentage. `b-net-apy` in `renderer/fixture.tsx` is the
   * reference: `value: 3.42, delta: -0.151` reads as −15.1%. Passing an
   * absolute here printed "-9640000.00%" on the landing page's first screen.
   */
  "a-at-risk": {
    shape: "scalar_with_delta",
    title: "Positions under 1.25",
    reason: "A count with a change over the window.",
    confidence: 1,
    rowCount: 36,
    value: 2,
    delta: 1,
    label: "Positions",
    unit: "none",
  },
  "a-collateral": {
    shape: "scalar_with_delta",
    title: "Collateral at risk",
    reason: "Most recent point of the series, with change over the window.",
    confidence: 0.97,
    rowCount: 36,
    value: 1284000,
    delta: -0.0751,
    label: "Collateral Usd",
    unit: "usd",
  },
};

const ANALYTICS_COMPONENTS: A2UIComponent[] = [
  {
    id: "a-at-risk",
    component: "metric_card",
    label: "Positions under 1.25",
    data: bind("/blocks/a-at-risk"),
    tier: "readonly",
    hints: { unit: "none", span: 4 },
  },
  {
    id: "a-collateral",
    component: "metric_card",
    label: "Collateral at risk",
    data: bind("/blocks/a-collateral"),
    tier: "readonly",
    hints: { unit: "usd", span: 4 },
  },
  {
    id: "a-markets",
    component: "leaderboard",
    label: "Closest to liquidation",
    caption: "categorical_ranked → leaderboard",
    data: bind("/blocks/a-markets"),
    tier: "readonly",
    hints: { unit: "ratio", span: 12 },
  },
];

const ANALYTICS: Scene = {
  key: "analytics",
  prompt: "Which Arbitrum lending markets are closest to liquidation?",
  trace: [
    "resolve   → lending-cdp@3.1.0 · arbitrum-one",
    "health    → 6/6 deployments answered",
    "fan-out   → 6 sources, 36 rows",
    "compose   → 3 components, readonly",
  ],
  doc: buildDocument({
    surfaceId: "landing-closest-to-liquidation",
    components: ANALYTICS_COMPONENTS,
    dataModel: {
      meta: {
        intent: "Which Arbitrum lending markets are closest to liquidation?",
        tier: "readonly",
        title: "Closest to liquidation",
        composedAt: "2026-07-26T00:32:06.048Z",
        schemas: ["lending-cdp@3.1.0"],
        networks: ["arbitrum-one"],
      },
      sources: { queried: 6, healthy: 6, failed: [], costUsd: 0.0006, elapsedMs: 268, summary: "6 of 6 live" },
      blocks: ANALYTICS_BLOCKS,
    },
    theme: { tier: "readonly", primaryColor: "#0047FF" },
    columns: 12,
  }),
};

/* ── scene 2 — the same subject, asked as a threshold ──────────────────── */

const MONITOR_BLOCKS: Record<string, JsonValue> = {
  "m-health": {
    shape: "bounded_ratio",
    title: "Health factor",
    reason: "A bounded ratio with a named threshold is a gauge, whatever the prompt said.",
    confidence: 0.94,
    rowCount: 1,
    value: 1.22,
    min: 1,
    max: 3,
    target: 1.15,
    label: "Health Factor",
    unit: "ratio",
  },
  "m-watch": {
    shape: "triggered_condition",
    triggered: false,
    severity: "risk",
    condition: "Health Factor",
    operator: "lt",
    value: 1.22,
    threshold: 1.15,
    message: "Above the threshold. Re-evaluated every block; nothing has fired.",
    title: "Watching",
    reason: "Tier is monitor — the condition being watched is always on screen.",
    confidence: 1,
    rowCount: 1,
  },
  "m-series": {
    shape: "timeseries_many_metrics",
    title: "Health factor, 72h",
    reason: "Timestamped rows with more than one metric.",
    confidence: 0.91,
    rowCount: 48,
    unit: "ratio",
    series: [
      { name: "Health Factor", key: "healthFactor", accent: true, points: walk(1.62, 3, -0.0075) },
      { name: "Market Avg", key: "marketAvg", accent: false, points: walk(1.84, 7, -0.0021) },
    ],
  },
};

const MONITOR_COMPONENTS: A2UIComponent[] = [
  {
    id: "m-watch",
    component: "alert_banner",
    label: "Watching",
    data: bind("/blocks/m-watch"),
    tier: "monitor",
    rationale: "Required chrome for a non-readonly app: show the standing condition.",
    hints: { accent: "risk", span: 12 },
  },
  {
    id: "m-health",
    component: "gauge",
    label: "Health factor",
    caption: "bounded_ratio → gauge",
    data: bind("/blocks/m-health"),
    tier: "monitor",
    hints: { accent: "risk", unit: "ratio", span: 4 },
  },
  {
    id: "m-series",
    component: "time_series",
    label: "Health factor, 72h",
    data: bind("/blocks/m-series"),
    tier: "monitor",
    hints: { accentField: "healthFactor", accent: "live", unit: "ratio", span: 8 },
  },
];

const MONITOR: Scene = {
  key: "monitor",
  prompt: "Tell me when any Aave position drops below 1.15 health",
  trace: [
    "resolve   → lending-cdp@3.1.0 · arbitrum-one",
    "health    → 6/6 deployments answered",
    "fan-out   → 6 sources, 36 rows",
    "compose   → 3 components, monitor",
  ],
  doc: buildDocument({
    surfaceId: "landing-health-watch",
    components: MONITOR_COMPONENTS,
    dataModel: {
      meta: {
        intent: "Tell me when any Aave position drops below 1.15 health",
        tier: "monitor",
        title: "Health watch",
        composedAt: "2026-07-26T00:32:06.048Z",
        schemas: ["lending-cdp@3.1.0"],
        networks: ["arbitrum-one"],
      },
      sources: { queried: 6, healthy: 6, failed: [], costUsd: 0.0006, elapsedMs: 268, summary: "6 of 6 live" },
      blocks: MONITOR_BLOCKS,
      status: { halted: false, streaming: true },
    },
    theme: { tier: "monitor", primaryColor: "#0047FF" },
    columns: 12,
  }),
};

/* ── scene 3 — the same threshold, with permission to act ──────────────── */

const AUTONOMOUS_BLOCKS: Record<string, JsonValue> = {
  /*
   * The SAME gauge payload as scene 2, deliberately. The reader should see one
   * instrument they already recognise, and read the difference as the policy
   * strip, the trade log and the kill switch arriving under it. If the gauge
   * changed too, the frame would read as a different app rather than as the
   * same app granted agency — which is the one thing this scene has to say.
   */
  "x-health": MONITOR_BLOCKS["m-health"],

  "x-policy": {
    tier: "autonomous",
    maxSpendUsd: DEMO_POLICY.maxSpendUsd,
    maxPerTxUsd: DEMO_POLICY.maxPerTxUsd,
    allowlist: [AAVE_V3_POOL, UNISWAP_V3_ROUTER],
    expiresAt: DEMO_POLICY.expiresAt,
    requireConfirm: DEMO_POLICY.requireConfirm,
    killSwitch: DEMO_POLICY.killSwitch,
    halted: false,
    spentUsd: 25,
  },
  "x-log": {
    entries: DEMO_JOURNAL as unknown as JsonValue,
    streaming: true,
    note: "Streams from the action journal.",
  },
  "x-halt": { halted: false, scope: "app", global: false },
};

const AUTONOMOUS_COMPONENTS: A2UIComponent[] = [
  {
    id: "x-health",
    component: "gauge",
    label: "Health factor",
    caption: "the same gauge — what changed is what it may do about it",
    data: bind("/blocks/x-health"),
    tier: "autonomous",
    hints: { accent: "risk", unit: "ratio", span: 4 },
  },
  {
    id: "x-policy",
    component: "policy_badge",
    label: "Policy",
    caption: "Enforced at the signer, not suggested to the model.",
    data: bind("/blocks/x-policy"),
    tier: "autonomous",
    hints: { accent: "spend", span: 8 },
  },
  {
    id: "x-log",
    component: "trade_log",
    label: "Journal",
    caption: "Every query, trigger, policy decision and signature.",
    data: bind("/blocks/x-log"),
    tier: "autonomous",
    hints: { accent: "live", span: 12 },
  },
  {
    id: "x-halt",
    component: "kill_switch",
    label: "Halt this app",
    data: bind("/blocks/x-halt"),
    tier: "autonomous",
    action: serverEvent("halt_agent", { scope: "app", halted: true }),
    localAction: { call: "setHalted", args: { halted: true } },
    hints: { accent: "loss", span: 12 },
  },
];

const AUTONOMOUS: Scene = {
  key: "autonomous",
  prompt: "If health breaks 1.15, repay $25 automatically",
  trace: [
    "resolve   → lending-cdp@3.1.0 · arbitrum-one",
    "health    → 6/6 deployments answered",
    "fan-out   → 6 sources, 36 rows",
    "compose   → 4 components, autonomous",
  ],
  doc: buildDocument({
    surfaceId: "landing-repay-guard",
    components: AUTONOMOUS_COMPONENTS,
    dataModel: {
      meta: {
        intent: "If health breaks 1.15, repay $25 automatically",
        tier: "autonomous",
        title: "Repay guard",
        composedAt: "2026-07-26T00:32:06.048Z",
        schemas: ["lending-cdp@3.1.0"],
        networks: ["arbitrum-one"],
      },
      sources: { queried: 6, healthy: 6, failed: [], costUsd: 0.0006, elapsedMs: 268, summary: "6 of 6 live" },
      blocks: AUTONOMOUS_BLOCKS,
      policy: AUTONOMOUS_BLOCKS["x-policy"],
      status: { halted: false, streaming: true },
      journal: DEMO_JOURNAL as unknown as JsonValue,
    },
    theme: { tier: "autonomous", primaryColor: "#0047FF" },
    columns: 12,
  }),
};

/** Play order. */
export const SCENES: readonly Scene[] = [ANALYTICS, MONITOR, AUTONOMOUS];

export const SCENE_DOCS = {
  analytics: ANALYTICS.doc,
  monitor: MONITOR.doc,
  autonomous: AUTONOMOUS.doc,
} as const;
