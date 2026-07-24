/**
 * W12 — seed content. Fifteen mini apps spanning the full range:
 * analytics (readonly) → monitoring (monitor) → autonomous.
 *
 * A registry with three apps looks like a prototype. Fifteen spanning the
 * range looks like a platform. Numbers are realistic Arbitrum / Optimism /
 * Base DeFi figures — these appear in the demo video.
 *
 * Everything here is fixture data. No API keys, no network.
 */
import type {
  AgencyTier,
  Manifest,
  Network,
  SchemaFamily,
  Source,
} from "@/lib/contracts/manifest";
import type { JournalEntry } from "@/lib/contracts/policy";

/* ------------------------------------------------------------------ *
 * The rendered body of a mini app.
 *
 * TODO(integrator): this is a local stand-in for the A2UI document the
 * composer (W4) emits and the renderer (W5, `@/components/renderer`) draws.
 * It names the same catalog components (contracts/catalog.ts) so the swap is
 * mechanical: replace `<AppBody doc={...} />` with the real renderer and feed
 * it `manifest.ui` directly.
 * ------------------------------------------------------------------ */

export type Accent = "live" | "gain" | "loss" | "risk" | "spend" | "ink";

export type UiBlock =
  | {
      id: string;
      component: "metric_card";
      label: string;
      span?: number;
      data: { value: string; delta?: string; dir?: "up" | "down" | "flat"; sub?: string };
    }
  | {
      id: string;
      component: "leaderboard";
      label: string;
      span?: number;
      data: { unit: string; accentIndex?: number; rows: { label: string; value: number; note?: string }[] };
    }
  | {
      id: string;
      component: "bar_chart";
      label: string;
      span?: number;
      data: { unit: string; accentIndex?: number; rows: { label: string; value: number }[] };
    }
  | {
      id: string;
      component: "time_series";
      label: string;
      span?: number;
      data: { unit: string; accent?: Accent; points: number[]; xFirst: string; xLast: string };
    }
  | {
      id: string;
      component: "gauge";
      label: string;
      span?: number;
      data: { value: number; min: number; max: number; threshold: number; unit: string; status: Accent };
    }
  | {
      id: string;
      component: "progress_bar";
      label: string;
      span?: number;
      data: { value: number; target: number; unit: string; note?: string };
    }
  | {
      id: string;
      component: "comparison_grid";
      label: string;
      span?: number;
      data: { columns: string[]; rows: { label: string; cells: string[] }[] };
    }
  | {
      id: string;
      component: "data_table";
      label: string;
      span?: number;
      data: { columns: string[]; numeric: boolean[]; rows: string[][] };
    }
  | {
      id: string;
      component: "position_card";
      label: string;
      span?: number;
      data: { asset: string; rows: { k: string; v: string; accent?: Accent }[] };
    }
  | {
      id: string;
      component: "alert_banner";
      label: string;
      span?: number;
      data: { level: Accent; text: string };
    }
  | {
      id: string;
      component: "flow_diagram";
      label: string;
      span?: number;
      data: { unit: string; flows: { from: string; to: string; value: number }[] };
    }
  | {
      id: string;
      component: "distribution";
      label: string;
      span?: number;
      data: { unit: string; buckets: { label: string; count: number }[] };
    };

export interface UiDoc {
  spec: "a2ui/0.9.1";
  blocks: UiBlock[];
}

/* ------------------------------------------------------------------ */

export interface MiniAppStats {
  runs: number;
  forks: number;
  /** Total value this app has moved through its own wallet, lifetime. */
  valueTransactedUsd: number;
  /** Lifetime spend against the policy cap. */
  spentUsd: number;
  thumbsUp: number;
  thumbsDown: number;
  earnedUsd: number;
  sourcesQueried: number;
  sourcesHealthy: number;
  costPerRunUsd: number;
}

export interface Review {
  id: string;
  rater: string;
  score: "up" | "down";
  text: string;
  /** Weighted higher — a rater who actually ran the app. */
  ranIt: boolean;
  at: string;
}

export interface MiniApp {
  manifest: Manifest;
  stats: MiniAppStats;
  reviews: Review[];
  /** On my board, versus browsed in the registry. */
  mine: boolean;
  /** Subscribed to a stream right now. */
  running: boolean;
  lastRunAt: string;
  /** Per-app action journal. Backs the trade log (W8 owns the real one). */
  journal: JournalEntry[];
}

export interface LedgerLine extends JournalEntry {
  id: string;
  /** Mini app name this line belongs to. */
  app: string;
}

/* ------------------------------------------------------------------ *
 * Fixed clock. Deterministic across server and client render — no
 * hydration mismatch, and the receipt reads the same in every timezone.
 * ------------------------------------------------------------------ */
export const SEED_EPOCH = Date.parse("2026-07-26T09:41:00.000Z");
export const SEED_NOW = new Date(SEED_EPOCH).toISOString();

function ago(minutes: number): string {
  return new Date(SEED_EPOCH - minutes * 60_000).toISOString();
}
function daysAgo(days: number): string {
  return new Date(SEED_EPOCH - days * 86_400_000).toISOString();
}

const ROUTER_ARB = "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506";
const AAVE_POOL_ARB = "0x794a61358d6845594f94dc1db02a252b5b4814ad";
const ROUTER_OP = "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45";
const VAULT_ROUTER = "0x2e234dae75c793f67a35089c9d99245e1c58470b";

function src(
  subgraphId: string,
  schema: SchemaFamily,
  network: Network,
  healthy: boolean,
  label: string,
): Source {
  return {
    subgraphId,
    schema,
    network,
    healthCheckedAt: healthy ? ago(3) : null,
    healthy,
    label,
  };
}

interface SeedInput {
  name: string;
  title: string;
  intent: string;
  category: string;
  tags: string[];
  tier: AgencyTier;
  schemas: SchemaFamily[];
  networks: Network[];
  sources: Source[];
  stream?: { package: string; module: string } | null;
  blocks: UiBlock[];
  author: string;
  mine: boolean;
  running: boolean;
  stats: Partial<MiniAppStats> & { runs: number; forks: number };
  reviews?: Review[];
  journal?: JournalEntry[];
  policy?: {
    wallet: string;
    maxSpendUsd: number;
    maxPerTxUsd: number;
    allowlist: string[];
    expiresAt: string;
  };
  actions?: Manifest["agency"]["actions"];
  triggers?: Manifest["agency"]["triggers"];
  createdDaysAgo: number;
  priceUsd?: number;
  forkedFrom?: string;
}

function build(s: SeedInput): MiniApp {
  const ui: UiDoc = { spec: "a2ui/0.9.1", blocks: s.blocks };
  const manifest: Manifest = {
    spec: "graphmini/2",
    name: s.name,
    title: s.title,
    intent: s.intent,
    category: s.category,
    tags: s.tags,
    data: {
      schemas: s.schemas,
      networks: s.networks,
      sources: s.sources,
      queries: Object.fromEntries(
        s.schemas.map((schema, i) => [
          `q${i}`,
          `query($first:Int!){ ${schema.split("@")[0].replace(/-/g, "_")}(first:$first){ id totalValueLockedUSD } }`,
        ]),
      ),
      variables: { first: 25 },
      stream: s.stream ? { ...s.stream, filter: {} } : null,
      transport: s.tier === "readonly" ? "gateway" : "x402",
    },
    ui,
    agency: {
      tier: s.tier,
      triggers: s.triggers ?? [],
      actions: s.actions ?? {},
      policy: {
        wallet: s.policy?.wallet ?? null,
        maxSpendUsd: s.policy?.maxSpendUsd ?? 0,
        maxPerTxUsd: s.policy?.maxPerTxUsd ?? 0,
        allowlist: s.policy?.allowlist ?? [],
        expiresAt: s.policy?.expiresAt ?? null,
        requireConfirm: s.tier !== "autonomous",
        killSwitch: true,
        halted: false,
      },
    },
    identity: {
      ens: `${s.name}.graphminis.eth`,
      agenticId: {
        chain: "0g",
        contract: "0x9f2d8a1c4b6e7f0a3d5c8b9e1f2a4c6d8e0b3f57",
        tokenId: 100 + (s.name.length % 97),
      },
      manifestCid: `bafybeig${s.name.replace(/-/g, "").padEnd(12, "x").slice(0, 12)}q7m4`,
    },
    provenance: {
      model: "deepseek-chat-v3",
      compute: "0g-private-computer",
      attestationRef: `0g://att/${s.name}-7f31`,
      generatedAt: daysAgo(s.createdDaysAgo),
    },
    author: s.author,
    appVersion: "1.0.0",
    forkedFrom: s.forkedFrom ?? null,
    pricing: s.priceUsd ? { x402: { enabled: true, priceUsd: s.priceUsd } } : null,
    createdAt: daysAgo(s.createdDaysAgo),
    updatedAt: ago(s.running ? 2 : 90),
  };

  return {
    manifest,
    mine: s.mine,
    running: s.running,
    lastRunAt: s.running ? ago(1) : ago(340),
    journal: s.journal ?? [],
    reviews: s.reviews ?? [],
    stats: {
      runs: s.stats.runs,
      forks: s.stats.forks,
      valueTransactedUsd: s.stats.valueTransactedUsd ?? 0,
      spentUsd: s.stats.spentUsd ?? 0,
      thumbsUp: s.stats.thumbsUp ?? 0,
      thumbsDown: s.stats.thumbsDown ?? 0,
      earnedUsd: s.stats.earnedUsd ?? 0,
      sourcesQueried: s.stats.sourcesQueried ?? s.sources.length,
      sourcesHealthy: s.stats.sourcesHealthy ?? s.sources.filter((x) => x.healthy).length,
      costPerRunUsd: s.stats.costPerRunUsd ?? 0.01,
    },
  };
}

