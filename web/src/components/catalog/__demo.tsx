"use client";

/**
 * CATALOG DEMO — every component in one place, with believable Arbitrum DeFi
 * data. Not a route: import `<CatalogDemo />` from a page when you want to
 * eyeball the whole surface at once.
 *
 *     import { CatalogDemo } from "@/components/catalog/__demo";
 *
 * Every fixture below is in the shape `buildPayload()` produces in
 * `lib/kit/composer.ts` — this doubles as a reference for what each component
 * expects to receive from the composer.
 *
 * It renders four things:
 *   1. the tier ladder, so the Rule 1 chrome difference is visible side by side
 *   2. all 16 display components with fixture payloads
 *   3. all 7 action components under an autonomous policy
 *   4. the A2UI renderer resolving a real document and dispatching real events
 */

import { useState } from "react";
import {
  RuntimeProvider,
  Panel,
  Label,
  Fig,
  Tag,
  TierTag,
  Hair,
  BrutalButton,
} from "@/components/brutal";
import { ALL_COMPONENTS, DISPLAY_COMPONENTS } from "@/lib/contracts/catalog";
import type { AgencyTier } from "@/lib/contracts/manifest";
import { CATALOG, missingComponents } from ".";
import {
  A2uiRenderer,
  HEALTH_GUARD_DOC,
  HEALTH_GUARD_STREAM,
  HOSTILE_DOC,
  DEMO_POLICY,
  DEMO_JOURNAL,
  AAVE_V3_POOL,
  UNISWAP_V3_ROUTER,
  type A2UIClientAction,
} from "@/components/renderer";

/* ────────────────────────────────────────────────────────────────────────────
   Fixture payloads. Arbitrum DeFi, roughly plausible for July 2026.
   Shapes match lib/kit/composer.ts `buildPayload()`.
   ──────────────────────────────────────────────────────────────────────────*/

const hours = (n: number) => Date.UTC(2026, 6, 22, 0, 0, 0) / 1000 + n * 3600;

function wave(n: number, base: number, amp: number, drift: number, seed = 1) {
  return Array.from({ length: n }, (_, i) => ({
    t: hours(i * 2),
    v: Number((base + Math.sin((i + seed) / 4.3) * amp + i * drift).toFixed(3)),
  }));
}

/** Base fields every block payload carries. */
const meta = (shape: string, title: string, rowCount: number) => ({
  shape,
  title,
  reason: `${shape} → selected by shape, not by keywords in the prompt.`,
  confidence: 0.93,
  rowCount,
});

