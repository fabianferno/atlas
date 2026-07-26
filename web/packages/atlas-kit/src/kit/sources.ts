/**
 * W1 — the standardized-subgraph registry and its health checks.
 *
 * Every ID below marked `verified` was extracted from `messari/subgraphs`
 * `deployment/deployment.json` (master, read 2026-07-24) and cross-checked
 * against a crawl of The Graph Network meta-subgraph dated 2026-07-21. The
 * `reliability` and `allocations` columns come from that crawl — reliability
 * uses the PaulieB14/subgraph-registry formula (signal 20% / stake 20% /
 * fees 30% / query volume 30%, minus 0.5 if denied).
 *
 * `allocations === 0` means no indexer was serving the deployment at crawl
 * time. Those are the ~28% that are dead at any moment. We keep them in the
 * registry on purpose: the health check is the product, and a registry that
 * only lists things we already know are alive proves nothing.
 */
import type { Network, SchemaFamily, Source } from "../contracts/manifest";
import { graphQuery, isLive, type Transport } from "./gateway";

/** How a candidate deployment ID was obtained. Placeholders are never queried. */
export type Verification =
  /** Present in messari/subgraphs AND in the 2026-07-21 network crawl. */
  | "verified"
  /** Present in messari/subgraphs but absent from the crawl — may be unpublished. */
  | "unverified"
  /** Not a real ID. The family has no standardized deployment on this network. */
  | "placeholder";

export interface RegistryEntry {
  subgraphId: string;
  schema: SchemaFamily;
  network: Network;
  /** Messari's deployment slug. Stable, human-scannable, safe to show in a UI. */
  label: string;
  protocol: string;
  /** The schema version actually deployed. Frequently older than the family
   *  version in SCHEMA_FAMILIES — older schemas are missing later fields, which
   *  is why the fan-out falls back to the Protocol-interface core fields. */
  schemaVersion: string;
  reliability: number;
  allocations: number;
  verification: Verification;
  note?: string;
}

/**
 * The cheapest probe that works against any subgraph regardless of schema.
 * `_meta` is served by graph-node itself, so a valid response proves an indexer
 * is allocated, synced, and answering — which is exactly what "healthy" means.
 */
export const HEALTH_PROBE = `{ _meta { block { number timestamp } hasIndexingErrors } }`;

/** Health results live this long. Long enough to survive a demo click-through,
 *  short enough that a source dying mid-session is noticed. */
export const HEALTH_TTL_MS = 90_000;

/** Probes must fail fast. A source that takes longer than this is unusable in a
 *  fan-out anyway, so treating slow as dead is the correct call, not a shortcut. */
export const HEALTH_TIMEOUT_MS = 2_000;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

function e(
  subgraphId: string,
  schema: SchemaFamily,
  network: Network,
  label: string,
  protocol: string,
  schemaVersion: string,
  reliability: number,
  allocations: number,
  verification: Verification = "verified",
  note?: string,
): RegistryEntry {
  return {
    subgraphId,
    schema,
    network,
    label,
    protocol,
    schemaVersion,
    reliability,
    allocations,
    verification,
    ...(note ? { note } : {}),
  };
}