function j(
  minutes: number,
  kind: JournalEntry["kind"],
  message: string,
  extra?: Partial<JournalEntry>,
): JournalEntry {
  return { ts: ago(minutes), kind, message, ok: true, ...extra };
}

/* ================================================================== *
 * ANALYTICS — readonly. Cannot act. 1.5px chrome.
 * ================================================================== */

const dexVolumeArb = build({
  name: "dex-volume-arb",
  title: "Top DEXs by volume — Arbitrum, 7d",
  intent: "Show me the top DEXs by volume on Arbitrum this week.",
  category: "analytics",
  tags: ["dex", "volume", "arbitrum"],
  tier: "readonly",
  schemas: ["dex-amm@1.3.2"],
  networks: ["arbitrum-one"],
  sources: [
    src("5zvR82Q", "dex-amm@1.3.2", "arbitrum-one", true, "uniswap-v3-arbitrum"),
    src("8YtQmXe", "dex-amm@1.3.2", "arbitrum-one", true, "camelot-v3"),
    src("Ck2mQ8x", "dex-amm@1.3.2", "arbitrum-one", true, "balancer-v2-arbitrum"),
    src("H1vP7dz", "dex-amm@1.3.2", "arbitrum-one", false, "sushiswap-arbitrum"),
  ],
  author: "fabianferno.eth",
  mine: true,
  running: false,
  createdDaysAgo: 12,
  priceUsd: 0.02,
  stats: { runs: 1842, forks: 37, thumbsUp: 96, thumbsDown: 4, earnedUsd: 36.84, sourcesQueried: 31, sourcesHealthy: 27, costPerRunUsd: 0.012 },
  reviews: [
    { id: "r1", rater: "0xdegen.eth", score: "up", text: "Replaced three Dune tabs. Camelot numbers match the explorer.", ranIt: true, at: daysAgo(3) },
    { id: "r2", rater: "mara.eth", score: "up", text: "Wish it did Base too — forked it and it took one sentence.", ranIt: true, at: daysAgo(6) },
  ],
  blocks: [
    { id: "b1", component: "metric_card", label: "7d volume, all venues", data: { value: "$4.21B", delta: "+8.4%", dir: "up", sub: "vs previous 7d" } },
    { id: "b2", component: "metric_card", label: "Swaps, 7d", data: { value: "6,214,880", delta: "+3.1%", dir: "up", sub: "27 of 31 deployments live" } },
    { id: "b3", component: "metric_card", label: "Median swap size", data: { value: "$688", delta: "-2.0%", dir: "down", sub: "unweighted" } },
    {
      id: "b4",
      component: "leaderboard",
      label: "Volume by venue, 7d",
      span: 2,
      data: {
        unit: "USD",
        accentIndex: 0,
        rows: [
          { label: "Uniswap v3", value: 2810000000, note: "0.05% + 0.3% pools" },
          { label: "Camelot v3", value: 486000000 },
          { label: "Balancer v2", value: 312000000 },
          { label: "Curve", value: 274000000 },
          { label: "Ramses", value: 188000000 },
          { label: "TraderJoe v2.1", value: 91400000 },
          { label: "Sushi v3", value: 48200000 },
        ],
      },
    },
    {
      id: "b5",
      component: "time_series",
      label: "Daily volume",
      data: { unit: "USD", accent: "live", xFirst: "Jul 19", xLast: "Jul 26", points: [512, 604, 588, 641, 703, 590, 572] },
    },
  ],
});

const tvlCrosschain = build({
  name: "tvl-crosschain",
  title: "Cross-protocol TVL — Arbitrum vs Optimism vs Base",
  intent: "Compare lending and DEX TVL across Arbitrum, Optimism and Base.",
  category: "analytics",
  tags: ["tvl", "multichain", "composition"],
  tier: "readonly",
  schemas: ["lending-cdp@3.1.0", "dex-amm@1.3.2", "yield-aggregator@1.3.1"],
  networks: ["arbitrum-one", "optimism", "base"],
  sources: [
    src("5zvR82Q", "dex-amm@1.3.2", "arbitrum-one", true, "uniswap-v3-arbitrum"),
    src("Jd8k2Lp", "lending-cdp@3.1.0", "arbitrum-one", true, "aave-v3-arbitrum"),
    src("Qm4x9Tz", "lending-cdp@3.1.0", "optimism", true, "aave-v3-optimism"),
    src("Rr7n1Wc", "dex-amm@1.3.2", "base", true, "aerodrome-base"),
    src("Zx3v6Kb", "yield-aggregator@1.3.1", "optimism", false, "beefy-optimism"),
  ],
  author: "fabianferno.eth",
  mine: true,
  running: false,
  createdDaysAgo: 9,
  priceUsd: 0.05,
  stats: { runs: 934, forks: 21, thumbsUp: 58, thumbsDown: 2, earnedUsd: 46.7, sourcesQueried: 44, sourcesHealthy: 38, costPerRunUsd: 0.031 },
  reviews: [
    { id: "r3", rater: "pgov.eth", score: "up", text: "Three schema families in one query shape. This is the composability argument.", ranIt: true, at: daysAgo(2) },
  ],
  blocks: [
    {
      id: "b1",
      component: "comparison_grid",
      label: "TVL by chain and family",
      span: 3,
      data: {
        columns: ["Arbitrum", "Optimism", "Base"],
        rows: [
          { label: "Lending / CDP", cells: ["$1.64B", "$412M", "$736M"] },
          { label: "DEX AMM", cells: ["$986M", "$228M", "$1.12B"] },
          { label: "Yield aggregator", cells: ["$204M", "$71M", "$93M"] },
          { label: "Perp futures", cells: ["$518M", "$44M", "$62M"] },
          { label: "Total", cells: ["$3.35B", "$755M", "$2.01B"] },
        ],
      },
    },
    {
      id: "b2",
      component: "bar_chart",
      label: "Total TVL by chain",
      span: 2,
      data: { unit: "USD", accentIndex: 0, rows: [{ label: "Arbitrum", value: 3350000000 }, { label: "Base", value: 2010000000 }, { label: "Optimism", value: 755000000 }] },
    },
    { id: "b3", component: "metric_card", label: "Deployments merged", data: { value: "38 / 44", sub: "6 skipped as unhealthy" } },
  ],
});

const bridgeFlows = build({
  name: "bridge-flows",
  title: "Bridge flows into Arbitrum, 24h",
  intent: "Where is bridged value coming from into Arbitrum in the last day?",
  category: "analytics",
  tags: ["bridge", "flows", "arbitrum"],
  tier: "readonly",
  schemas: ["bridge@1.2.0"],
  networks: ["arbitrum-one", "mainnet"],
  sources: [
    src("Bg9k4Vn", "bridge@1.2.0", "arbitrum-one", true, "across-v3"),
    src("Cf2m8Xq", "bridge@1.2.0", "arbitrum-one", true, "stargate-v2"),
    src("Dh5p3Yr", "bridge@1.2.0", "mainnet", true, "hop-protocol"),
  ],
  author: "0xdegen.eth",
  mine: true,
  running: false,
  createdDaysAgo: 20,
  priceUsd: 0.02,
  stats: { runs: 611, forks: 14, thumbsUp: 41, thumbsDown: 3, earnedUsd: 12.22, sourcesQueried: 18, sourcesHealthy: 16 },
  blocks: [
    { id: "b1", component: "metric_card", label: "Net inflow, 24h", data: { value: "$41.7M", delta: "+22.6%", dir: "up", sub: "in minus out" } },
    { id: "b2", component: "metric_card", label: "Transfers", data: { value: "18,442", delta: "+6.9%", dir: "up" } },
    { id: "b3", component: "metric_card", label: "Median transfer", data: { value: "$1,204", delta: "-4.4%", dir: "down" } },
    {
      id: "b4",
      component: "flow_diagram",
      label: "Source chain to Arbitrum",
      span: 3,
      data: {
        unit: "USD",
        flows: [
          { from: "Ethereum", to: "Arbitrum", value: 24800000 },
          { from: "Base", to: "Arbitrum", value: 8600000 },
          { from: "Optimism", to: "Arbitrum", value: 5100000 },
          { from: "Polygon", to: "Arbitrum", value: 2200000 },
          { from: "BNB Chain", to: "Arbitrum", value: 1000000 },
        ],
      },
    },
  ],
});