const FIXTURES: Record<string, unknown> = {
  metric_card: {
    ...meta("scalar_with_delta", "24h fees, Arbitrum DEXs", 168),
    value: 1_284_390,
    delta: 0.124, // fraction, per the composer
    label: "Fees Usd",
    unit: "usd",
  },

  bar_chart: {
    ...meta("categorical_one_metric", "TVL by protocol — Arbitrum", 6),
    metric: "Tvl Usd",
    unit: "usd",
    categories: [
      { label: "Aave v3", value: 812_400_000 },
      { label: "Uniswap v3", value: 604_200_000 },
      { label: "GMX v2", value: 431_900_000 },
      { label: "Pendle", value: 287_100_000 },
      { label: "Camelot v3", value: 141_600_000 },
      { label: "Radiant", value: 78_300_000 },
    ],
  },

  grouped_bar: {
    ...meta("categorical_many_metrics", "Fees vs revenue vs incentives, 7d", 4),
    metrics: ["Fees Usd", "Revenue Usd", "Incentives Usd"],
    metricKeys: ["feesUsd", "revenueUsd", "incentivesUsd"],
    categories: ["Uniswap v3", "Camelot v3", "GMX v2", "Pendle"],
    series: [
      { name: "Fees Usd", key: "feesUsd", accent: false, values: [4_120_000, 910_000, 3_480_000, 740_000] },
      { name: "Revenue Usd", key: "revenueUsd", accent: true, values: [0, 273_000, 1_044_000, 222_000] },
      { name: "Incentives Usd", key: "incentivesUsd", accent: false, values: [0, 402_000, 620_000, 1_180_000] },
    ],
  },

  time_series: {
    ...meta("timeseries_many_metrics", "TVL, 96h — lending-cdp family", 48),
    unit: "usd",
    series: [
      { name: "Aave v3", key: "aave", accent: true, points: wave(48, 812e6, 24e6, 1.1e6, 2) },
      { name: "Radiant", key: "radiant", accent: false, points: wave(48, 78e6, 9e6, -0.4e6, 5) },
      { name: "Compound v3", key: "compound", accent: false, points: wave(48, 212e6, 12e6, 0.3e6, 9) },
    ],
  },

  area_stack: {
    ...meta("timeseries_composition", "Borrows by collateral, 96h", 48),
    unit: "usd",
    metric: "Borrow Usd",
    series: [
      { name: "WETH", key: "WETH", accent: false, points: wave(48, 320e6, 18e6, 0.8e6, 1) },
      { name: "WBTC", key: "WBTC", accent: false, points: wave(48, 180e6, 11e6, 0.2e6, 4) },
      { name: "USDC", key: "USDC", accent: false, points: wave(48, 240e6, 14e6, 0.5e6, 7) },
      { name: "ARB", key: "ARB", accent: false, points: wave(48, 64e6, 8e6, -0.3e6, 11) },
    ],
  },

  candlestick: {
    ...meta("ohlcv", "ARB / USDC — Uniswap v3 0.05%", 42),
    points: Array.from({ length: 42 }, (_, i) => {
      const o = 1.18 + Math.sin(i / 3.7) * 0.09 + i * 0.004;
      const c = o + (Math.sin(i / 2.1) * 0.05 - 0.006);
      return {
        t: hours(i * 4),
        o: Number(o.toFixed(4)),
        c: Number(c.toFixed(4)),
        h: Number((Math.max(o, c) + 0.021).toFixed(4)),
        l: Number((Math.min(o, c) - 0.019).toFixed(4)),
        v: 1_240_000 + i * 18_400,
      };
    }),
  },

  leaderboard: {
    ...meta("categorical_ranked", "Top pools by 24h fees", 5),
    metric: "Fees Usd",
    unit: "usd",
    rows: [
      { rank: 1, label: "WETH / USDC 0.05%", value: 214_800, delta: 16_300 },
      { rank: 2, label: "WETH / ARB 0.30%", value: 96_400, delta: -3_100 },
      { rank: 3, label: "WBTC / WETH 0.05%", value: 71_200, delta: 980 },
      { rank: 4, label: "GMX / WETH 1.00%", value: 44_900, delta: 8_300 },
      { rank: 5, label: "USDC / USDT 0.01%", value: 38_150, delta: -230 },
    ],
  },

  gauge: {
    ...meta("bounded_ratio", "Health factor — Aave v3", 1),
    value: 1.28,
    min: 1,
    max: 3,
    target: 1.35,
    label: "Health Factor",
    unit: "ratio",
  },

  progress_bar: {
    ...meta("scalar_vs_target", "Lifetime spend cap", 1),
    value: 312.4,
    target: 500,
    pct: 0.6248,
    label: "Spent Usd",
    unit: "usd",
    spend: true,
    deadline: "2026-07-31T09:00:00.000Z",
  },

  comparison_grid: {
    ...meta("entities_shared_metrics", "Lending markets — USDC", 3),
    metrics: ["Supply Apy", "Borrow Apy", "Utilisation", "Total Supply Usd", "Reserve Factor"],
    metricKeys: ["supplyApy", "borrowApy", "utilisation", "totalSupplyUsd", "reserveFactor"],
    units: ["pct", "pct", "pct", "usd", "pct"],
    entities: [
      { label: "Aave v3", values: [4.12, 5.63, 78.4, 412_000_000, 10] },
      { label: "Compound v3", values: [3.88, 5.21, 71.2, 188_000_000, 15] },
      { label: "Radiant", values: [6.41, 9.02, 88.9, 41_000_000, 25] },
    ],
  },

  heatmap: {
    ...meta("two_categoricals_one_metric", "24h volume — protocol × chain", 16),
    metric: "Volume Usd",
    unit: "usd",
    rowLabels: ["Uniswap v3", "Aave v3", "GMX", "Pendle"],
    colLabels: ["arbitrum", "optimism", "base", "mainnet"],
    cells: [
      [412e6, 88e6, 154e6, 1_240e6],
      [96e6, 31e6, 44e6, 380e6],
      [212e6, 4e6, 9e6, null],
      [64e6, 12e6, 38e6, 141e6],
    ],
  },

  distribution: {
    ...meta("many_observations", "Borrow position size — Aave v3 Arbitrum", 260),
    metric: "Borrow Usd",
    unit: "usd",
    count: 260,
    total: 18_400_000,
    buckets: [
      { from: 400, to: 40_400, count: 168 },
      { from: 40_400, to: 80_400, count: 41 },
      { from: 80_400, to: 120_400, count: 21 },
      { from: 120_400, to: 160_400, count: 12 },
      { from: 160_400, to: 200_400, count: 7 },
      { from: 200_400, to: 240_400, count: 4 },
      { from: 240_400, to: 280_400, count: 3 },
      { from: 280_400, to: 320_400, count: 2 },
      { from: 320_400, to: 360_400, count: 1 },
      { from: 360_400, to: 400_400, count: 1 },
      { from: 400_400, to: 440_400, count: 0 },
      { from: 440_400, to: 480_400, count: 1 },
    ],
    markers: [{ label: "your size", value: 8420 }],
  },

  flow_diagram: {
    ...meta("source_target_volume", "Bridge volume, 24h", 5),
    unit: "usd",
    metric: "Volume Usd",
    nodes: ["mainnet", "arbitrum", "base", "optimism"],
    flows: [
      { source: "mainnet", target: "arbitrum", value: 184_000_000 },
      { source: "mainnet", target: "base", value: 121_000_000 },
      { source: "arbitrum", target: "base", value: 41_000_000 },
      { source: "optimism", target: "arbitrum", value: 28_400_000 },
      { source: "arbitrum", target: "mainnet", value: 96_200_000 },
    ],
  },

  position_card: {
    ...meta("held_position", "WETH supply on Aave v3", 1),
    label: "WETH supply",
    size: 15_320.4,
    sizeLabel: "Collateral Usd",
    risk: 1.28,
    riskLabel: "Health Factor",
    entries: [
      { label: "Collateral Usd", value: 15_320.4, unit: "usd" },
      { label: "Debt Usd", value: 8_420.55, unit: "usd" },
      { label: "Liquidation Price", value: 2_870.4, unit: "usd" },
      { label: "Supply Apy", value: 3.42, unit: "pct" },
    ],
    positions: [
      { label: "WETH supply", size: 15_320.4, risk: 1.28 },
      { label: "ARB supply", size: 2_410.9, risk: 1.28 },
    ],
    protocol: "aave-v3",
    network: "arbitrum-one",
    account: "0x9C4f2b1a7E3d5F6a8B0c1D2e3F4a5B6c7D8e9F01",
  },

  data_table: {
    ...meta("rows_arbitrary_columns", "Recent swaps — WETH / USDC 0.05%", 4),
    columns: ["Time", "Side", "Amount Usd", "Price", "Account"],
    columnKeys: ["ts", "side", "amountUsd", "price", "account"],
    units: ["none", "none", "usd", "usd", "none"],
    rows: [
      ["09:14:04", "buy", 41_200, 3183.75, "0x9C4f2b1a7E3d5F6a8B0c1D2e3F4a5B6c7D8e9F01"],
      ["09:13:51", "sell", 8_940, 3182.9, "0x4A1b2C3d4E5f60718293a4B5c6D7e8F901234567"],
      ["09:13:48", "buy", 126_400, 3184.12, "0xDeAd00000000000000000000000000000000BeEf"],
      ["09:13:32", "sell", 2_310, 3181.4, "0x00Ff11223344556677889900AaBbCcDdEeFf0011"],
    ],
  },

  alert_banner: {
    ...meta("triggered_condition", "Health factor crossed 1.35", 1),
    triggered: true,
    severity: "risk",
    condition: "Health Factor",
    operator: "lt",
    value: 1.28,
    threshold: 1.35,
    message:
      "Guard armed. Next substream batch triggers a repay of 120 USDC to Aave v3.",
  },

  action_button: {
    label: "Repay debt",
    kind: "repay",
    actionKey: "repay",
    blocked: false,
    blockedReason: "",
    amountUsd: 120,
    target: AAVE_V3_POOL,
    event: "execute_action",
    hints: { accent: "spend" },
  },

  confirm_dialog: {
    title: "Confirm rebalance",
    body: "Sells 0.42 WETH and repays USDC to bring the health factor to 1.80.",
    actionKey: "rebalance",
    requireConfirm: true,
    triggerLabel: "Review rebalance",
    confirmLabel: "Sign and rebalance",
    event: "confirm_action",
    amountUsd: 134.2,
    target: UNISWAP_V3_ROUTER,
    summary: [
      { k: "sell", v: "0.42 WETH" },
      { k: "repay", v: "134.20 USDC" },
      { k: "target HF", v: "1.80" },
    ],
  },

  amount_input: {
    value: 120,
    min: 0,
    max: 150,
    step: 1,
    unit: "usd",
    cap: 150,
    note: "Bounded by the per-transaction cap at render time, not just at signing.",
  },

  allowlist_picker: {
    options: [
      { address: AAVE_V3_POOL, label: "Aave v3 Pool" },
      { address: UNISWAP_V3_ROUTER, label: "Uniswap v3 Router" },
      { address: "0xF403C135812408BFbE8713b5A23a04b3D48AAE31", label: "Convex Booster" },
    ],
    selected: AAVE_V3_POOL,
    empty: false,
    note: "Only policy-approved targets are ever offered.",
  },

  kill_switch: { halted: false, scope: "app", global: false },

  trade_log: { entries: DEMO_JOURNAL, streaming: true },

  policy_badge: {
    tier: "autonomous",
    maxSpendUsd: 500,
    maxPerTxUsd: 150,
    allowlist: [AAVE_V3_POOL, UNISWAP_V3_ROUTER],
    expiresAt: "2026-07-31T09:00:00.000Z",
    requireConfirm: true,
    killSwitch: true,
    halted: false,
    spentUsd: 312.4,
  },
};

