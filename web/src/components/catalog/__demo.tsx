"use client";

/**
 * CATALOG DEMO — every component in one place, with believable Arbitrum DeFi
 * data. Not a route: import `<CatalogDemo />` from a page when you want to
 * eyeball the whole surface at once.
 *
 *     import { CatalogDemo } from "@/components/catalog/__demo";
 *
 * It renders three things:
 *   1. the tier ladder, so the Rule 1 chrome difference is visible side by side
 *   2. all 23 catalog components with fixture data
 *   3. the A2UI renderer resolving a real document, dispatching real events
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
  type A2uiActionPayload,
} from "@/components/renderer";

/* ────────────────────────────────────────────────────────────────────────────
   Fixture data. Arbitrum DeFi, roughly plausible for July 2026.
   ──────────────────────────────────────────────────────────────────────────*/

const hours = (n: number) => Date.UTC(2026, 6, 22, 0, 0, 0) / 1000 + n * 3600;

function wave(n: number, base: number, amp: number, drift: number, seed = 1) {
  return Array.from({ length: n }, (_, i) => ({
    t: hours(i * 2),
    v: Number((base + Math.sin((i + seed) / 4.3) * amp + i * drift).toFixed(3)),
  }));
}

const FIXTURES: Record<string, unknown> = {
  metric_card: {
    label: "24h fees, Arbitrum DEXs",
    value: 1_284_390,
    unit: "usd",
    deltaPct: 12.4,
    sublabel: "across 7 dex-amm subgraphs",
    source: "dex-amm@1.3.2",
  },

  bar_chart: {
    label: "TVL by protocol — Arbitrum",
    unit: "usd",
    series: [
      { label: "Aave v3", value: 812_400_000 },
      { label: "Uniswap v3", value: 604_200_000, accent: true },
      { label: "GMX v2", value: 431_900_000 },
      { label: "Pendle", value: 287_100_000 },
      { label: "Camelot v3", value: 141_600_000 },
      { label: "Radiant", value: 78_300_000 },
    ],
  },

  grouped_bar: {
    label: "Fees vs revenue vs incentives, 7d",
    unit: "usd",
    metrics: ["fees", "revenue", "incentives"],
    accentMetric: "revenue",
    rows: [
      { label: "Uniswap v3", values: [4_120_000, 0, 0] },
      { label: "Camelot v3", values: [910_000, 273_000, 402_000] },
      { label: "GMX v2", values: [3_480_000, 1_044_000, 620_000] },
      { label: "Pendle", values: [740_000, 222_000, 1_180_000] },
    ],
  },

  time_series: {
    label: "TVL, 96h — lending-cdp family",
    unit: "usd",
    live: true,
    series: [
      { name: "Aave v3", accent: true, points: wave(48, 812e6, 24e6, 1.1e6, 2) },
      { name: "Radiant", points: wave(48, 78e6, 9e6, -0.4e6, 5) },
      { name: "Compound v3", points: wave(48, 212e6, 12e6, 0.3e6, 9) },
    ],
  },

  area_stack: {
    label: "Borrows by collateral, 96h",
    unit: "usd",
    layers: [
      { name: "WETH", accent: true, points: wave(48, 320e6, 18e6, 0.8e6, 1) },
      { name: "WBTC", points: wave(48, 180e6, 11e6, 0.2e6, 4) },
      { name: "USDC", points: wave(48, 240e6, 14e6, 0.5e6, 7) },
      { name: "ARB", points: wave(48, 64e6, 8e6, -0.3e6, 11) },
    ],
  },

  candlestick: {
    label: "ARB / USDC — Uniswap v3 0.05%",
    candles: Array.from({ length: 42 }, (_, i) => {
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
    label: "Top pools by 24h fees",
    unit: "usd",
    rows: [
      { label: "WETH / USDC 0.05%", sublabel: "uniswap-v3 · arbitrum", value: 214_800, deltaPct: 8.2, accent: true },
      { label: "WETH / ARB 0.30%", sublabel: "camelot-v3 · arbitrum", value: 96_400, deltaPct: -3.1 },
      { label: "WBTC / WETH 0.05%", sublabel: "uniswap-v3 · arbitrum", value: 71_200, deltaPct: 1.4 },
      { label: "GMX / WETH 1.00%", sublabel: "camelot-v3 · arbitrum", value: 44_900, deltaPct: 22.7 },
      { label: "USDC / USDT 0.01%", sublabel: "uniswap-v3 · arbitrum", value: 38_150, deltaPct: -0.6 },
    ],
  },

  gauge: {
    label: "Health factor — Aave v3",
    value: 1.28,
    min: 1,
    max: 3,
    riskAt: 1.35,
    dangerAt: 1.1,
  },

  progress_bar: {
    label: "Lifetime spend cap",
    value: 312.4,
    target: 500,
    unit: "usd",
    spend: true,
    deadline: "2026-07-31T09:00:00.000Z",
  },

  comparison_grid: {
    label: "Lending markets — USDC",
    entities: [
      { name: "Aave v3", network: "arbitrum-one" },
      { name: "Compound v3", network: "arbitrum-one" },
      { name: "Radiant", network: "arbitrum-one" },
    ],
    rows: [
      { metric: "Supply APY", unit: "%", values: [4.12, 3.88, 6.41] },
      { metric: "Borrow APY", unit: "%", values: [5.63, 5.21, 9.02], higherIsBetter: false },
      { metric: "Utilisation", unit: "%", values: [78.4, 71.2, 88.9], higherIsBetter: false },
      { metric: "Total supply", unit: "usd", values: [412_000_000, 188_000_000, 41_000_000] },
      { metric: "Reserve factor", unit: "%", values: [10, 15, 25], higherIsBetter: false },
    ],
  },

  heatmap: {
    label: "24h volume — protocol × chain",
    unit: "usd",
    rows: ["Uniswap v3", "Aave v3", "GMX", "Pendle"],
    cols: ["arbitrum", "optimism", "base", "mainnet"],
    cells: [
      [412e6, 88e6, 154e6, 1_240e6],
      [96e6, 31e6, 44e6, 380e6],
      [212e6, 4e6, 9e6, 0],
      [64e6, 12e6, 38e6, 141e6],
    ],
  },

  distribution: {
    label: "Borrow position size — Aave v3 Arbitrum",
    unit: "usd",
    values: Array.from({ length: 260 }, (_, i) => {
      const r = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
      return Math.round(Math.pow(r, 2.6) * 480_000 + 400);
    }),
    markers: [{ label: "your size", value: 8420 }],
  },

  flow_diagram: {
    label: "Bridge volume, 24h",
    unit: "usd",
    flows: [
      { source: "mainnet", target: "arbitrum", value: 184_000_000 },
      { source: "mainnet", target: "base", value: 121_000_000 },
      { source: "arbitrum", target: "base", value: 41_000_000 },
      { source: "optimism", target: "arbitrum", value: 28_400_000 },
      { source: "arbitrum", target: "mainnet", value: 96_200_000 },
    ],
  },

  position_card: {
    asset: "WETH",
    side: "supply",
    protocol: "aave-v3",
    network: "arbitrum-one",
    account: "0x9C4f2b1a7E3d5F6a8B0c1D2e3F4a5B6c7D8e9F01",
    size: 4.812,
    sizeUsd: 15_320.4,
    entry: 2740.1,
    mark: 3183.75,
    pnlUsd: 2134.6,
    pnlPct: 16.19,
    healthFactor: 1.28,
    liquidationPrice: 2870.4,
  },

  data_table: {
    label: "Recent swaps — WETH / USDC 0.05%",
    columns: [
      { key: "ts", label: "time" },
      { key: "side", label: "side" },
      { key: "amountUsd", label: "size", unit: "usd", align: "right" },
      { key: "price", label: "price", unit: "usd", align: "right" },
      { key: "account", label: "account" },
    ],
    rows: [
      { ts: "09:14:04", side: "buy", amountUsd: 41_200, price: 3183.75, account: "0x9C4f2b1a7E3d5F6a8B0c1D2e3F4a5B6c7D8e9F01" },
      { ts: "09:13:51", side: "sell", amountUsd: 8_940, price: 3182.9, account: "0x4A1b2C3d4E5f60718293a4B5c6D7e8F901234567" },
      { ts: "09:13:48", side: "buy", amountUsd: 126_400, price: 3184.12, account: "0xDeAd00000000000000000000000000000000BeEf" },
      { ts: "09:13:32", side: "sell", amountUsd: 2_310, price: 3181.4, account: "0x00Ff11223344556677889900AaBbCcDdEeFf0011" },
    ],
  },

  alert_banner: {
    severity: "risk",
    title: "Health factor crossed 1.35",
    message: "Guard armed. Next substream batch triggers a repay of 120 USDC to Aave v3.",
    at: "2026-07-24T09:14:04.930Z",
    source: "substreams · aave-v3-arbitrum",
    value: 1.28,
    threshold: 1.35,
  },

  action_button: {
    label: "Repay 120 USDC",
    event: "repay_debt",
    amountUsd: 120,
    target: AAVE_V3_POOL,
    context: { asset: "USDC" },
  },

  confirm_dialog: {
    title: "Rebalance to target health factor",
    body: "Sells 0.42 WETH and repays USDC to bring the health factor to 1.80.",
    triggerLabel: "Review rebalance",
    confirmLabel: "Sign and rebalance",
    event: "rebalance_position",
    amountUsd: 134.2,
    target: UNISWAP_V3_ROUTER,
    summary: [
      { k: "sell", v: "0.42 WETH" },
      { k: "repay", v: "134.20 USDC" },
      { k: "target HF", v: "1.80" },
    ],
  },

  amount_input: {
    label: "Repay amount",
    bind: "/repayAmount",
    value: 120,
    token: "USDC",
    priceUsd: 1,
    balance: 1840.22,
  },

  allowlist_picker: {
    label: "Repay to",
    bind: "/repayTarget",
    value: AAVE_V3_POOL,
    options: [
      { address: AAVE_V3_POOL, label: "Aave v3 Pool", network: "arbitrum-one" },
      { address: UNISWAP_V3_ROUTER, label: "Uniswap v3 Router", network: "arbitrum-one" },
      { address: "0xF403C135812408BFbE8713b5A23a04b3D48AAE31", label: "Convex Booster", network: "mainnet" },
    ],
  },

  kill_switch: { halted: false, event: "kill_switch" },

  trade_log: { entries: DEMO_JOURNAL },

  policy_badge: { policy: DEMO_POLICY, spentUsd: 312.4 },
};

/* ────────────────────────────────────────────────────────────────────────────
   The demo surface
   ──────────────────────────────────────────────────────────────────────────*/

export function CatalogDemo() {
  const [events, setEvents] = useState<A2uiActionPayload[]>([]);
  const [source, setSource] = useState<"doc" | "stream" | "hostile">("doc");

  const push = (p: A2uiActionPayload) => setEvents((e) => [p, ...e].slice(0, 12));
  const gaps = missingComponents();

  const doc =
    source === "doc" ? HEALTH_GUARD_DOC : source === "stream" ? HEALTH_GUARD_STREAM : HOSTILE_DOC;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="display text-[1.75rem] leading-none">Component catalog</h1>
        <p className="max-w-prose text-[0.875rem] leading-snug text-[var(--muted-ink)]">
          {ALL_COMPONENTS.length} approved components — {DISPLAY_COMPONENTS.length} display,{" "}
          {ALL_COMPONENTS.length - DISPLAY_COMPONENTS.length} action. The client holds this
          catalog; the agent may only reference it by name.
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
            {ALL_COMPONENTS.filter(
              (n) => !DISPLAY_COMPONENTS.includes(n as (typeof DISPLAY_COMPONENTS)[number]),
            ).map((name, i) => (
              <Slot key={name} name={name} index={i} onAction={(e) => push({
                version: "v0.9",
                action: { name: e.name, surfaceId: "demo", sourceComponentId: name, context: e.context },
              })} />
            ))}
          </div>
        </RuntimeProvider>
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle n="04" title="A2UI renderer" />
        <div className="flex flex-wrap items-center gap-2">
          <BrutalButton size="sm" intent={source === "doc" ? "primary" : "default"} onClick={() => setSource("doc")}>
            document
          </BrutalButton>
          <BrutalButton size="sm" intent={source === "stream" ? "primary" : "default"} onClick={() => setSource("stream")}>
            message stream
          </BrutalButton>
          <BrutalButton size="sm" intent={source === "hostile" ? "primary" : "default"} onClick={() => setSource("hostile")}>
            unknown component
          </BrutalButton>
          <Label>autonomous tier · policy enforced client-side at render</Label>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <A2uiRenderer
            document={doc}
            tier="autonomous"
            policy={DEMO_POLICY}
            spentUsd={312.4}
            live
            journal={DEMO_JOURNAL}
            onAction={push}
          />

          <Panel title="Dispatched server events" flush>
            {events.length === 0 ? (
              <div className="p-3">
                <Label>press something — payloads land here</Label>
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
    <div className="flex items-baseline gap-3 border-b-[1.5px] border-rule pb-1">
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