const perpOiBoard = build({
  name: "perp-oi-board",
  title: "Perp open interest by market — Arbitrum",
  intent: "Show open interest and funding by perp market on Arbitrum.",
  category: "analytics",
  tags: ["perps", "open-interest", "arbitrum"],
  tier: "readonly",
  schemas: ["perp-futures@1.3.4"],
  networks: ["arbitrum-one"],
  sources: [
    src("Pk8w2Qe", "perp-futures@1.3.4", "arbitrum-one", true, "gmx-v2"),
    src("Lm3r7Uy", "perp-futures@1.3.4", "arbitrum-one", true, "vertex"),
    src("Nn6t4Ip", "perp-futures@1.3.4", "arbitrum-one", false, "mux-protocol"),
  ],
  author: "vega.eth",
  mine: false,
  running: false,
  createdDaysAgo: 16,
  stats: { runs: 388, forks: 9, thumbsUp: 27, thumbsDown: 1 },
  blocks: [
    { id: "b1", component: "metric_card", label: "Total open interest", data: { value: "$612.4M", delta: "+4.8%", dir: "up", sub: "long + short" } },
    { id: "b2", component: "metric_card", label: "Long / short skew", data: { value: "58 / 42", sub: "notional weighted" } },
    {
      id: "b3",
      component: "bar_chart",
      label: "Open interest by market",
      span: 2,
      data: {
        unit: "USD",
        accentIndex: 0,
        rows: [
          { label: "ETH-USD", value: 268000000 },
          { label: "BTC-USD", value: 214000000 },
          { label: "SOL-USD", value: 58400000 },
          { label: "ARB-USD", value: 41200000 },
          { label: "LINK-USD", value: 18900000 },
        ],
      },
    },
    {
      id: "b4",
      component: "data_table",
      label: "Funding, 8h annualised",
      span: 3,
      data: {
        columns: ["Market", "Venue", "Funding APR", "OI", "24h vol"],
        numeric: [false, false, true, true, true],
        rows: [
          ["ETH-USD", "GMX v2", "+11.4%", "$268.0M", "$412M"],
          ["BTC-USD", "GMX v2", "+8.9%", "$214.0M", "$388M"],
          ["SOL-USD", "Vertex", "+18.2%", "$58.4M", "$96M"],
          ["ARB-USD", "Vertex", "-3.1%", "$41.2M", "$44M"],
          ["LINK-USD", "GMX v2", "+5.6%", "$18.9M", "$21M"],
        ],
      },
    },
  ],
});

const nftVolumeOp = build({
  name: "nft-volume-op",
  title: "NFT marketplace volume — Optimism, 30d",
  intent: "How much NFT volume is actually happening on Optimism?",
  category: "analytics",
  tags: ["nft", "optimism", "marketplace"],
  tier: "readonly",
  schemas: ["nft-marketplace@2.1.0"],
  networks: ["optimism"],
  sources: [
    src("Nf4d9Ke", "nft-marketplace@2.1.0", "optimism", true, "opensea-seaport-op"),
    src("Ng7h2Lw", "nft-marketplace@2.1.0", "optimism", true, "quix"),
  ],
  author: "mara.eth",
  mine: false,
  running: false,
  createdDaysAgo: 26,
  stats: { runs: 176, forks: 3, thumbsUp: 11, thumbsDown: 4 },
  blocks: [
    { id: "b1", component: "metric_card", label: "30d volume", data: { value: "$3.84M", delta: "-18.2%", dir: "down", sub: "all collections" } },
    { id: "b2", component: "metric_card", label: "Unique buyers", data: { value: "4,118", delta: "-9.7%", dir: "down" } },
    {
      id: "b3",
      component: "time_series",
      label: "Daily volume, 30d",
      span: 2,
      data: { unit: "USD", accent: "loss", xFirst: "Jun 26", xLast: "Jul 26", points: [188, 204, 176, 152, 149, 161, 133, 128, 118, 141, 109, 96, 104, 88] },
    },
  ],
});

const yieldLeaderboard = build({
  name: "yield-leaderboard",
  title: "Best stablecoin vaults by net APY",
  intent: "Rank stablecoin vaults by net APY across Arbitrum and Optimism.",
  category: "analytics",
  tags: ["yield", "stablecoins", "apy"],
  tier: "readonly",
  schemas: ["yield-aggregator@1.3.1", "lending-cdp@3.1.0"],
  networks: ["arbitrum-one", "optimism"],
  sources: [
    src("Yv2c8Rt", "yield-aggregator@1.3.1", "arbitrum-one", true, "yearn-v3-arbitrum"),
    src("Yw5f1Sd", "yield-aggregator@1.3.1", "optimism", true, "beefy-optimism"),
    src("Jd8k2Lp", "lending-cdp@3.1.0", "arbitrum-one", true, "aave-v3-arbitrum"),
  ],
  author: "fabianferno.eth",
  mine: true,
  running: false,
  createdDaysAgo: 7,
  priceUsd: 0.03,
  stats: { runs: 722, forks: 44, thumbsUp: 63, thumbsDown: 2, earnedUsd: 21.66, sourcesQueried: 22, sourcesHealthy: 19 },
  reviews: [
    { id: "r4", rater: "kaia.eth", score: "up", text: "Net of fees, which nothing else bothers to do.", ranIt: true, at: daysAgo(1) },
    { id: "r5", rater: "anon", score: "down", text: "Ranks by 7d APY, would prefer 30d.", ranIt: false, at: daysAgo(4) },
  ],
  blocks: [
    {
      id: "b1",
      component: "leaderboard",
      label: "Net APY, 7d trailing",
      span: 2,
      data: {
        unit: "%",
        accentIndex: 0,
        rows: [
          { label: "Yearn v3 — USDC.e", value: 11.42, note: "Arbitrum" },
          { label: "Beefy — USDC/USDT", value: 9.88, note: "Optimism" },
          { label: "Aave v3 — USDC", value: 7.16, note: "Arbitrum" },
          { label: "Yearn v3 — DAI", value: 6.94, note: "Arbitrum" },
          { label: "Aave v3 — USDT", value: 5.31, note: "Optimism" },
        ],
      },
    },
    { id: "b2", component: "metric_card", label: "Vaults compared", data: { value: "19", sub: "3 skipped, no live deployment" } },
    { id: "b3", component: "metric_card", label: "Spread, best to worst", data: { value: "6.11pp", delta: "+0.4pp", dir: "up", sub: "widening" } },
  ],
});

/* ================================================================== *
 * MONITORING — watches and alerts, cannot spend. 2.5px chrome.
 * ================================================================== */

const healthFactorWatch = build({
  name: "health-factor-watch",
  title: "Health factor watch — my lending positions",
  intent: "Tell me when any of my lending positions drops below 1.4 health factor.",
  category: "risk",
  tags: ["lending", "liquidation", "alerts"],
  tier: "monitor",
  schemas: ["lending-cdp@3.1.0"],
  networks: ["arbitrum-one", "optimism"],
  sources: [
    src("Jd8k2Lp", "lending-cdp@3.1.0", "arbitrum-one", true, "aave-v3-arbitrum"),
    src("Qm4x9Tz", "lending-cdp@3.1.0", "optimism", true, "aave-v3-optimism"),
    src("Rt9y3Mn", "lending-cdp@3.1.0", "arbitrum-one", true, "radiant-v2"),
  ],
  stream: { package: "aave-v3-arbitrum@v0.4.1", module: "map_reserve_updates" },
  triggers: [{ on: "stream", when: "healthFactor < 1.4", run: "notify" }],
  actions: { notify: { kind: "notify", params: { channel: "board" }, label: "Alert me" } },
  author: "fabianferno.eth",
  mine: true,
  running: true,
  createdDaysAgo: 11,
  priceUsd: 0.05,
  stats: { runs: 5120, forks: 62, thumbsUp: 128, thumbsDown: 5, earnedUsd: 256, sourcesQueried: 12, sourcesHealthy: 11, costPerRunUsd: 0.008 },
  reviews: [
    { id: "r6", rater: "0xdegen.eth", score: "up", text: "Fired 40 seconds after the ETH wick. A poll would have missed it.", ranIt: true, at: daysAgo(5) },
    { id: "r7", rater: "vega.eth", score: "up", text: "Forked to add Radiant. Fresh wallet, no inherited authority — good.", ranIt: true, at: daysAgo(8) },
  ],
  journal: [
    j(2, "STREAM", "block 291,447,201 — reserve update, 3 positions re-evaluated"),
    j(11, "QUERY", "lending-cdp@3.1.0 × 3 deployments — 11 of 12 live · $0.008"),
    j(44, "TRIGGER", "healthFactor 1.52 → above 1.40, no alert"),
  ],
  blocks: [
    { id: "b1", component: "alert_banner", label: "Status", span: 3, data: { level: "risk", text: "ETH/USDC on Aave v3 Arbitrum is 0.12 above the alert threshold." } },
    { id: "b2", component: "gauge", label: "Aave v3 Arbitrum — health factor", data: { value: 1.52, min: 1, max: 3, threshold: 1.4, unit: "", status: "risk" } },
    { id: "b3", component: "gauge", label: "Aave v3 Optimism — health factor", data: { value: 2.34, min: 1, max: 3, threshold: 1.4, unit: "", status: "gain" } },
    { id: "b4", component: "gauge", label: "Radiant v2 — health factor", data: { value: 1.88, min: 1, max: 3, threshold: 1.4, unit: "", status: "gain" } },
    {
      id: "b5",
      component: "data_table",
      label: "Positions",
      span: 3,
      data: {
        columns: ["Market", "Chain", "Collateral", "Debt", "HF", "Liq. price"],
        numeric: [false, false, true, true, true, true],
        rows: [
          ["Aave v3 ETH/USDC", "Arbitrum", "$84,200", "$46,100", "1.52", "$2,118"],
          ["Aave v3 wstETH/USDC", "Optimism", "$31,900", "$11,400", "2.34", "$1,404"],
          ["Radiant v2 ARB/USDT", "Arbitrum", "$12,600", "$5,200", "1.88", "$0.41"],
        ],
      },
    },
  ],
});