/* ────────────────────────────────────────────────────────────────────────────
   The demo surface
   ──────────────────────────────────────────────────────────────────────────*/

export function CatalogDemo() {
  const [events, setEvents] = useState<A2UIClientAction[]>([]);
  const [source, setSource] = useState<"doc" | "stream" | "hostile">("doc");

  const push = (p: A2UIClientAction) => setEvents((e) => [p, ...e].slice(0, 12));
  const gaps = missingComponents();

  const doc =
    source === "doc" ? HEALTH_GUARD_DOC : source === "stream" ? HEALTH_GUARD_STREAM : HOSTILE_DOC;

  const actionNames = ALL_COMPONENTS.filter(
    (n) => !DISPLAY_COMPONENTS.includes(n as (typeof DISPLAY_COMPONENTS)[number]),
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="display text-[1.75rem] leading-none">Component catalog</h1>
        <p className="max-w-prose text-[0.875rem] leading-snug text-[var(--muted-ink)]">
          {ALL_COMPONENTS.length} approved components — {DISPLAY_COMPONENTS.length} display,{" "}
          {actionNames.length} action. The client holds this catalog; the agent may only
          reference it by name.
        </p>
        {gaps.length > 0 ? (
          <Label className="text-loss">unimplemented: {gaps.join(", ")}</Label>
        ) : (
          <Label className="text-gain">registry complete</Label>
        )}
      </header>

      <TierLadder />

      <section className="flex flex-col gap-4">
        <SectionTitle n="02" title="Display components" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {DISPLAY_COMPONENTS.map((name, i) => (
            <Slot key={name} name={name} index={i} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle n="03" title="Action components" />
        <RuntimeProvider tier="autonomous" policy={DEMO_POLICY} spentUsd={312.4} live>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {actionNames.map((name, i) => (
              <Slot
                key={name}
                name={name}
                index={i}
                onAction={(e) =>
                  push({
                    version: "v0.9.1",
                    action: {
                      name: e.name,
                      surfaceId: "demo",
                      sourceComponentId: name,
                      timestamp: new Date().toISOString(),
                      context: e.context as A2UIClientAction["action"]["context"],
                    },
                  })
                }
              />
            ))}
          </div>
        </RuntimeProvider>
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle n="04" title="A2UI renderer" />
        <div className="flex flex-wrap items-center gap-2">
          <BrutalButton
            size="sm"
            intent={source === "doc" ? "primary" : "default"}
            onClick={() => setSource("doc")}
          >
            document
          </BrutalButton>
          <BrutalButton
            size="sm"
            intent={source === "stream" ? "primary" : "default"}
            onClick={() => setSource("stream")}
          >
            + streamed updates
          </BrutalButton>
          <BrutalButton
            size="sm"
            intent={source === "hostile" ? "primary" : "default"}
            onClick={() => setSource("hostile")}
          >
            off-catalog name
          </BrutalButton>
          <Label>tier comes from createSurface.theme.tier</Label>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <A2uiRenderer
            document={doc}
            policy={source === "hostile" ? null : DEMO_POLICY}
            spentUsd={120.04}
            journal={DEMO_JOURNAL}
            onAction={push}
          />

          <Panel title="Dispatched server events" flush>
            {events.length === 0 ? (
              <div className="p-3">
                <Label>press something — client_to_server payloads land here</Label>
              </div>
            ) : (
              <ol className="flex flex-col">
                {events.map((e, i) => (
                  <li key={i} className="border-b border-hairline px-3 py-2 last:border-b-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <Fig size="sm" tone="live">
                        {e.action.name}
                      </Fig>
                      <Fig size="xs" className="text-[var(--muted-ink)]">
                        {e.action.sourceComponentId}
                      </Fig>
                    </div>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[0.6875rem] leading-snug text-[var(--muted-ink)]">
                      {JSON.stringify(e.action.context)}
                    </pre>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ n, title }: { n: string; title: string }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-hairline shadow-[inset_0_-1px_0_var(--bevel-hi)] pb-1">
      <Fig size="sm" className="text-[var(--muted-ink)]">
        {n}
      </Fig>
      <h2 className="display text-[1.0625rem] leading-none">{title}</h2>
    </div>
  );
}

function Slot({
  name,
  index,
  onAction,
}: {
  name: string;
  index: number;
  onAction?: (e: { name: string; context: Record<string, unknown> }) => void;
}) {
  const Component = CATALOG[name as keyof typeof CATALOG];
  if (!Component) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label>
        <span className="fig">{name}</span>
      </Label>
      <Component id={`demo-${name}`} data={FIXTURES[name]} onAction={onAction} index={index} />
    </div>
  );
}

/** Rule 1, made obvious: the same panel at all three tiers, side by side. */
function TierLadder() {
  const tiers: { tier: AgencyTier; blurb: string }[] = [
    { tier: "readonly", blurb: "analytics · cannot act · 1.5px" },
    { tier: "monitor", blurb: "watches and alerts · cannot spend · 2.5px" },
    { tier: "autonomous", blurb: "holds a wallet · can spend · 5px + policy strip" },
  ];
  return (
    <section className="flex flex-col gap-4">
      <SectionTitle n="01" title="Agency tier → border weight" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {tiers.map(({ tier, blurb }, i) => (
          <RuntimeProvider key={tier} tier={tier} policy={tier === "readonly" ? null : DEMO_POLICY}>
            <Panel
              index={i}
              title="Net position"
              meta={<TierTag tier={tier} />}
              policyStrip={
                <>
                  <span>cap $150 / tx</span>
                  <span className="ml-auto">2 targets</span>
                </>
              }
            >
              <div className="flex flex-col gap-1">
                <Fig size="lg">$15,320.40</Fig>
                <Hair />
                <Label>{blurb}</Label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Tag>arbitrum-one</Tag>
                  <Tag>lending-cdp</Tag>
                </div>
              </div>
            </Panel>
          </RuntimeProvider>
        ))}
      </div>
    </section>
  );
}