export const SOURCE_REGISTRY: readonly RegistryEntry[] = [
  // --- lending-cdp · arbitrum-one -----------------------------------------
  e("4xyasjQeREe7PxnF6wVdobZvCw5mhoHZq3T7guRpuNPf", "lending-cdp@3.1.0", "arbitrum-one", "aave-v3-arbitrum", "Aave V3", "3.1.0", 0.758, 5),
  e("5MjRndNWGhqvNX7chUYLQDnvEgc8DaH8eisEkcJt71SR", "lending-cdp@3.1.0", "arbitrum-one", "compound-v3-arbitrum", "Compound V3", "3.1.0", 0.723, 7),
  e("5HTkKJNSm72tUGakwj8yroDGHxc6fBhmLaA5oJepZGL3", "lending-cdp@3.1.0", "arbitrum-one", "radiant-capital-arbitrum", "Radiant Capital", "3.1.0", 0.356, 1),
  e("2rQAKGJkvkiAXsCjx1n4E3DSgk2b7nCZMtt2BrV5TBgt", "lending-cdp@3.1.0", "arbitrum-one", "radiant-capital-v2-arbitrum", "Radiant Capital V2", "3.1.0", 0.499, 2, "verified", "Messari status: dev"),
  e("3m97d2dJ2pXwPFuiHrm8T37V9TCoAHBpMqRwdguyUZXF", "lending-cdp@3.1.0", "arbitrum-one", "abracadabra-arbitrum", "Abracadabra", "2.0.1", 0.515, 3),
  e("GzHkVNf7BBqUjV8Sy6U6xUaWdGheFMdin1cB6sNvfdzs", "lending-cdp@3.1.0", "arbitrum-one", "cream-finance-arbitrum", "Cream Finance", "2.0.1", 0.508, 4),
  e("Dpk4Gen22wxQ3Laojf7DR2me8wGzjaHwjsKAsLf2rCFV", "lending-cdp@3.1.0", "arbitrum-one", "dforce-arbitrum", "dForce", "2.0.1", 0.525, 4),
  e("HnV3fhwsWfmQGdD2AeGzqvRVTDBqnMH74jCsDVq1DXYP", "lending-cdp@3.1.0", "arbitrum-one", "rari-fuse-arbitrum", "Rari Fuse", "2.0.1", 0.511, 7),
  e("zGuPrsVqtY5ehJDCmweb9ZnBrae3tSQWRux8Mz1M4Gn", "lending-cdp@3.1.0", "arbitrum-one", "vesta-finance-arbitrum", "Vesta Finance", "2.0.1", 0.522, 2),
  e("Duw2tSACo9uRGFctAGsCc9pF7ZGMyqpjkAHPwm49dZe6", "lending-cdp@3.1.0", "arbitrum-one", "qidao-arbitrum", "QiDao", "1.3.0", 0.509, 6),

  // --- lending-cdp · optimism ---------------------------------------------
  e("3RWFxWNstn4nP3dXiDfKi9GgBoHx7xzc7APkXs1MLEgi", "lending-cdp@3.1.0", "optimism", "aave-v3-optimism", "Aave V3", "3.1.0", 0.673, 2),
  e("DQqb7FiQ1joLhESkAwvAYiuXhwfz4zf6qHmbt7stnec8", "lending-cdp@3.1.0", "optimism", "sonne-finance-optimism", "Sonne Finance", "2.0.1", 0.312, 1),
  e("6AmkakXwadWiZ2jN7oJcFreWmKG1nZrT5P8om52upYPd", "lending-cdp@3.1.0", "optimism", "dforce-optimism", "dForce", "2.0.1", 0.268, 1, "verified", "graph-lending-mcp saw bad attestations here 2026-03"),
  e("4WKePP5QfwrW6Hfd8YKWHuivivmdxPubuP45BryeGo4g", "lending-cdp@3.1.0", "optimism", "iron-bank-optimism", "Iron Bank", "2.0.1", 0.155, 0),
  e("4JbWxzxBNCpAaVz72Gt2UthgiwcWZQLKDBhmSE7wKY2K", "lending-cdp@3.1.0", "optimism", "qidao-optimism", "QiDao", "1.3.0", 0.149, 0),

  // --- lending-cdp · base --------------------------------------------------
  e("33ex1ExmYQtwGVwri1AP3oMFPGSce6YbocBP7fWbsBrg", "lending-cdp@3.1.0", "base", "moonwell-base", "Moonwell", "2.0.1", 0.677, 3),
  e("2u4mWUV4xS19ef1MbnxZHWLLMwdPxtVifH46JbonXwXP", "lending-cdp@3.1.0", "base", "seamless-protocol-base", "Seamless Protocol", "3.1.0", 0.562, 2),
  e("D7mapexM5ZsQckLJai2FawTKXJ7CqYGKM8PErnS3cJi9", "lending-cdp@3.1.0", "base", "aave-v3-base", "Aave V3", "3.1.0", 0.535, 1),
  e("9NHJ9k31qaGCYXppm9isJTiEoiB6v3tJDnR6SrQrxcjw", "lending-cdp@3.1.0", "base", "qidao-base", "QiDao", "1.3.0", 0.325, 1),
  // messari/subgraphs lists AwoxEZ… for BOTH compound-v3-ethereum and
  // compound-v3-base. The network registry resolves it to mainnet, so the Base
  // entry is a bad row in their config. Registered on mainnet only, below.

  // --- lending-cdp · mainnet (breadth; also the fallback when L2 is quiet) --
  e("JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk", "lending-cdp@3.1.0", "mainnet", "aave-v3-ethereum", "Aave V3", "3.1.0", 0.9, 8),
  e("AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9", "lending-cdp@3.1.0", "mainnet", "compound-v3-ethereum", "Compound V3", "3.1.0", 0.85, 6),
  e("GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si", "lending-cdp@3.1.0", "mainnet", "spark-lend-ethereum", "Spark Lend", "3.1.0", 0.7, 4),
  e("8sE6rTNkPhzZXZC6c8UQy2ghFTu5PPdGauwUBm4t7HZ1", "lending-cdp@3.1.0", "mainnet", "makerdao-ethereum", "MakerDAO", "2.0.1", 0.7, 5),
  e("2D2dFCLjUt3MfFgTKW8cBxiRQ3Adss7KUtYh2rTcFVY", "lending-cdp@3.1.0", "mainnet", "liquity-ethereum", "Liquity", "2.0.1", 0.6, 4),

  // --- dex-amm (constant product, schema 1.3.x) ----------------------------
  e("9tSS5FaePZnjmnXnSKCCqKVLAqA6eGg6jA2oRojsXUbP", "dex-amm@1.3.2", "arbitrum-one", "sushiswap-arbitrum", "SushiSwap", "1.3.2", 0.788, 6),
  e("E6J42xXvRQGsqcMEoWRkdeJjUTsWdcHL8khuFMY6CDAM", "dex-amm@1.3.2", "arbitrum-one", "camelot-v2-arbitrum", "Camelot V2", "1.3.2", 0.559, 4),
  e("H36tAWQeYVioE4hHtaKJEMJMxwzVJWjfg2mimva2wcUj", "dex-amm@1.3.2", "arbitrum-one", "saddle-finance-arbitrum", "Saddle Finance", "1.3.0", 0.406, 6),
  e("A4Y1A82YhSLTn998BVVELC8eWzhi992k4ZitByvssxqA", "dex-amm@1.3.2", "optimism", "velodrome-finance-v2-optimism", "Velodrome V2", "1.3.0", 0.581, 3),
  e("7tA4PY1VmbycJeoVtn2mjQK4NbozgwTuZgrxDTxzEDL1", "dex-amm@1.3.2", "optimism", "velodrome-finance-v1-optimism", "Velodrome V1", "1.3.0", 0.212, 0),
  e("CFu1DWY9DyiC25WRmGreowMyuvLB27JfNRCa8rKkTDjK", "dex-amm@1.3.2", "optimism", "saddle-finance-optimism", "Saddle Finance", "1.3.0", 0.14, 1),
  e("CXDZPduZE6nWuWEkSzWkRoJSSJ6CneSqiDxdnhhURShX", "dex-amm@1.3.2", "optimism", "curve-finance-optimism", "Curve Finance", "1.3.0", 0.115, 0),
  e("77jZ9KWeyi3CJ96zkkj5s1CojKPHt6XJKjLFzsDCd8Fd", "dex-amm@1.3.2", "mainnet", "sushiswap-ethereum", "SushiSwap", "1.3.2", 0.8, 6),
  e("794H6CNzdGF5YfBK9nPsUgGn7EBbdJSCTjgcKPEPyFnn", "dex-amm@1.3.2", "mainnet", "balancer-v2-ethereum", "Balancer V2", "1.3.0", 0.8, 5),
  e("3fy93eAT56UJsRCEht8iFhfi6wjHWXtZ9dnnbQmvFopF", "dex-amm@1.3.2", "mainnet", "curve-finance-ethereum", "Curve Finance", "1.3.0", 0.75, 5),

  // --- dex-amm-extended (concentrated liquidity, schema 4.0.x) -------------
  e("FQ6JYszEKApsBpAmiHesRsd9Ygc6mzmpNRANeVQFYoVX", "dex-amm-extended@4.0.1", "arbitrum-one", "uniswap-v3-arbitrum", "Uniswap V3", "4.0.1", 0.835, 4),
  e("3oHCddbQGTi42kPZBwyGzD2JzZR33zK2MwXtxAerNJy2", "dex-amm-extended@4.0.1", "arbitrum-one", "sushiswap-v3-arbitrum", "SushiSwap V3", "4.0.1", 0.576, 6, "verified", "Messari status: dev"),
  e("EgnS9YE1avupkvCNj9fHnJxppfEmNNywYJtghqiu2pd9", "dex-amm-extended@4.0.1", "optimism", "uniswap-v3-optimism", "Uniswap V3", "4.0.1", 0.782, 4),
  e("FUbEPQw1oMghy39fwWBFY5fE6MXPXZQtjncQy2cXdrNS", "dex-amm-extended@4.0.1", "base", "uniswap-v3-base", "Uniswap V3", "4.0.1", 0, 0, "unverified", "In messari/subgraphs but absent from the 2026-07-21 network crawl. Expect the health check to drop it."),
  e("4cKy6QQMc5tpfdx8yxfYeb9TLZmgLQe44ddW1G7NwkA6", "dex-amm-extended@4.0.1", "mainnet", "uniswap-v3-ethereum", "Uniswap V3", "4.0.0", 0.85, 7),
  e("JAGXF8B14mpB8QGKnwhKTs5JxsQZBJQvbDGFcWwL7gbm", "dex-amm-extended@4.0.1", "mainnet", "pancakeswap-v3-ethereum", "PancakeSwap V3", "4.0.1", 0.7, 4),

  // --- perp-futures --------------------------------------------------------
  e("DiR5cWwB3pwXXQWWdus7fDLR2mnFRQLiBFsVmHAH9VAs", "perp-futures@1.3.4", "arbitrum-one", "gmx-arbitrum", "GMX", "1.3.4", 0.71, 5),
  e("AMh1u4wCbz8Jybs4Nf7uGBdU9dz2C8mJkH1Aocz6HXUf", "perp-futures@1.3.4", "arbitrum-one", "mux-protocol-arbitrum", "MUX Protocol", "1.3.1", 0.24, 1),
  e("DuPBYBj3nfP3sFiHwkRfTATmA4iSqoPvxBaRXWiwpELk", "perp-futures@1.3.4", "arbitrum-one", "gains-trade-arbitrum", "Gains Trade", "1.3.1", 0.13, 0),
  e("9KPc6WMUXg6mqQ9KbCeosJrgmsZyH97vpFPKwJHkVkui", "perp-futures@1.3.4", "arbitrum-one", "level-finance-arbitrum", "Level Finance", "1.3.4", 0.127, 0),
  e("4Po9haSDCDbQ2XtrSXqT8BNB9H6T7EUAmbAorAzHQi9S", "perp-futures@1.3.4", "arbitrum-one", "mummy-finance-arbitrum", "Mummy Finance", "1.3.4", 0.127, 0),
  e("5sbJJTTJQQ4kYuVYNBVw9sX8C5juRpVJNLHg7uFugw2e", "perp-futures@1.3.4", "optimism", "kwenta-optimism", "Kwenta", "1.3.4", 0.584, 3),
  e("7hUM4US9DPz6JqLD6ySqwFmLq4XiAF7cEZLmEesQnYgR", "perp-futures@1.3.4", "optimism", "mux-protocol-optimism", "MUX Protocol", "1.3.1", 0.501, 9),
  e("GvgdFS6dFXCSXwq9PDTdcs5uZzwZYuTrqFjiTRC3jy54", "perp-futures@1.3.4", "optimism", "mummy-finance-optimism", "Mummy Finance", "1.3.4", 0.108, 0),

  // --- options -------------------------------------------------------------
  e("6C7okGPnmQw4eahgvkjzKGqHyXsZBLSWz7BBEyyfe6vB", "options@1.3.2", "arbitrum-one", "dopex-arbitrum", "Dopex", "1.3.2", 0.118, 0),
  e("BC766cXkcBxAwQ6LAYnQytdHJLpJX1C1bbrMFhLCHx7C", "options@1.3.2", "arbitrum-one", "opyn-gamma-arbitrum", "Opyn Gamma", "1.3.2", 0.115, 0),
  e("3zUv74ekxpiy92MQ2MwemR8fJhjvgyBFaGzQLkYHmaUy", "options@1.3.2", "mainnet", "opyn-gamma-ethereum", "Opyn Gamma", "1.3.2", 0.4, 2),

  // --- bridge --------------------------------------------------------------
  e("DWo7jrtpTtUM1buqiCUg7j7XUF568qNPBv7FwwDceuxm", "bridge@1.2.0", "arbitrum-one", "stargate-arbitrum", "Stargate", "1.1.0", 0.64, 3),
  e("3rg6ZtwNUMpBrM1uSUtNqcbc6tGfyY2WLheDGSc5qMzX", "bridge@1.2.0", "arbitrum-one", "across-v2-arbitrum", "Across V2", "1.2.0", 0.433, 5),
  e("4xY1CAbwQA7oq3a78CX8mgKFvMoZzPsv21A92Hm7rEvv", "bridge@1.2.0", "arbitrum-one", "hop-protocol-arbitrum", "Hop Protocol", "1.2.0", 0.418, 4),
  e("579DZmKbpRcdLVBiLyhLEvRQBQ54BA72yDqtSaVSijRs", "bridge@1.2.0", "arbitrum-one", "multichain-arbitrum", "Multichain", "1.0.0", 0.146, 1),
  e("FGucK6FiGDyjwA1VDymrCQXgSTdZH7sCrP8HbnwVFatY", "bridge@1.2.0", "arbitrum-one", "cbridge-arbitrum", "cBridge", "1.1.1", 0.122, 0),
  e("2rQHtwHiK2TCB4bQtgLybf8gGHCRVjANPzKTYss7B1n4", "bridge@1.2.0", "arbitrum-one", "arbitrum-one-bridge-arbitrum", "Arbitrum One Bridge", "1.2.0", 0.12, 0),
  e("7NAF7ZtNtJiXkfCFkTSAyFbfLLfUFa55UgK5woxPxZ46", "bridge@1.2.0", "optimism", "stargate-optimism", "Stargate", "1.1.0", 0.64, 3),
  e("4aUWDFLz4sVYKZDw4JDJLk8vjify1Rqij7UGFozNxA8k", "bridge@1.2.0", "optimism", "optimism-bridge-v2-optimism", "Optimism Bridge V2", "1.2.0", 0.546, 3),
  e("KoMGmd2d1VMukusmf98SdWCSKH5ZP5UEUDHKrKpY74D", "bridge@1.2.0", "optimism", "hop-protocol-optimism", "Hop Protocol", "1.2.0", 0.43, 3),
  e("GY9s64KVsRkW4Q8pCBKQePyDdcUV1TV1ArWFzvMv2qVb", "bridge@1.2.0", "optimism", "across-v2-optimism", "Across V2", "1.2.0", 0.423, 2),
  e("FZkvvW6rZJxJk1E3LqhVWHRAb8oWoWZAX563Y94C6GaF", "bridge@1.2.0", "optimism", "multichain-optimism", "Multichain", "1.0.0", 0.102, 0),
  e("GEy4r8C2cMku1TTfjzC751teQZ4dvVxXiW1F6K4fue2K", "bridge@1.2.0", "optimism", "cbridge-optimism", "cBridge", "1.1.1", 0.099, 0),
  e("4amk8rvTHgxSobsFKsr5jheHsDzLcwyqc8vHhNC1xhGt", "bridge@1.2.0", "base", "stargate-base", "Stargate", "1.1.0", 0.481, 2),
  e("34kdiaZVpPsStQdsh5xFhrZdsZvZYJGfhJ7SVGWY2Y8g", "bridge@1.2.0", "mainnet", "across-v2-ethereum", "Across V2", "1.2.0", 0.6, 4),
  e("G1pPbbMjwCnFiyMherq8wqfMusZDriLMqvGBHLr2wS34", "bridge@1.2.0", "mainnet", "stargate-ethereum", "Stargate", "1.1.0", 0.6, 4),

  // --- yield-aggregator ----------------------------------------------------
  e("G3JZhmKKHC4mydRzD6kSz5fCWve5WDYYCyTFSJyv3SD5", "yield-aggregator@1.3.1", "arbitrum-one", "yearn-v2-arbitrum", "Yearn V2", "1.3.0", 0.386, 6),
  e("6yqMWioX8XNx2aMDYJGnvrVQWNrZfgBzY3ee1RmkXh5Z", "yield-aggregator@1.3.1", "optimism", "arrakis-finance-optimism", "Arrakis Finance", "1.3.0", 0.484, 3),
  e("7rFZ2x6aLQ7EZsNx8F5yenk4xcqwqR3Dynf9rdixCSME", "yield-aggregator@1.3.1", "mainnet", "convex-finance-ethereum", "Convex Finance", "1.3.0", 0.7, 5),
  e("FDLuaz69DbMADuBjJDEcLnTuPnjhZqNbFVrkNiBLGkEg", "yield-aggregator@1.3.1", "mainnet", "yearn-v2-ethereum", "Yearn V2", "1.3.0", 0.7, 6),
  e("Crag42fFb8PrXnbTjHe1UG5KjgzoiUJbqwzJxZ1W8XNJ", "yield-aggregator@1.3.1", "mainnet", "ribbon-finance-ethereum", "Ribbon Finance", "1.3.1", 0.5, 3),

  // --- generic -------------------------------------------------------------
  e("6CdJfr35PDj8AMQikiKGjAUPG2vCu5VLYRawDk8cxwrs", "generic@3.0.0", "arbitrum-one", "livepeer-arbitrum", "Livepeer", "2.1.1", 0.473, 6),
  e("5P79EkkSDxiXxWgiYcpsvML7Q3MSu64sHi8LF2xVggQz", "generic@3.0.0", "arbitrum-one", "renzo-arbitrum", "Renzo", "3.0.0", 0.107, 0),
  e("3nfuRKwAnT5xEBtKT9cKhdCp517TDvEqhgY1eDKAtuZi", "generic@3.0.0", "arbitrum-one", "umami-finance-arbitrum", "Umami Finance", "3.0.0", 0.1, 0),
  e("GerYgkkJgdtE5LoxqiqXrxJzjDrLWixEd7D3aqfDQBxe", "generic@3.0.0", "arbitrum-one", "vaultka-arbitrum", "Vaultka", "3.0.0", 0.098, 0),
  e("7kCkjx6GK67WZrVo54UcLWZ7kBx65TogBW1CD316XZgn", "generic@3.0.0", "arbitrum-one", "karak-arbitrum", "Karak", "2.1.1", 0.096, 0),
  e("HCzjsuU3dW7V6Z2BP4ncyzkkKYi3QXeuJFaboSak2U7V", "generic@3.0.0", "optimism", "mountain-protocol-optimism", "Mountain Protocol", "3.0.0", 0.387, 1),
  e("G9nDvQw6S7LkzNxj7oGFZUsahe3ebpAtEww716kWkfZd", "generic@3.0.0", "optimism", "frax-ether-staking-optimism", "Frax Ether Staking", "2.1.1", 0.067, 0),
  e("Atj9RDj7hzmUd6a3PTzpPCpjJPzqMbvPLdxMfF2BFy5B", "generic@3.0.0", "base", "renzo-base", "Renzo", "3.0.0", 0.11, 0),
  e("ELqNv3KbLggc6kN6uoeKvrbfBpbkQbAorZo3FABZJb6A", "generic@3.0.0", "base", "cygnus-finance-base", "Cygnus Finance", "3.0.0", 0.105, 0),
  e("G7ap2BncLoDoWj2U7Ak8oB1TBFyQbEYPT51d6fDnPkVb", "generic@3.0.0", "base", "flat-money-base", "Flat Money", "3.0.0", 0.095, 0),
  e("CbQHFSCr7XjAAQ1mUmNHSS2AQGrzxst5z3igTUsZMyhN", "generic@3.0.0", "base", "anzen-v2-base", "Anzen V2", "3.0.0", 0.093, 0),
  e("8fjDwMF5JPXYEg3tU45ttTsnp3mdTQd5efhkHhHGHCKj", "generic@3.0.0", "base", "friend-tech-base", "friend.tech", "2.1.1", 0.076, 0),

  // --- nft-marketplace -----------------------------------------------------
  // Messari has six NFT marketplace deployments and every one is Ethereum
  // mainnet. There is no standardized NFT marketplace subgraph on an L2.
  e("HdVdERFUe8h61vm2fDyycHgxjsde5PbB832NHgJfZNqK", "nft-marketplace@2.1.0", "mainnet", "cryptopunks-ethereum", "CryptoPunks", "1.0.0", 0.5, 3),
  e("2GmLsgYGWoFoouZzKjp8biYDkfmeLTkEY3VDQyZqSJHA", "nft-marketplace@2.1.0", "mainnet", "opensea-seaport-ethereum", "OpenSea Seaport", "1.0.0", 0.45, 2, "verified", "Messari status: dev"),
  e("FsT2DES8UdhfDkXCtE56h5WCDrrSXrtJiSMgNWvSdyYL", "nft-marketplace@2.1.0", "mainnet", "looksrare-ethereum", "LooksRare", "1.0.0", 0.3, 1, "verified", "Messari status: dev"),
  e("3cMswgcjkpLmuF99ViQRZfCPRyCsnimqQsR9z6mY5e2i", "nft-marketplace@2.1.0", "mainnet", "x2y2-ethereum", "X2Y2", "1.0.0", 0.25, 1, "verified", "Messari status: dev"),

  // --- families with no standardized deployment anywhere -------------------
  // Kept so the resolver's coverage is complete and callers get an honest
  // "0 of 1 live" instead of a silent empty array. These are never queried.
  e("PLACEHOLDER-dex-aggregator-arbitrum-one", "dex-aggregator@1.0.2", "arbitrum-one", "placeholder-dex-aggregator-arbitrum", "—", "1.0.2", 0, 0, "placeholder", "No DEX-aggregator deployment exists in messari/subgraphs on any network."),
  e("PLACEHOLDER-dex-aggregator-mainnet", "dex-aggregator@1.0.2", "mainnet", "placeholder-dex-aggregator-ethereum", "—", "1.0.2", 0, 0, "placeholder", "No DEX-aggregator deployment exists in messari/subgraphs on any network."),
  e("PLACEHOLDER-network-arbitrum-one", "network@1.2.0", "arbitrum-one", "placeholder-network-arbitrum", "—", "1.2.0", 0, 0, "placeholder", "Messari ships the network schema but publishes no decentralized deployment of it."),
  e("PLACEHOLDER-network-optimism", "network@1.2.0", "optimism", "placeholder-network-optimism", "—", "1.2.0", 0, 0, "placeholder", "Messari ships the network schema but publishes no decentralized deployment of it."),
  e("PLACEHOLDER-network-mainnet", "network@1.2.0", "mainnet", "placeholder-network-ethereum", "—", "1.2.0", 0, 0, "placeholder", "Messari ships the network schema but publishes no decentralized deployment of it."),
  e("PLACEHOLDER-nft-marketplace-base", "nft-marketplace@2.1.0", "base", "placeholder-nft-marketplace-base", "—", "2.1.0", 0, 0, "placeholder", "No standardized NFT-marketplace deployment on Base."),
  e("PLACEHOLDER-options-optimism", "options@1.3.2", "optimism", "placeholder-options-optimism", "—", "1.3.2", 0, 0, "placeholder", "No standardized options deployment on Optimism."),
  e("PLACEHOLDER-perp-futures-base", "perp-futures@1.3.4", "base", "placeholder-perp-futures-base", "—", "1.3.4", 0, 0, "placeholder", "No standardized perp-futures deployment on Base."),
  e("PLACEHOLDER-yield-aggregator-base", "yield-aggregator@1.3.1", "base", "placeholder-yield-aggregator-base", "—", "1.3.1", 0, 0, "placeholder", "No standardized yield-aggregator deployment on Base."),
];