const whaleAlertArb = build({
  name: "whale-alert-arb",
  title: "Whale swaps over $250k — Arbitrum",
  intent: "Alert me on any single swap over $250,000 on Arbitrum DEXs.",
  category: "flow",
  tags: ["whales", "dex", "alerts"],
  tier: "monitor",
  schemas: ["dex-amm@1.3.2", "dex-aggregator@1.0.2"],
  networks: ["arbitrum-one"],
  sources: [
    src("5zvR82Q", "dex-amm@1.3.2", "arbitrum-one", true, "uniswap-v3-arbitrum"),
    src("8YtQmXe", "dex-amm@1.3.2", "arbitrum-one", true, "camelot-v3"),
    src("Ag1s5Dv", "dex-aggregator@1.0.2", "arbitrum-one", true, "1inch-arbitrum"),
  ],
  stream: { package: "uniswap-v3-arbitrum@v0.6.0", module: "map_swaps" },
  triggers: [{ on: "stream", when: "amountUsd > 250000", run: "notify" }],
  actions: { notify: { kind: "notify", params: {}, label: "Alert me" } },
  author: "0xdegen.eth",
  mine: true,
  running: true,
  createdDaysAgo: 5,
  priceUsd: 0.02,
  stats: { runs: 3011, forks: 28, thumbsUp: 74, thumbsDown: 6, earnedUsd: 60.22, sourcesQueried: 14, sourcesHealthy: 13, costPerRunUsd: 0.009 },
  journal: [j(4, "STREAM", "block 291,447,088 — 1 swap over threshold"), j(19, "TRIGGER", "$412,800 WETH → USDC on Uniswap v3, alert sent")],
  blocks: [
    { id: "b1", component: "alert_banner", label: "Latest", span: 3, data: { level: "live", text: "$412,800 WETH → USDC on Uniswap v3, 4 minutes ago." } },
    { id: "b2", component: "metric_card", label: "Alerts, 24h", data: { value: "23", delta: "+9", dir: "up", sub: "over $250k" } },
    { id: "b3", component: "metric_card", label: "Largest, 24h", data: { value: "$2.14M", sub: "wstETH → USDC" } },
    {
      id: "b4",
      component: "data_table",
      label: "Recent whale swaps",
      span: 3,
      data: {
        columns: ["Time", "Pair", "Venue", "Size", "Wallet"],
        numeric: [false, false, false, true, false],
        rows: [
          ["09:37:12", "WETH → USDC", "Uniswap v3", "$412,800", "0x7f3a…9c41"],
          ["09:21:48", "USDC → ARB", "Camelot v3", "$318,200", "0x1d0e…44b7"],
          ["08:58:03", "wstETH → USDC", "1inch", "$2,140,000", "0xa2c5…0e19"],
          ["08:41:29", "USDC → WETH", "Uniswap v3", "$266,400", "0x93bb…7712"],
        ],
      },
    },
  ],
});

const fundingDivergence = build({
  name: "funding-divergence",
  title: "Funding rate divergence — perp venues",
  intent: "Tell me when funding on the same market diverges by more than 15% APR across venues.",
  category: "risk",
  tags: ["perps", "funding", "arbitrage"],
  tier: "monitor",
  schemas: ["perp-futures@1.3.4"],
  networks: ["arbitrum-one", "optimism"],
  sources: [
    src("Pk8w2Qe", "perp-futures@1.3.4", "arbitrum-one", true, "gmx-v2"),
    src("Lm3r7Uy", "perp-futures@1.3.4", "arbitrum-one", true, "vertex"),
    src("Op4z8Ha", "perp-futures@1.3.4", "optimism", true, "synthetix-perps-v3"),
  ],
  stream: { package: "gmx-v2-arbitrum@v0.3.2", module: "map_funding_updates" },
  triggers: [{ on: "stream", when: "abs(fundingA - fundingB) > 0.15", run: "notify" }],
  actions: { notify: { kind: "notify", params: {}, label: "Alert me" } },
  author: "vega.eth",
  mine: true,
  running: true,
  createdDaysAgo: 14,
  priceUsd: 0.08,
  stats: { runs: 1420, forks: 19, thumbsUp: 52, thumbsDown: 3, earnedUsd: 113.6, sourcesQueried: 9, sourcesHealthy: 8 },
  blocks: [
    { id: "b1", component: "alert_banner", label: "Divergence", span: 3, data: { level: "risk", text: "SOL-USD funding is 18.2% on Vertex against 4.4% on Synthetix — 13.8pp apart." } },
    {
      id: "b2",
      component: "comparison_grid",
      label: "Funding APR by venue",
      span: 3,
      data: {
        columns: ["GMX v2", "Vertex", "Synthetix v3"],
        rows: [
          { label: "ETH-USD", cells: ["+11.4%", "+12.9%", "+9.8%"] },
          { label: "BTC-USD", cells: ["+8.9%", "+9.4%", "+7.1%"] },
          { label: "SOL-USD", cells: ["+16.0%", "+18.2%", "+4.4%"] },
          { label: "ARB-USD", cells: ["-3.1%", "-2.4%", "—"] },
        ],
      },
    },
  ],
});

const staleOracleWatch = build({
  name: "stale-oracle-watch",
  title: "Stale price feed watch — Optimism lending",
  intent: "Warn me if a lending market on Optimism is pricing off a feed older than 20 minutes.",
  category: "risk",
  tags: ["oracles", "lending", "optimism"],
  tier: "monitor",
  schemas: ["lending-cdp@3.1.0", "generic@3.0.0"],
  networks: ["optimism"],
  sources: [
    src("Qm4x9Tz", "lending-cdp@3.1.0", "optimism", true, "aave-v3-optimism"),
    src("Gg2v6Bn", "generic@3.0.0", "optimism", true, "chainlink-feeds-op"),
    src("Hh8j1Cx", "lending-cdp@3.1.0", "optimism", false, "exactly-protocol"),
  ],
  stream: { package: "chainlink-optimism@v0.2.4", module: "map_answer_updated" },
  triggers: [{ on: "stream", when: "now - updatedAt > 1200", run: "notify" }],
  actions: { notify: { kind: "notify", params: {}, label: "Alert me" } },
  author: "kaia.eth",
  mine: true,
  running: true,
  createdDaysAgo: 18,
  stats: { runs: 806, forks: 7, thumbsUp: 24, thumbsDown: 1 },
  blocks: [
    { id: "b1", component: "alert_banner", label: "Status", span: 3, data: { level: "gain", text: "All 14 watched feeds updated inside the last 20 minutes." } },
    { id: "b2", component: "progress_bar", label: "Oldest feed age", span: 1, data: { value: 11, target: 20, unit: "min", note: "OP/USD" } },
    { id: "b3", component: "metric_card", label: "Feeds watched", data: { value: "14", sub: "1 deployment skipped, dead" } },
    { id: "b4", component: "metric_card", label: "Warnings, 7d", data: { value: "2", delta: "-3", dir: "down" } },
  ],
});

const bridgeOutflowWatch = build({
  name: "bridge-outflow-watch",
  title: "Bridge outflow spike watch",
  intent: "Alert me when bridge outflows from a chain spike above three times the hourly median.",
  category: "risk",
  tags: ["bridge", "anomaly", "alerts"],
  tier: "monitor",
  schemas: ["bridge@1.2.0"],
  networks: ["arbitrum-one", "optimism", "base"],
  sources: [
    src("Bg9k4Vn", "bridge@1.2.0", "arbitrum-one", true, "across-v3"),
    src("Cf2m8Xq", "bridge@1.2.0", "arbitrum-one", true, "stargate-v2"),
    src("Ii3k7Dz", "bridge@1.2.0", "base", true, "base-native-bridge"),
  ],
  stream: { package: "across-v3@v0.5.0", module: "map_deposits" },
  triggers: [{ on: "stream", when: "hourlyOutflow > 3 * median", run: "notify" }],
  actions: { notify: { kind: "notify", params: {}, label: "Alert me" } },
  author: "mara.eth",
  mine: false,
  running: false,
  createdDaysAgo: 22,
  stats: { runs: 402, forks: 11, thumbsUp: 18, thumbsDown: 2 },
  blocks: [
    { id: "b1", component: "alert_banner", label: "Status", span: 3, data: { level: "gain", text: "No chain above 3× median outflow in the last 6 hours." } },
    {
      id: "b2",
      component: "time_series",
      label: "Hourly outflow — Arbitrum",
      span: 2,
      data: { unit: "USD", accent: "live", xFirst: "03:00", xLast: "09:00", points: [1.2, 1.4, 1.1, 2.2, 1.8, 1.3, 1.6] },
    },
    { id: "b3", component: "metric_card", label: "Current multiple", data: { value: "1.14×", sub: "of hourly median" } },
  ],
});

