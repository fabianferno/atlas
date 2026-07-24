/**
 * A fixture A2UI document, for integration and for the demo.
 *
 * This is exactly what the composer is expected to emit: a flat component list
 * with ID references, `{"path": …}` bindings into a separate data model, and
 * one `action.event` per interactive component. Nothing in here is code.
 *
 * `HEALTH_GUARD_STREAM` is the same surface delivered as A2UI server messages,
 * to prove the streaming path folds to the same document.
 */

import type { Policy } from "@/lib/contracts/manifest";
import type { JournalEntry } from "@/lib/contracts/policy";
import type { A2uiDocument, A2uiMessage } from "./types";

export const AAVE_V3_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";
export const UNISWAP_V3_ROUTER = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

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

/** The data model. Every `{"path": …}` in the components resolves into this. */
const dataModel: Record<string, unknown> = {
  healthFactor: 1.46,
  liquidationAt: 1.0,
  netApy: 3.42,
  netApyDelta: -0.61,
  debtUsd: 8420.55,
  debtCapUsd: 12000,
  spentUsd: 120.04,
  repayAmount: 120,
  repayTarget: AAVE_V3_POOL,
  position: {
    asset: "WETH",
    side: "supply",
    protocol: "aave-v3",
    network: "arbitrum-one",
    account: "0x9C4f2b1a7E3d5F6a8B0c1D2e3F4a5B6c7D8e9F01",
    size: 4.812,
    sizeUsd: 15320.4,
    entry: 2740.1,
    mark: 3183.75,
    pnlUsd: 2134.6,
    pnlPct: 16.19,
    healthFactor: 1.46,
    liquidationPrice: 2265.4,
  },
  hfSeries: [
    { name: "health factor", accent: true, points: hfPoints() },
    { name: "market avg", points: hfPoints(0.22, 7) },
  ],
  alert: {
    severity: "risk",
    title: "Health factor crossed 1.35",
    message:
      "Guard repaid 120 USDC to Aave v3. Health factor recovered to 1.46. Next check on the following block batch.",
    at: "2026-07-24T09:14:04.930Z",
    source: "substreams · aave-v3-arbitrum",
    value: 1.28,
    threshold: 1.35,
  },
  allowlistOptions: [
    { address: AAVE_V3_POOL, label: "Aave v3 Pool", network: "arbitrum-one" },
    { address: UNISWAP_V3_ROUTER, label: "Uniswap v3 Router", network: "arbitrum-one" },
    {
      address: "0xF403C135812408BFbE8713b5A23a04b3D48AAE31",
      label: "Convex Booster (not allowlisted)",
      network: "mainnet",
    },
  ],
  journal: DEMO_JOURNAL,
  policy: DEMO_POLICY,
};

function hfPoints(offset = 0, seed = 3): { t: number; v: number }[] {
  const start = Date.UTC(2026, 6, 21, 0, 0, 0) / 1000;
  const out: { t: number; v: number }[] = [];
  let v = 1.62 + offset;
  for (let i = 0; i < 48; i += 1) {
    v += Math.sin((i + seed) / 3.1) * 0.021 - 0.0042;
    out.push({ t: start + i * 3600 * 1.5, v: Number(v.toFixed(4)) });
  }
  return out;
}

export const HEALTH_GUARD_DOC: A2uiDocument = {
  version: "v0.9",
  surfaceId: "hf-guard",
  catalogId: "graphmini/1",
  root: "root",
  dataModel,
  components: [
    { id: "root", component: "column", children: ["alert", "top", "hf-chart", "pos", "act", "policy", "log"] },

    { id: "alert", component: "alert_banner", properties: { path: "/alert" } },

    { id: "top", component: "grid", properties: { columns: 3 }, children: ["hf", "apy", "debt"] },
    {
      id: "hf",
      component: "gauge",
      properties: {
        label: "Health factor",
        value: { path: "/healthFactor" },
        min: 1,
        max: 3,
        riskAt: 1.35,
        dangerAt: 1.1,
      },
    },
    {
      id: "apy",
      component: "metric_card",
      properties: {
        label: "Net APY",
        value: { path: "/netApy" },
        unit: "%",
        deltaPct: { path: "/netApyDelta" },
        sublabel: "supply minus borrow, 7d",
      },
    },
    {
      id: "debt",
      component: "progress_bar",
      properties: {
        label: "Debt against cap",
        value: { path: "/debtUsd" },
        target: { path: "/debtCapUsd" },
        unit: "usd",
      },
    },

    {
      id: "hf-chart",
      component: "time_series",
      properties: { label: "Health factor, 72h", series: { path: "/hfSeries" }, live: true },
    },

    { id: "pos", component: "position_card", properties: { path: "/position" } },

    { id: "act", component: "row", children: ["amount", "target", "repay"] },
    {
      id: "amount",
      component: "amount_input",
      properties: {
        label: "Repay amount",
        bind: "/repayAmount",
        value: { path: "/repayAmount" },
        token: "USDC",
        priceUsd: 1,
        balance: 1840.22,
      },
    },
    {
      id: "target",
      component: "allowlist_picker",
      properties: {
        label: "Repay to",
        bind: "/repayTarget",
        value: { path: "/repayTarget" },
        options: { path: "/allowlistOptions" },
      },
    },
    {
      id: "repay",
      component: "confirm_dialog",
      properties: {
        title: "Repay to Aave v3",
        body: "Restores the health factor above the 1.35 guard threshold.",
        triggerLabel: "Repay now",
        confirmLabel: "Sign and repay",
        amountUsd: { path: "/repayAmount" },
        target: { path: "/repayTarget" },
        summary: [
          { k: "protocol", v: "aave-v3" },
          { k: "network", v: "arbitrum-one" },
          { k: "expected HF", v: "1.61" },
        ],
      },
      action: {
        event: {
          name: "repay_debt",
          context: {
            amount: { path: "/repayAmount" },
            target: { path: "/repayTarget" },
            asset: { path: "/position/asset" },
          },
        },
      },
    },

    {
      id: "policy",
      component: "policy_badge",
      properties: { policy: { path: "/policy" }, spentUsd: { path: "/spentUsd" } },
    },
    {
      id: "log",
      component: "trade_log",
      properties: { label: "Action journal", entries: { path: "/journal" } },
    },
  ],
};

/** The same surface as a message stream. Folds to the document above. */
export const HEALTH_GUARD_STREAM: A2uiMessage[] = [
  { version: "v0.9", createSurface: { surfaceId: "hf-guard", catalogId: "graphmini/1", root: "root" } },
  { version: "v0.9", updateComponents: { surfaceId: "hf-guard", components: HEALTH_GUARD_DOC.components } },
  { version: "v0.9", updateDataModel: { surfaceId: "hf-guard", path: "/", contents: dataModel } },
  { version: "v0.9", updateDataModel: { surfaceId: "hf-guard", path: "/healthFactor", contents: 1.46 } },
];

/** A document that names something the client does not hold — fallback proof. */
export const HOSTILE_DOC: A2uiDocument = {
  version: "v0.9",
  surfaceId: "hostile",
  root: "root",
  dataModel: { x: 1 },
  components: [
    { id: "root", component: "column", children: ["ok", "bad", "dangling"] },
    { id: "ok", component: "metric_card", properties: { label: "Renders fine", value: { path: "/x" } } },
    { id: "bad", component: "script_tag", properties: { src: "https://evil.example/x.js" } },
    { id: "missing-ref", component: "column", children: [] },
  ],
};