/** Every (family, network) pair we can serve, for a coverage view in the UI. */
export function registryCoverage(): Record<
  SchemaFamily,
  Partial<Record<Network, number>>
> {
  const out = {} as Record<SchemaFamily, Partial<Record<Network, number>>>;
  for (const entry of SOURCE_REGISTRY) {
    if (entry.verification === "placeholder") continue;
    const byNetwork = (out[entry.schema] ??= {});
    byNetwork[entry.network] = (byNetwork[entry.network] ?? 0) + 1;
  }
  return out;
}

/**
 * Candidate deployments for a (schemas × networks) request, best first.
 * Ordering by reliability matters: when a caller caps the fan-out width, the
 * sources most likely to answer should be the ones that survive the cut.
 */
export function candidateSources(
  schemas: readonly SchemaFamily[],
  networks: readonly Network[],
): RegistryEntry[] {
  const wantSchema = new Set(schemas);
  const wantNetwork = new Set(networks);
  return SOURCE_REGISTRY.filter(
    (s) => wantSchema.has(s.schema) && wantNetwork.has(s.network),
  ).sort((a, b) => b.reliability - a.reliability);
}

export function entryToSource(entry: RegistryEntry): Source {
  return {
    subgraphId: entry.subgraphId,
    schema: entry.schema,
    network: entry.network,
    healthCheckedAt: null,
    healthy: false,
    label: entry.label,
  };
}