/* ================================================================== *
 * AUTONOMOUS — holds a wallet, can spend. 5px chrome + policy strip.
 * ================================================================== */

const aaveGuard = build({
  name: "aave-guard",
  title: "Aave position guard — Arbitrum",
  intent:
    "Watch my Aave position on Arbitrum. If health factor goes under 1.4, sell enough ETH to bring it back to 1.8. Show me what you're doing.",
  category: "risk",
  tags: ["aave", "liquidation", "autonomous", "arbitrum"],
  tier: "autonomous",
  schemas: ["lending-cdp@3.1.0", "dex-amm@1.3.2"],
  networks: ["arbitrum-one"],
  sources: [
    src("Jd8k2Lp", "lending-cdp@3.1.0", "arbitrum-one", true, "aave-v3-arbitrum"),
    src("5zvR82Q", "dex-amm@1.3.2", "arbitrum-one", true, "uniswap-v3-arbitrum"),
    src("8YtQmXe", "dex-amm@1.3.2", "arbitrum-one", true, "camelot-v3"),
  ],
  stream: { package: "aave-v3-arbitrum@v0.4.1", module: "map_reserve_updates" },
  triggers: [{ on: "stream", when: "healthFactor < 1.4", run: "rebalance" }],
  actions: {
    rebalance: {
      kind: "swap",
      target: ROUTER_ARB,
      params: { targetHealthFactor: 1.8, tokenIn: "WETH", tokenOut: "USDC" },
      label: "Rebalance to 1.8",
    },
  },
  policy: {
    wallet: "0x4c2f9a71b3d05e8c6a1f7b2d9e30c48a5f61d7b2",
    maxSpendUsd: 500,
    maxPerTxUsd: 50,
    allowlist: [ROUTER_ARB, AAVE_POOL_ARB],
    expiresAt: "2026-08-25T00:00:00.000Z",
  },
  author: "fabianferno.eth",
  mine: true,
  running: true,
  createdDaysAgo: 3,
  priceUsd: 0.05,
  stats: {
    runs: 1204,
    forks: 88,
    valueTransactedUsd: 3184.5,
    spentUsd: 142.8,
    thumbsUp: 141,
    thumbsDown: 3,
    earnedUsd: 60.2,
    sourcesQueried: 12,
    sourcesHealthy: 11,
    costPerRunUsd: 0.014,
  },
  reviews: [
    { id: "r8", rater: "vega.eth", score: "up", text: "Caught a 1.38 at 04:12 and unwound $48 of it. I was asleep.", ranIt: true, at: daysAgo(1) },
    { id: "r9", rater: "kaia.eth", score: "up", text: "Policy strip is always on screen. I can see the cap without digging.", ranIt: true, at: daysAgo(2) },
    { id: "r10", rater: "anon", score: "down", text: "Would like a confirm step even in autonomous mode.", ranIt: false, at: daysAgo(3) },
  ],
  journal: [
    j(1, "STREAM", "block 291,447,214 — reserve update, HF 1.52"),
    j(6, "QUERY", "lending-cdp@3.1.0 + dex-amm@1.3.2 — 11 of 12 live, 340ms · $0.014"),
    j(38, "POLICY", "proposed swap $48.20 — allowlisted, under $50 per-tx cap, allowed"),
    j(38, "ACTION", "swap 0.0184 WETH → 48.20 USDC via Uniswap v3", { spentUsd: 48.2, txHash: "0x9a41f0c7d2b85e13a06f7c9b4d2e1a83f5602c7b91d4e8a30f6b2c5d7e9a10f34" }),
    j(39, "TRIGGER", "health factor 1.38 → 1.81, target met"),
    j(212, "POLICY", "proposed swap $61.40 — over $50 per-tx cap, rejected", { ok: false }),
  ],
  blocks: [
    { id: "b1", component: "alert_banner", label: "Status", span: 3, data: { level: "gain", text: "Health factor 1.52, above the 1.40 trigger. Last rebalance 38 minutes ago." } },
    { id: "b2", component: "gauge", label: "Health factor", data: { value: 1.52, min: 1, max: 3, threshold: 1.4, unit: "", status: "risk" } },
    {
      id: "b3",
      component: "position_card",
      label: "Aave v3 — Arbitrum",
      data: {
        asset: "ETH / USDC",
        rows: [
          { k: "Collateral", v: "13.84 WETH · $84,200" },
          { k: "Debt", v: "46,100 USDC" },
          { k: "Liquidation price", v: "$2,118", accent: "risk" },
          { k: "Net APY", v: "-1.84%", accent: "loss" },
        ],
      },
    },
    { id: "b4", component: "progress_bar", label: "Spent against cap", data: { value: 142.8, target: 500, unit: "USD", note: "$50 per transaction" } },
    {
      id: "b5",
      component: "time_series",
      label: "Health factor, 24h",
      span: 3,
      data: { unit: "", accent: "risk", xFirst: "09:41 yest", xLast: "09:41", points: [1.74, 1.68, 1.61, 1.55, 1.47, 1.38, 1.81, 1.77, 1.69, 1.58, 1.52] },
    },
  ],
});

const copyTraderArb = build({
  name: "copy-trader-arb",
  title: "Copy trader — mirror 0x7f3a…9c41",
  intent: "Mirror this wallet's Arbitrum swaps, maximum $50 per trade.",
  category: "trading",
  tags: ["copy-trading", "dex", "autonomous"],
  tier: "autonomous",
  schemas: ["dex-amm@1.3.2", "dex-aggregator@1.0.2"],
  networks: ["arbitrum-one"],
  sources: [
    src("5zvR82Q", "dex-amm@1.3.2", "arbitrum-one", true, "uniswap-v3-arbitrum"),
    src("Ag1s5Dv", "dex-aggregator@1.0.2", "arbitrum-one", true, "1inch-arbitrum"),
  ],
  stream: { package: "uniswap-v3-arbitrum@v0.6.0", module: "map_swaps" },
  triggers: [{ on: "stream", when: "sender == 0x7f3a…9c41", run: "mirror" }],
  actions: { mirror: { kind: "swap", target: ROUTER_ARB, params: { maxUsd: 50, slippageBps: 50 }, label: "Mirror trade" } },
  policy: {
    wallet: "0x8e13c7d2a604f9b15c8e2a7d0b4f36c19e5a2d80",
    maxSpendUsd: 750,
    maxPerTxUsd: 50,
    allowlist: [ROUTER_ARB],
    expiresAt: "2026-08-10T00:00:00.000Z",
  },
  author: "0xdegen.eth",
  mine: true,
  running: true,
  createdDaysAgo: 6,
  priceUsd: 0.1,
  stats: { runs: 942, forks: 51, valueTransactedUsd: 6420.0, spentUsd: 388.4, thumbsUp: 87, thumbsDown: 11, earnedUsd: 94.2, sourcesQueried: 8, sourcesHealthy: 8, costPerRunUsd: 0.011 },
  reviews: [
    { id: "r11", rater: "fabianferno.eth", score: "up", text: "Mirrors inside two blocks. Slippage guard has never fired badly.", ranIt: true, at: daysAgo(2) },
    { id: "r12", rater: "anon", score: "down", text: "Copies the exits too late for my taste.", ranIt: true, at: daysAgo(5) },
  ],
  journal: [
    j(3, "STREAM", "block 291,447,190 — target wallet swapped"),
    j(3, "POLICY", "proposed swap $50.00 — at per-tx cap, allowed"),
    j(3, "ACTION", "swap 50.00 USDC → 0.0191 WETH via Uniswap v3", { spentUsd: 50, txHash: "0x4b71e0a9c3d5f28671b0e4a7c92d38f0b5e6172a4c8d09f3b1e7a05c2d64f938" }),
    j(74, "ACTION", "swap 50.00 USDC → 118.4 ARB via 1inch", { spentUsd: 50, txHash: "0xc38a5d71e024b9f6a3c17e08d5b2f491c07a6d38e2b915f4a07c3d61e8b02f57" }),
    j(160, "POLICY", "proposed swap $50.00 — lifetime cap $750 would be exceeded, rejected", { ok: false }),
  ],
  blocks: [
    { id: "b1", component: "alert_banner", label: "Status", span: 3, data: { level: "live", text: "Mirroring 0x7f3a…9c41. Last mirrored trade 3 minutes ago." } },
    { id: "b2", component: "metric_card", label: "Trades mirrored, 7d", data: { value: "48", delta: "+11", dir: "up" } },
    { id: "b3", component: "metric_card", label: "Realised PnL, 7d", data: { value: "+$214.60", delta: "+4.2%", dir: "up" } },
    { id: "b4", component: "progress_bar", label: "Spent against cap", data: { value: 388.4, target: 750, unit: "USD", note: "$50 per transaction" } },
    {
      id: "b5",
      component: "data_table",
      label: "Mirrored trades",
      span: 3,
      data: {
        columns: ["Time", "Trade", "Venue", "Size", "PnL"],
        numeric: [false, false, false, true, true],
        rows: [
          ["09:38:04", "USDC → WETH", "Uniswap v3", "$50.00", "+$1.84"],
          ["08:27:11", "USDC → ARB", "1inch", "$50.00", "-$0.62"],
          ["06:59:47", "WETH → USDC", "Uniswap v3", "$50.00", "+$3.11"],
          ["05:12:20", "USDC → GMX", "1inch", "$50.00", "+$0.94"],
        ],
      },
    },
  ],
});

const yieldRotator = build({
  name: "yield-rotator",
  title: "Yield rotator — stables, weekly",
  intent: "Move my stablecoins to whichever vault has the best net APY, at most once a week.",
  category: "yield",
  tags: ["yield", "rotation", "autonomous"],
  tier: "autonomous",
  schemas: ["yield-aggregator@1.3.1", "lending-cdp@3.1.0", "dex-amm@1.3.2"],
  networks: ["arbitrum-one", "optimism"],
  sources: [
    src("Yv2c8Rt", "yield-aggregator@1.3.1", "arbitrum-one", true, "yearn-v3-arbitrum"),
    src("Yw5f1Sd", "yield-aggregator@1.3.1", "optimism", true, "beefy-optimism"),
    src("Jd8k2Lp", "lending-cdp@3.1.0", "arbitrum-one", true, "aave-v3-arbitrum"),
    src("Zx3v6Kb", "yield-aggregator@1.3.1", "optimism", false, "sonne-finance"),
  ],
  stream: { package: "erc4626-vaults@v0.2.0", module: "map_vault_events" },
  triggers: [{ on: "interval", when: null, run: "rotate", intervalSec: 604800 }],
  actions: { rotate: { kind: "supply", target: VAULT_ROUTER, params: { minImprovementBps: 80 }, label: "Rotate" } },
  policy: {
    wallet: "0x2a71b0c85d3e6f19a47c02b8e5d1f36c94b7e2a0",
    maxSpendUsd: 1200,
    maxPerTxUsd: 400,
    allowlist: [VAULT_ROUTER, ROUTER_OP],
    expiresAt: "2026-09-01T00:00:00.000Z",
  },
  author: "kaia.eth",
  mine: true,
  running: true,
  createdDaysAgo: 15,
  priceUsd: 0.15,
  stats: { runs: 288, forks: 34, valueTransactedUsd: 24800, spentUsd: 812.0, thumbsUp: 61, thumbsDown: 4, earnedUsd: 43.2, sourcesQueried: 22, sourcesHealthy: 19 },
  reviews: [{ id: "r13", rater: "mara.eth", score: "up", text: "Rotated me out of Sonne before the deployment went dark. Health checks earn their keep.", ranIt: true, at: daysAgo(4) }],
  journal: [
    j(9, "QUERY", "yield-aggregator@1.3.1 × 2 chains — 19 of 22 live · $0.022"),
    j(1440, "POLICY", "proposed supply $400.00 — allowlisted, under caps, allowed"),
    j(1440, "ACTION", "withdraw 400.00 USDC from Aave v3, supply to Yearn v3 USDC.e", { spentUsd: 400, txHash: "0x71c4a08e5b2d93f60a1c8e47b0d25f39a6c130e8b4d72f951a0c6e38b7d24f01" }),
  ],
  blocks: [
    { id: "b1", component: "alert_banner", label: "Status", span: 3, data: { level: "gain", text: "Currently in Yearn v3 USDC.e at 11.42% net. Next evaluation in 6 days." } },
    { id: "b2", component: "metric_card", label: "Position", data: { value: "$24,800", sub: "Yearn v3 USDC.e, Arbitrum" } },
    { id: "b3", component: "metric_card", label: "Net APY", data: { value: "11.42%", delta: "+1.54pp", dir: "up", sub: "since last rotation" } },
    { id: "b4", component: "progress_bar", label: "Spent against cap", data: { value: 812, target: 1200, unit: "USD", note: "$400 per transaction" } },
    {
      id: "b5",
      component: "leaderboard",
      label: "Candidate vaults, net APY",
      span: 3,
      data: {
        unit: "%",
        accentIndex: 0,
        rows: [
          { label: "Yearn v3 — USDC.e", value: 11.42, note: "current" },
          { label: "Beefy — USDC/USDT", value: 9.88 },
          { label: "Aave v3 — USDC", value: 7.16 },
          { label: "Yearn v3 — DAI", value: 6.94 },
        ],
      },
    },
  ],
});

const perpDeleverage = build({
  name: "perp-deleverage",
  title: "Perp deleverage guard — Arbitrum",
  intent: "If my perp leverage goes above 8x, close enough of the position to bring it back to 5x.",
  category: "risk",
  tags: ["perps", "leverage", "autonomous"],
  tier: "autonomous",
  schemas: ["perp-futures@1.3.4", "dex-amm@1.3.2"],
  networks: ["arbitrum-one"],
  sources: [
    src("Pk8w2Qe", "perp-futures@1.3.4", "arbitrum-one", true, "gmx-v2"),
    src("5zvR82Q", "dex-amm@1.3.2", "arbitrum-one", true, "uniswap-v3-arbitrum"),
  ],
  stream: { package: "gmx-v2-arbitrum@v0.3.2", module: "map_position_updates" },
  triggers: [{ on: "stream", when: "leverage > 8", run: "trim" }],
  actions: { trim: { kind: "withdraw", target: ROUTER_ARB, params: { targetLeverage: 5 }, label: "Trim to 5×" } },
  policy: {
    wallet: "0x6d03e2a97c5b14f80a2d6c39b7e05f18c4a29b60",
    maxSpendUsd: 300,
    maxPerTxUsd: 75,
    allowlist: [ROUTER_ARB],
    expiresAt: "2026-08-15T00:00:00.000Z",
  },
  author: "vega.eth",
  mine: true,
  running: false,
  createdDaysAgo: 10,
  priceUsd: 0.1,
  forkedFrom: "aave-guard@1.0.0",
  stats: { runs: 164, forks: 12, valueTransactedUsd: 940, spentUsd: 0, thumbsUp: 22, thumbsDown: 2, earnedUsd: 16.4, sourcesQueried: 6, sourcesHealthy: 6 },
  reviews: [{ id: "r14", rater: "0xdegen.eth", score: "up", text: "Forked from aave-guard and it came across with an empty wallet, as advertised.", ranIt: true, at: daysAgo(6) }],
  journal: [j(190, "QUERY", "perp-futures@1.3.4 — 6 of 6 live · $0.006"), j(190, "TRIGGER", "leverage 4.2× — under 8×, no action")],
  blocks: [
    { id: "b1", component: "alert_banner", label: "Status", span: 3, data: { level: "gain", text: "Leverage 4.2×, well under the 8× trigger. No action taken this week." } },
    { id: "b2", component: "gauge", label: "Leverage", data: { value: 4.2, min: 1, max: 10, threshold: 8, unit: "×", status: "gain" } },
    {
      id: "b3",
      component: "position_card",
      label: "GMX v2 — ETH-USD long",
      data: {
        asset: "ETH-USD",
        rows: [
          { k: "Size", v: "$18,400" },
          { k: "Collateral", v: "$4,380" },
          { k: "Entry", v: "$3,118.40" },
          { k: "Unrealised", v: "+$412.90", accent: "gain" },
        ],
      },
    },
    { id: "b4", component: "progress_bar", label: "Spent against cap", data: { value: 0, target: 300, unit: "USD", note: "$75 per transaction" } },
  ],
});

const gasRebate = build({
  name: "gas-rebate-claimer",
  title: "Gas rebate claimer — Optimism",
  intent: "Claim my Optimism protocol rebates whenever they cross $25.",
  category: "ops",
  tags: ["claims", "optimism", "autonomous"],
  tier: "autonomous",
  schemas: ["generic@3.0.0", "network@1.2.0"],
  networks: ["optimism"],
  sources: [
    src("Gg2v6Bn", "generic@3.0.0", "optimism", true, "op-rewards"),
    src("Nw1q4Ft", "network@1.2.0", "optimism", true, "optimism-network"),
  ],
  stream: { package: "optimism-rewards@v0.1.3", module: "map_claimable" },
  triggers: [{ on: "stream", when: "claimableUsd > 25", run: "claim" }],
  actions: { claim: { kind: "claim", target: ROUTER_OP, params: {}, label: "Claim" } },
  policy: {
    wallet: "0xb04e73a1c8d259f60e3a7b1c05d48f92a6c31e70",
    maxSpendUsd: 100,
    maxPerTxUsd: 10,
    allowlist: [ROUTER_OP],
    expiresAt: "2026-10-01T00:00:00.000Z",
  },
  author: "mara.eth",
  mine: true,
  running: true,
  createdDaysAgo: 4,
  priceUsd: 0.02,
  stats: { runs: 96, forks: 5, valueTransactedUsd: 318.4, spentUsd: 4.2, thumbsUp: 14, thumbsDown: 0, earnedUsd: 1.92, sourcesQueried: 4, sourcesHealthy: 4 },
  journal: [
    j(28, "STREAM", "claimable crossed $25.00"),
    j(28, "POLICY", "proposed claim, gas $1.40 — allowlisted, under caps, allowed"),
    j(28, "ACTION", "claim 31.80 OP rewards, gas $1.40", { spentUsd: 1.4, txHash: "0xe207c4b81a9d36f05a3c9d71e08b46f2a1c503d97e6b48a2915c0d3e7b6f21a4" }),
  ],
  blocks: [
    { id: "b1", component: "alert_banner", label: "Status", span: 3, data: { level: "live", text: "Watching. $8.40 claimable, trigger is $25." } },
    { id: "b2", component: "progress_bar", label: "Claimable against trigger", data: { value: 8.4, target: 25, unit: "USD" } },
    { id: "b3", component: "metric_card", label: "Claimed, lifetime", data: { value: "$318.40", sub: "across 11 claims" } },
    { id: "b4", component: "metric_card", label: "Gas spent, lifetime", data: { value: "$4.20", sub: "against a $100 cap" } },
  ],
});