const REGISTRY_BY_ID = new Map(SOURCE_REGISTRY.map((s) => [s.subgraphId, s]));
export function lookupEntry(subgraphId: string): RegistryEntry | undefined {
  return REGISTRY_BY_ID.get(subgraphId);
}

// ---------------------------------------------------------------------------
// Health checks
// ---------------------------------------------------------------------------

export interface HealthDetail {
  source: Source;
  /** Head block the indexer reported. Null when the probe failed. */
  blockNumber: number | null;
  hasIndexingErrors: boolean;
  latencyMs: number;
  reason: string | null;
  /** True when the answer came from the TTL cache rather than the network. */
  cached: boolean;
}

interface CacheRow {
  detail: HealthDetail;
  expiresAt: number;
}

const healthCache = new Map<string, CacheRow>();

export function clearHealthCache(): void {
  healthCache.clear();
}

/** Callers that want to show a health board without triggering probes. */
export function cachedHealth(subgraphId: string): HealthDetail | null {
  const row = healthCache.get(subgraphId);
  if (!row || row.expiresAt < Date.now()) return null;
  return { ...row.detail, cached: true };
}

/**
 * Fixture-mode health. Deterministic, and deliberately not "everything is up":
 * a demo that always shows 31 of 31 live teaches the audience nothing about the
 * problem we solve. Active indexer allocations at crawl time are the honest
 * predictor — zero allocations means nobody is serving it.
 */