/* ================================================================== */

export const SEED_APPS: MiniApp[] = [
  // autonomous first — the board sorts by tier and this is the payoff row
  aaveGuard,
  copyTraderArb,
  yieldRotator,
  perpDeleverage,
  gasRebate,
  // monitor
  healthFactorWatch,
  whaleAlertArb,
  fundingDivergence,
  staleOracleWatch,
  bridgeOutflowWatch,
  // readonly
  dexVolumeArb,
  tvlCrosschain,
  yieldLeaderboard,
  bridgeFlows,
  perpOiBoard,
  nftVolumeOp,
];

/** The global activity feed, newest last. Built from every app's journal. */
export const SEED_LEDGER: LedgerLine[] = SEED_APPS.flatMap((app) =>
  app.journal.map((entry, i) => ({
    ...entry,
    id: `${app.manifest.name}-${i}`,
    app: app.manifest.name,
  })),
)
  .concat([
    { id: "x1", app: "dex-volume-arb", ts: ago(52), kind: "QUERY", message: "dex-amm@1.3.2 × 31 deployments — 27 live, 4 skipped, 412ms · $0.012", ok: true },
    { id: "x2", app: "tvl-crosschain", ts: ago(64), kind: "QUERY", message: "3 schema families × 3 chains merged, 38 of 44 live · $0.031", ok: true },
    { id: "x3", app: "yield-leaderboard", ts: ago(96), kind: "ERROR", message: "sonne-finance deployment returned 502, skipped", ok: false },
    { id: "x4", app: "health-factor-watch", ts: ago(124), kind: "TRIGGER", message: "health factor 1.61 → 1.52, still above 1.40", ok: true },
  ])
  .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

/**
 * A fork inherits the interface but none of the parent's spending history.
 * The manifest already strips the wallet; this strips what the UI would
 * otherwise still claim on screen.
 */
export function resetOwnedValues(ui: unknown, tier: AgencyTier): unknown {
  if (typeof ui !== "object" || ui === null) return ui;
  const doc = ui as UiDoc;
  if (!Array.isArray(doc.blocks)) return ui;
  const blocks = doc.blocks.map((b): UiBlock => {
    if (b.component === "progress_bar" && b.data.unit === "USD") {
      return { ...b, data: { ...b.data, value: 0 } };
    }
    if (b.component === "alert_banner" && tier !== "readonly") {
      return {
        ...b,
        data: {
          level: "risk",
          text:
            tier === "autonomous"
              ? "Forked copy. The wallet is empty and nothing is armed until you fund it."
              : "Forked copy. Run it once to subscribe.",
        },
      };
    }
    return b;
  });
  return { ...doc, blocks };
}

export function tierRank(tier: AgencyTier): number {
  return tier === "autonomous" ? 0 : tier === "monitor" ? 1 : 2;
}

export const TIER_LABEL: Record<AgencyTier, string> = {
  readonly: "Read only",
  monitor: "Monitor",
  autonomous: "Autonomous",
};

export const TIER_BLURB: Record<AgencyTier, string> = {
  readonly: "Reads data. Cannot act.",
  monitor: "Watches and alerts. Cannot spend.",
  autonomous: "Holds a wallet. Can spend.",
};

/* ------------------------------------------------------------------ *
 * Draft a manifest from a sentence.
 *
 * TODO(integrator): this is the local stand-in for `plan()` + `compose()`
 * from `@/lib/contracts/api` (W3 planner on 0G Compute, W4 composer). It
 * picks tier and schemas from the wording so the Studio runs end to end with
 * no API keys. Swap `draftFromIntent` for a call to the kit and the rest of
 * the Studio flow is unchanged.
 * ------------------------------------------------------------------ */

export interface PlanStep {
  key: string;
  label: string;
  /** Resolved detail, shown in mono once the step lands. */
  detail: string;
  ms: number;
}

export interface Draft {
  manifest: Manifest;
  steps: PlanStep[];
}

const SCHEMA_HINTS: { match: RegExp; schema: SchemaFamily; label: string }[] = [
  { match: /\b(lend|borrow|aave|compound|health\s*factor|liquidat|collateral|cdp)/i, schema: "lending-cdp@3.1.0", label: "Lending / CDP" },
  { match: /\b(swap|dex|uniswap|camelot|pool|liquidity|volume|amm|sell|buy|price|trade|mirror|rotate)/i, schema: "dex-amm@1.3.2", label: "DEX AMM" },
  { match: /\b(aggregator|1inch|paraswap|best\s*route)/i, schema: "dex-aggregator@1.0.2", label: "DEX aggregator" },
  { match: /\b(vault|yield|apy|apr|farm|stablecoin)/i, schema: "yield-aggregator@1.3.1", label: "Yield aggregator" },
  { match: /\b(perp|funding|leverage|open\s*interest|futures|long|short)/i, schema: "perp-futures@1.3.4", label: "Perp futures" },
  { match: /\b(bridge|cross[- ]?chain|inflow|outflow)/i, schema: "bridge@1.2.0", label: "Bridge" },
  { match: /\b(nft|collection|floor|mint)/i, schema: "nft-marketplace@2.1.0", label: "NFT marketplace" },
  { match: /\b(gas|block|throughput|network)/i, schema: "network@1.2.0", label: "Network" },
  { match: /\b(option|strike|expiry)/i, schema: "options@1.3.2", label: "Options" },
];

const NETWORK_HINTS: { match: RegExp; network: Network }[] = [
  { match: /\barbitrum\b/i, network: "arbitrum-one" },
  { match: /\boptimism\b|\bop\s+mainnet\b/i, network: "optimism" },
  { match: /\bbase\b/i, network: "base" },
  { match: /\bmainnet\b|\bethereum\b/i, network: "mainnet" },
];

const AUTONOMOUS = /\b(sell|buy|swap|rebalance|mirror|copy|rotate|claim|close|trim|execute|trade|move my|bring it back)\b/i;
const MONITOR = /\b(alert|notify|tell me when|warn|watch|monitor|ping me|let me know)\b/i;

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .filter((w) => !["the", "my", "a", "an", "of", "on", "in", "to", "for", "and", "if", "when", "me"].includes(w))
    .slice(0, 3)
    .join("-")
    .replace(/-+/g, "-");
  const cleaned = base.replace(/^-|-$/g, "");
  return cleaned.length >= 3 ? cleaned.slice(0, 30) : "mini-app";
}

export function draftFromIntent(intent: string, now: Date = new Date()): Draft {
  const schemaHits = SCHEMA_HINTS.filter((h) => h.match.test(intent));
  const picked = schemaHits.length ? schemaHits : [SCHEMA_HINTS[1]];
  const schemas = Array.from(new Set(picked.map((h) => h.schema))).slice(0, 3);

  const netHits = NETWORK_HINTS.filter((h) => h.match.test(intent)).map((h) => h.network);
  const networks: Network[] = netHits.length ? Array.from(new Set(netHits)) : ["arbitrum-one"];

  const tier: AgencyTier = AUTONOMOUS.test(intent) ? "autonomous" : MONITOR.test(intent) ? "monitor" : "readonly";

  const pool: Source[] = [];
  // Every standardized family has many deployments per chain — that breadth is
  // the whole point of resolving a schema rather than a subgraph ID.
  const catalogue: Record<string, [string, string][]> = {
    "lending-cdp@3.1.0": [
      ["Jd8k2Lp", "aave-v3"], ["Rt9y3Mn", "radiant-v2"], ["Hh8j1Cx", "exactly"],
      ["Kk4b7Nq", "compound-v3"], ["Ll6c2Pr", "silo-v2"], ["Mm9d5Qs", "dolomite"],
      ["Nn2e8Rt", "seamless"], ["Oo5f1Su", "moonwell"], ["Pp8g4Tv", "granary"],
    ],
    "dex-amm@1.3.2": [
      ["5zvR82Q", "uniswap-v3"], ["8YtQmXe", "camelot-v3"], ["Ck2mQ8x", "balancer-v2"],
      ["Dl5n3Yz", "curve"], ["Em8p6Za", "ramses"], ["Fn1q9Ab", "traderjoe-v2"],
      ["Go4r2Bc", "sushi-v3"], ["Hp7s5Cd", "aerodrome"], ["Iq0t8De", "velodrome-v2"],
      ["Jr3u1Ef", "pancakeswap-v3"],
    ],
    "dex-aggregator@1.0.2": [["Ag1s5Dv", "1inch"], ["Ah3t7Ew", "paraswap"], ["Ai6u0Fx", "0x-protocol"], ["Aj9v3Gy", "odos"]],
    "yield-aggregator@1.3.1": [["Yv2c8Rt", "yearn-v3"], ["Yw5f1Sd", "beefy"], ["Yx8g2Te", "gamma"], ["Yy1h5Uf", "pendle"], ["Yz4i8Vg", "sommelier"]],
    "perp-futures@1.3.4": [["Pk8w2Qe", "gmx-v2"], ["Lm3r7Uy", "vertex"], ["Mn6s0Vz", "synthetix-perps-v3"], ["No9t3Wa", "mux"], ["Op2u6Xb", "hmx"]],
    "bridge@1.2.0": [["Bg9k4Vn", "across-v3"], ["Cf2m8Xq", "stargate-v2"], ["Dg2l7Wo", "hop"], ["Eh5m0Xp", "connext"], ["Fi8n3Yq", "synapse"]],
    "nft-marketplace@2.1.0": [["Nf4d9Ke", "seaport"], ["Ng7e2Lf", "blur"], ["Nh0f5Mg", "quix"]],
    "network@1.2.0": [["Nw1q4Ft", "network-core"], ["Nx4r7Gu", "network-blocks"]],
    "options@1.3.2": [["Oo9m2Zx", "lyra-v2"], ["Op2n5Ay", "premia-v3"], ["Oq5o8Bz", "dopex"]],
    "generic@3.0.0": [["Gg2v6Bn", "generic-core"], ["Gh5w9Co", "generic-tokens"], ["Gi8x2Dp", "generic-accounts"]],
  };
  let seq = 0;
  for (const schema of schemas) {
    for (const network of networks) {
      for (const [id, label] of catalogue[schema] ?? []) {
        seq += 1;
        pool.push(src(`${id}${seq}`, schema, network, seq % 7 !== 0, `${label}-${network}`));
      }
    }
  }
  const healthy = pool.filter((s) => s.healthy).length;

  const blocks = draftBlocks(tier, intent);
  const nowIso = now.toISOString();
  const name = slugify(intent);

  const manifest: Manifest = {
    spec: "graphmini/2",
    name,
    title: titleFromIntent(intent),
    intent,
    category: tier === "autonomous" ? "trading" : tier === "monitor" ? "risk" : "analytics",
    tags: schemas.map((s) => s.split("@")[0]),
    data: {
      schemas,
      networks,
      sources: pool,
      queries: Object.fromEntries(
        schemas.map((schema, i) => [`q${i}`, `query($first:Int!){ ${schema.split("@")[0].replace(/-/g, "_")}(first:$first){ id } }`]),
      ),
      variables: { first: 25 },
      stream:
        tier === "readonly"
          ? null
          : { package: "substreams-common@v0.4.0", module: "map_events", filter: {} },
      transport: tier === "readonly" ? "gateway" : "x402",
    },
    ui: { spec: "a2ui/0.9.1", blocks } satisfies UiDoc,
    agency: {
      tier,
      triggers:
        tier === "readonly"
          ? []
          : [{ on: "stream", when: tier === "autonomous" ? "threshold breached" : "condition met", run: tier === "autonomous" ? "act" : "notify" }],
      actions:
        tier === "autonomous"
          ? { act: { kind: "swap", target: ROUTER_ARB, params: {}, label: "Execute" } }
          : tier === "monitor"
            ? { notify: { kind: "notify", params: {}, label: "Alert me" } }
            : {},
      policy: {
        wallet: tier === "autonomous" ? "0x0000000000000000000000000000000000000000" : null,
        maxSpendUsd: tier === "autonomous" ? 500 : 0,
        maxPerTxUsd: tier === "autonomous" ? 50 : 0,
        allowlist: tier === "autonomous" ? [ROUTER_ARB] : [],
        expiresAt: tier === "autonomous" ? new Date(now.getTime() + 30 * 86_400_000).toISOString() : null,
        requireConfirm: tier !== "autonomous",
        killSwitch: true,
        halted: false,
      },
    },
    identity: { ens: null, agenticId: null, manifestCid: null },
    provenance: {
      model: "deepseek-chat-v3",
      compute: "0g-private-computer",
      attestationRef: null,
      generatedAt: nowIso,
    },
    author: null,
    appVersion: "1.0.0",
    forkedFrom: null,
    pricing: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const componentNames = Array.from(new Set(blocks.map((b) => b.component)));
  const steps: PlanStep[] = [
    { key: "intent", label: "Read the intent", detail: `tier ${tier}`, ms: 420 },
    { key: "schemas", label: "Resolve standardized schemas", detail: schemas.join(" · "), ms: 620 },
    { key: "sources", label: "Look up live deployments", detail: `${pool.length} found across ${networks.length} ${networks.length === 1 ? "chain" : "chains"}`, ms: 700 },
    { key: "health", label: "Health-check sources", detail: `${healthy} of ${pool.length} live, ${pool.length - healthy} skipped`, ms: 780 },
    ...(tier === "readonly"
      ? []
      : [{ key: "stream", label: "Subscribe Substreams", detail: "substreams-common@v0.4.0 · map_events", ms: 560 }]),
    { key: "shape", label: "Read the data shape", detail: shapeNote(blocks), ms: 520 },
    { key: "compose", label: "Choose components", detail: componentNames.join(" · "), ms: 640 },
    ...(tier === "autonomous"
      ? [
          { key: "actions", label: "Wire actions", detail: `swap via ${ROUTER_ARB.slice(0, 10)}…, allowlisted`, ms: 600 },
          { key: "policy", label: "Set policy", detail: "$500 lifetime · $50 per transaction · kill switch on", ms: 520 },
        ]
      : []),
  ];

  return { manifest, steps };
}

function shapeNote(blocks: UiBlock[]): string {
  const first = blocks[0];
  if (!first) return "no rows returned";
  switch (first.component) {
    case "gauge":
      return "bounded ratio → gauge";
    case "leaderboard":
      return "ranked categorical → leaderboard";
    case "time_series":
      return "timeseries, one metric → time series";
    case "alert_banner":
      return "triggered condition → alert banner";
    default:
      return "scalar with delta → metric card";
  }
}

function titleFromIntent(intent: string): string {
  // First clause carries the subject; the rest is usually the condition.
  const first = intent.trim().split(/(?<=[.?!])\s|,\s(?=if|when|and)/i)[0] ?? intent;
  const trimmed = first.trim().replace(/[.?!]+$/, "");
  const short = trimmed.length > 52 ? `${trimmed.slice(0, 49).trimEnd()}…` : trimmed;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

function draftBlocks(tier: AgencyTier, intent: string): UiBlock[] {
  if (tier === "autonomous") {
    return [
      { id: "d1", component: "alert_banner", label: "Status", span: 3, data: { level: "live", text: "Subscribed. Waiting on the first qualifying event." } },
      { id: "d2", component: "gauge", label: "Trigger condition", data: { value: 1.62, min: 1, max: 3, threshold: 1.4, unit: "", status: "gain" } },
      {
        id: "d3",
        component: "position_card",
        label: "Position",
        data: { asset: "ETH / USDC", rows: [{ k: "Collateral", v: "$0.00" }, { k: "Debt", v: "$0.00" }, { k: "Wallet", v: "not funded yet", accent: "risk" }] },
      },
      { id: "d4", component: "progress_bar", label: "Spent against cap", data: { value: 0, target: 500, unit: "USD", note: "$50 per transaction" } },
    ];
  }
  if (tier === "monitor") {
    return [
      { id: "d1", component: "alert_banner", label: "Status", span: 3, data: { level: "live", text: "Subscribed. Nothing has crossed the threshold yet." } },
      { id: "d2", component: "gauge", label: "Watched value", data: { value: 1.62, min: 1, max: 3, threshold: 1.4, unit: "", status: "gain" } },
      { id: "d3", component: "metric_card", label: "Checks, today", data: { value: "0", sub: "since publish" } },
      { id: "d4", component: "metric_card", label: "Alerts, today", data: { value: "0" } },
    ];
  }
  const ranked = /\btop\b|\bbest\b|\brank\b|\bleader/i.test(intent);
  if (ranked) {
    return [
      { id: "d1", component: "metric_card", label: "Total, 7d", data: { value: "$4.21B", delta: "+8.4%", dir: "up" } },
      { id: "d2", component: "metric_card", label: "Deployments merged", data: { value: "27 / 31", sub: "4 skipped, unhealthy" } },
      {
        id: "d3",
        component: "leaderboard",
        label: "Ranked result",
        span: 2,
        data: {
          unit: "USD",
          accentIndex: 0,
          rows: [
            { label: "Uniswap v3", value: 2810000000 },
            { label: "Camelot v3", value: 486000000 },
            { label: "Balancer v2", value: 312000000 },
            { label: "Curve", value: 274000000 },
            { label: "Ramses", value: 188000000 },
          ],
        },
      },
    ];
  }
  return [
    { id: "d1", component: "metric_card", label: "Headline", data: { value: "$4.21B", delta: "+8.4%", dir: "up", sub: "7d" } },
    { id: "d2", component: "metric_card", label: "Observations", data: { value: "6,214,880" } },
    { id: "d3", component: "time_series", label: "Trend, 7d", span: 2, data: { unit: "USD", accent: "live", xFirst: "Jul 19", xLast: "Jul 26", points: [512, 604, 588, 641, 703, 590, 572] } },
  ];
}