function fixtureHealthy(entry: RegistryEntry): boolean {
  if (entry.verification !== "verified") return false;
  return entry.allocations > 0;
}

/**
 * Probe one deployment. Never throws — an unreachable source is a data point,
 * not an exception, and the whole design depends on callers being able to
 * gather those data points without try/catch at every site.
 */
export async function healthCheck(
  source: Source | RegistryEntry,
  options: { transport?: Transport; timeoutMs?: number; force?: boolean } = {},
): Promise<HealthDetail> {
  const { subgraphId } = source;
  const entry = lookupEntry(subgraphId);
  const base: Source =
    "reliability" in source ? entryToSource(source) : { ...source };

  if (!options.force) {
    const hit = cachedHealth(subgraphId);
    if (hit) return hit;
  }

  const now = () => new Date().toISOString();
  const started = Date.now();

  const finish = (detail: Omit<HealthDetail, "cached">): HealthDetail => {
    const full: HealthDetail = { ...detail, cached: false };
    healthCache.set(subgraphId, { detail: full, expiresAt: Date.now() + HEALTH_TTL_MS });
    return full;
  };

  // Placeholders are not real IDs. Probing them would burn a request to learn
  // something we already know.
  if (entry?.verification === "placeholder") {
    return finish({
      source: { ...base, healthy: false, healthCheckedAt: now() },
      blockNumber: null,
      hasIndexingErrors: false,
      latencyMs: 0,
      reason: "placeholder — no deployment exists for this schema/network",
    });
  }

  // Health is a property of the deployment, not of how you pay for it. If a
  // gateway key exists we probe over it even when the fan-out will use x402 —
  // otherwise checking 31 sources costs $0.31 before a single real query.
  const probeTransport: Transport =
    options.transport === "x402" && isLive("gateway") ? "gateway" : (options.transport ?? "gateway");

  if (!isLive(probeTransport)) {
    const healthy = entry ? fixtureHealthy(entry) : true;
    return finish({
      source: { ...base, healthy, healthCheckedAt: now() },
      blockNumber: healthy ? 348_119_204 + (entry?.allocations ?? 1) * 37 : null,
      hasIndexingErrors: false,
      latencyMs: healthy ? 120 + Math.round((1 - (entry?.reliability ?? 0.5)) * 400) : 0,
      reason: healthy ? null : "no active indexer allocation (fixture)",
    });
  }

  const result = await graphQuery<{
    _meta?: { block?: { number?: number }; hasIndexingErrors?: boolean };
  }>({
    subgraphId,
    query: HEALTH_PROBE,
    transport: probeTransport,
    timeoutMs: options.timeoutMs ?? HEALTH_TIMEOUT_MS,
  });

  const latencyMs = Date.now() - started;
  const block = result.data?._meta?.block?.number ?? null;
  const healthy = block !== null;

  return finish({
    source: { ...base, healthy, healthCheckedAt: now() },
    blockNumber: block,
    hasIndexingErrors: result.data?._meta?.hasIndexingErrors ?? false,
    latencyMs,
    reason: healthy ? null : (result.errors[0] ?? "no _meta in response"),
  });
}

/**
 * Probe many deployments at once. Bounded concurrency — firing 90 requests at
 * the gateway simultaneously gets us rate-limited, which would manufacture the
 * exact failure the health check exists to detect.
 */
export async function healthCheckAll(
  sources: readonly (Source | RegistryEntry)[],
  options: { transport?: Transport; timeoutMs?: number; concurrency?: number } = {},
): Promise<HealthDetail[]> {
  const concurrency = options.concurrency ?? 12;
  const out: HealthDetail[] = new Array(sources.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= sources.length) return;
      out[i] = await healthCheck(sources[i], options);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, sources.length) }, worker),
  );
  return out;
}
