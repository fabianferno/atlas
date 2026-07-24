/**
 * Fixture protocol rows, keyed by subgraph ID.
 *
 * Shapes match what graph-node actually returns for a Messari standardized
 * schema — BigDecimal comes back as a string, Int as a number. Getting that
 * wrong would mean the composer works against fixtures and breaks the moment a
 * key is added, which is the single most expensive bug this file can contain.
 *
 * Numbers are plausible mid-2026 figures for the named protocols. They appear
 * in the demo video, so they read as real, but nobody should quote them.
 */

export type Row = Record<string, unknown>;

export interface ProtocolFixture {
  protocol: Row;
  markets?: Row[];
  liquidityPools?: Row[];
  vaults?: Row[];
  pools?: Row[];
}

interface Core {
  id: string;
  name: string;
  slug: string;
  network: string;
  type: string;
  schemaVersion: string;
  tvl: string;
  revenue: string;
  users: number;
  pools: number;
  extra?: Row;
}

function protocol(c: Core): Row {
  const total = Number(c.revenue);
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    network: c.network,
    type: c.type,
    schemaVersion: c.schemaVersion,
    subgraphVersion: "1.3.0",
    methodologyVersion: "1.0.0",
    totalValueLockedUSD: c.tvl,
    cumulativeSupplySideRevenueUSD: (total * 0.72).toFixed(2),
    cumulativeProtocolSideRevenueUSD: (total * 0.28).toFixed(2),
    cumulativeTotalRevenueUSD: c.revenue,
    cumulativeUniqueUsers: c.users,
    totalPoolCount: c.pools,
    ...c.extra,
  };
}

/** DEX AMM protocols carry cumulative volume; lending carries balances. Keeping
 *  the family extras in one place makes the divergence obvious. */
function dex(c: Core & { volume: string }): ProtocolFixture {
  return { protocol: protocol({ ...c, extra: { cumulativeVolumeUSD: c.volume, ...c.extra } }) };
}

function lending(
  c: Core & { deposits: string; borrows: string; liquidations: string },
): ProtocolFixture {
  return {
    protocol: protocol({
      ...c,
      extra: {
        totalDepositBalanceUSD: c.deposits,
        cumulativeDepositUSD: (Number(c.deposits) * 6.4).toFixed(2),
        totalBorrowBalanceUSD: c.borrows,
        cumulativeBorrowUSD: (Number(c.borrows) * 8.1).toFixed(2),
        cumulativeLiquidateUSD: c.liquidations,
        openPositionCount: Math.round(c.users * 0.11),
        totalPoolCount: c.pools,
        ...c.extra,
      },
    }),
  };
}

function perp(c: Core & { volume: string; openInterest: string }): ProtocolFixture {
  return {
    protocol: protocol({
      ...c,
      extra: {
        cumulativeVolumeUSD: c.volume,
        // The perp schema splits open interest by side and has no combined
        // field. Emitting one here would work in fixtures and 404 live.
        longOpenInterestUSD: (Number(c.openInterest) * 0.54).toFixed(2),
        shortOpenInterestUSD: (Number(c.openInterest) * 0.46).toFixed(2),
        ...c.extra,
      },
    }),
  };
}

function bridge(c: Core & { exported: string; transfers: number }): ProtocolFixture {
  return {
    protocol: protocol({
      ...c,
      extra: {
        totalValueExportedUSD: c.exported,
        totalValueLockedUSD: c.tvl,
        cumulativeTransactionCount: c.transfers,
        totalPoolCount: c.pools,
        ...c.extra,
      },
    }),
  };
}

function plain(c: Core): ProtocolFixture {
  return { protocol: protocol(c) };
}

/** The NFT marketplace schema has no `Protocol` interface — `Marketplace` is a
 *  standalone entity with ETH-denominated fields. Different shape, on purpose. */
function marketplace(
  c: Omit<Core, "tvl" | "revenue"> & {
    tradeVolumeUsd: string;
    revenueUsd: string;
    collections: number;
    trades: number;
  },
): ProtocolFixture {
  const eth = 3120;
  return {
    protocol: {
      id: c.id,
      name: c.name,
      slug: c.slug,
      network: c.network,
      schemaVersion: c.schemaVersion,
      subgraphVersion: "1.0.0",
      methodologyVersion: "1.0.0",
      collectionCount: c.collections,
      tradeCount: c.trades,
      cumulativeTradeVolumeETH: (Number(c.tradeVolumeUsd) / eth).toFixed(4),
      cumulativeTradeVolumeUSD: c.tradeVolumeUsd,
      marketplaceRevenueUSD: (Number(c.revenueUsd) * 0.42).toFixed(2),
      creatorRevenueUSD: (Number(c.revenueUsd) * 0.58).toFixed(2),
      totalRevenueUSD: c.revenueUsd,
      cumulativeUniqueTraders: c.users,
    },
  };
}

const ARB = "ARBITRUM_ONE";
const OPT = "OPTIMISM";
const BAS = "BASE";
const ETH = "MAINNET";

export const PROTOCOL_FIXTURES: Record<string, ProtocolFixture> = {
  // ---- lending · Arbitrum ------------------------------------------------
  "4xyasjQeREe7PxnF6wVdobZvCw5mhoHZq3T7guRpuNPf": lending({
    id: "0xa97684ead0e402dc232d5a977953df7ecbab3cdb", name: "Aave V3", slug: "aave-v3",
    network: ARB, type: "LENDING", schemaVersion: "3.1.0",
    tvl: "1342885091.36", revenue: "48221904.77", users: 428551, pools: 21,
    deposits: "1718402993.71", borrows: "612774418.02", liquidations: "94118220.45",
  }),
  "5MjRndNWGhqvNX7chUYLQDnvEgc8DaH8eisEkcJt71SR": lending({
    id: "0xa5edbdd9646f8dff606d7448e414884c7d905dca", name: "Compound V3", slug: "compound-v3",
    network: ARB, type: "LENDING", schemaVersion: "3.1.0",
    tvl: "142719884.05", revenue: "6118220.31", users: 41208, pools: 3,
    deposits: "168440102.19", borrows: "68440102.19", liquidations: "4118033.90",
  }),
  "5HTkKJNSm72tUGakwj8yroDGHxc6fBhmLaA5oJepZGL3": lending({
    id: "0x2032b9a8e9f7e76768ca9271003d3e43e1616b1f", name: "Radiant Capital", slug: "radiant-capital",
    network: ARB, type: "LENDING", schemaVersion: "3.1.0",
    tvl: "61438220.94", revenue: "3841220.18", users: 92418, pools: 12,
    deposits: "84271003.55", borrows: "37913884.60", liquidations: "12844902.33",
  }),
  "2rQAKGJkvkiAXsCjx1n4E3DSgk2b7nCZMtt2BrV5TBgt": lending({
    id: "0xf4b1486dd74d07706052a33d31d7c0aafd0659e1", name: "Radiant Capital V2", slug: "radiant-capital-v2",
    network: ARB, type: "LENDING", schemaVersion: "3.1.0",
    tvl: "48119203.42", revenue: "2914880.05", users: 71204, pools: 11,
    deposits: "66118442.19", borrows: "29844112.77", liquidations: "9118220.14",
  }),
  "3m97d2dJ2pXwPFuiHrm8T37V9TCoAHBpMqRwdguyUZXF": lending({
    id: "0x0acb0b8a80a09e2e10b4b1b78e08c74b4b1b8ba6", name: "Abracadabra", slug: "abracadabra",
    network: ARB, type: "LENDING", schemaVersion: "2.0.1",
    tvl: "12844112.09", revenue: "884112.44", users: 18442, pools: 4,
    deposits: "18442110.55", borrows: "8114220.31", liquidations: "3841002.19",
  }),
  "GzHkVNf7BBqUjV8Sy6U6xUaWdGheFMdin1cB6sNvfdzs": lending({
    id: "0xbadadd538ef3b9ce8a8ea0b25c53a45bb2c8e0a2", name: "Cream Finance", slug: "cream-finance",
    network: ARB, type: "LENDING", schemaVersion: "2.0.1",
    tvl: "1184402.77", revenue: "84220.11", users: 6142, pools: 8,
    deposits: "1644220.03", borrows: "684112.90", liquidations: "412884.22",
  }),
  "Dpk4Gen22wxQ3Laojf7DR2me8wGzjaHwjsKAsLf2rCFV": lending({
    id: "0x8e7e9ea9023b81457ae7e6d2a51b003d421e5408", name: "dForce", slug: "dforce",
    network: ARB, type: "LENDING", schemaVersion: "2.0.1",
    tvl: "8442110.36", revenue: "441022.18", users: 12884, pools: 9,
    deposits: "11844220.91", borrows: "4118442.07", liquidations: "884112.55",
  }),
  "HnV3fhwsWfmQGdD2AeGzqvRVTDBqnMH74jCsDVq1DXYP": lending({
    id: "0x4b8a1fb47baba8d0aca8ff2ee62c50e9f9b5c1d6", name: "Rari Fuse", slug: "rari-fuse",
    network: ARB, type: "LENDING", schemaVersion: "2.0.1",
    tvl: "418442.12", revenue: "28114.66", users: 2118, pools: 5,
    deposits: "584112.30", borrows: "184402.55", liquidations: "94118.02",
  }),
  zGuPrsVqtY5ehJDCmweb9ZnBrae3tSQWRux8Mz1M4Gn: lending({
    id: "0xa4b8e9dbbb2f6d3f1de9c8b0f0d1a1e4a7b1c2d3", name: "Vesta Finance", slug: "vesta-finance",
    network: ARB, type: "LENDING", schemaVersion: "2.0.1",
    tvl: "2114880.44", revenue: "118442.19", users: 8442, pools: 6,
    deposits: "2884112.75", borrows: "1184402.31", liquidations: "441880.09",
  }),
  Duw2tSACo9uRGFctAGsCc9pF7ZGMyqpjkAHPwm49dZe6: lending({
    id: "0x3f9e6e7f27b4c1b0a1e9d0f8b6a5c4d3e2f1a0b9", name: "QiDao", slug: "qidao",
    network: ARB, type: "LENDING", schemaVersion: "1.3.0",
    tvl: "6118442.88", revenue: "214880.33", users: 14402, pools: 7,
    deposits: "8442110.20", borrows: "3118442.65", liquidations: "1184402.18",
  }),

  // ---- lending · Optimism / Base ----------------------------------------
  "3RWFxWNstn4nP3dXiDfKi9GgBoHx7xzc7APkXs1MLEgi": lending({
    id: "0x794a61358d6845594f94dc1db02a252b5b4814ad", name: "Aave V3", slug: "aave-v3",
    network: OPT, type: "LENDING", schemaVersion: "3.1.0",
    tvl: "312744118.90", revenue: "11844220.51", users: 214880, pools: 18,
    deposits: "398112044.62", borrows: "141880223.14", liquidations: "24118442.90",
  }),
  DQqb7FiQ1joLhESkAwvAYiuXhwfz4zf6qHmbt7stnec8: lending({
    id: "0x60cf091cd3f50420d50fd7f707414d0df4751c58", name: "Sonne Finance", slug: "sonne-finance",
    network: OPT, type: "LENDING", schemaVersion: "2.0.1",
    tvl: "8114993.20", revenue: "384112.07", users: 18442, pools: 11,
    deposits: "11184402.36", borrows: "4118220.14", liquidations: "2884112.55",
  }),
  "6AmkakXwadWiZ2jN7oJcFreWmKG1nZrT5P8om52upYPd": lending({
    id: "0xe1cf09bda2e089c63330f0ffe3f6d6b790835973", name: "dForce", slug: "dforce",
    network: OPT, type: "LENDING", schemaVersion: "2.0.1",
    tvl: "3118442.09", revenue: "144802.31", users: 6118, pools: 7,
    deposits: "4118220.55", borrows: "1884112.03", liquidations: "418442.90",
  }),
  "33ex1ExmYQtwGVwri1AP3oMFPGSce6YbocBP7fWbsBrg": lending({
    id: "0xfbb21d0380bee3312b33c4353c8936a0f13ef26c", name: "Moonwell", slug: "moonwell",
    network: BAS, type: "LENDING", schemaVersion: "2.0.1",
    tvl: "293118440.62", revenue: "9884112.44", users: 318442, pools: 16,
    deposits: "364118220.90", borrows: "121884003.19", liquidations: "18442110.33",
  }),
  "2u4mWUV4xS19ef1MbnxZHWLLMwdPxtVifH46JbonXwXP": lending({
    id: "0x8f44fd754285aa6a2b8b9b97739b79746e0475a7", name: "Seamless Protocol", slug: "seamless-protocol",
    network: BAS, type: "LENDING", schemaVersion: "3.1.0",
    tvl: "44118203.77", revenue: "1884112.09", users: 48442, pools: 12,
    deposits: "58442110.31", borrows: "21184402.66", liquidations: "3841220.18",
  }),
  D7mapexM5ZsQckLJai2FawTKXJ7CqYGKM8PErnS3cJi9: lending({
    id: "0xa238dd80c259a72e81d7e4664a9801593f98d1c5", name: "Aave V3", slug: "aave-v3",
    network: BAS, type: "LENDING", schemaVersion: "3.1.0",
    tvl: "418663104.28", revenue: "14118442.90", users: 388114, pools: 14,
    deposits: "521884220.55", borrows: "182004113.55", liquidations: "21844112.07",
  }),
  "9NHJ9k31qaGCYXppm9isJTiEoiB6v3tJDnR6SrQrxcjw": lending({
    id: "0x1c9f9e3a4b5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f", name: "QiDao", slug: "qidao",
    network: BAS, type: "LENDING", schemaVersion: "1.3.0",
    tvl: "1188442.10", revenue: "48114.22", users: 4118, pools: 5,
    deposits: "1644220.31", borrows: "618442.09", liquidations: "184402.55",
  }),
  JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk: lending({
    id: "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2", name: "Aave V3", slug: "aave-v3",
    network: ETH, type: "LENDING", schemaVersion: "3.1.0",
    tvl: "9184220113.45", revenue: "284118442.90", users: 1184402, pools: 34,
    deposits: "11884220113.07", borrows: "4118442003.31", liquidations: "684112220.55",
  }),
  AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9: lending({
    id: "0xc3d688b66703497daa19211eedff47f25384cdc3", name: "Compound V3", slug: "compound-v3",
    network: ETH, type: "LENDING", schemaVersion: "3.1.0",
    tvl: "1284119004.72", revenue: "44118220.31", users: 218442, pools: 5,
    deposits: "1584220113.90", borrows: "618442003.55", liquidations: "88442110.18",
  }),
  GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si: lending({
    id: "0xc13e21b648a5ee794902342038ff3adab66be987", name: "Spark Lend", slug: "spark-lend",
    network: ETH, type: "LENDING", schemaVersion: "3.1.0",
    tvl: "3841220113.66", revenue: "94118220.42", users: 118442, pools: 17,
    deposits: "4884112003.19", borrows: "2184402113.90", liquidations: "184402110.31",
  }),
  "8sE6rTNkPhzZXZC6c8UQy2ghFTu5PPdGauwUBm4t7HZ1": lending({
    id: "0x35d1b3f3d7966a1dfe207aa4514c12a259a0492b", name: "MakerDAO", slug: "makerdao",
    network: ETH, type: "LENDING", schemaVersion: "2.0.1",
    tvl: "5118442003.28", revenue: "184402110.55", users: 88442, pools: 42,
    deposits: "6844112003.90", borrows: "3118442113.07", liquidations: "884112220.31",
  }),
  "2D2dFCLjUt3MfFgTKW8cBxiRQ3Adss7KUtYh2rTcFVY": lending({
    id: "0x24179cd81c9e782a4096035f7ec97fb8b783e007", name: "Liquity", slug: "liquity",
    network: ETH, type: "LENDING", schemaVersion: "2.0.1",
    tvl: "618442003.11", revenue: "18442110.90", users: 24118, pools: 1,
    deposits: "784112003.55", borrows: "384112220.19", liquidations: "94118442.33",
  }),

  // ---- dex-amm ------------------------------------------------------------
  "9tSS5FaePZnjmnXnSKCCqKVLAqA6eGg6jA2oRojsXUbP": dex({
    id: "0xc35dadb65012ec5796536bd9864ed8773abc74c4", name: "SushiSwap", slug: "sushiswap",
    network: ARB, type: "EXCHANGE", schemaVersion: "1.3.2",
    tvl: "9642118.77", revenue: "85251998.70", users: 512884, pools: 1893,
    volume: "28417332901.05",
  }),
  E6J42xXvRQGsqcMEoWRkdeJjUTsWdcHL8khuFMY6CDAM: dex({
    id: "0x6eccab422d763ac031210895c81787e87b43a652", name: "Camelot V2", slug: "camelot-v2",
    network: ARB, type: "EXCHANGE", schemaVersion: "1.3.2",
    tvl: "48219640.13", revenue: "44790765.35", users: 386214, pools: 812,
    volume: "14930255118.44",
  }),
  H36tAWQeYVioE4hHtaKJEMJMxwzVJWjfg2mimva2wcUj: dex({
    id: "0x9cd0a4b16d92a5b3a6ff6ad9a5b6a4a0a1c7d8e9", name: "Saddle Finance", slug: "saddle-finance",
    network: ARB, type: "EXCHANGE", schemaVersion: "1.3.0",
    tvl: "1104882.19", revenue: "3249783.60", users: 24118, pools: 14,
    volume: "812445901.33",
  }),
  A4Y1A82YhSLTn998BVVELC8eWzhi992k4ZitByvssxqA: dex({
    id: "0xf1046053aa5682b4f9a81b5481394da16be5ff5a", name: "Velodrome V2", slug: "velodrome-finance-v2",
    network: OPT, type: "EXCHANGE", schemaVersion: "1.3.0",
    tvl: "128940113.77", revenue: "83760446.22", users: 418442, pools: 1204,
    volume: "41880223114.02",
  }),
  CFu1DWY9DyiC25WRmGreowMyuvLB27JfNRCa8rKkTDjK: dex({
    id: "0x5c1b1a5b0b0e6b7f8a9c0d1e2f3a4b5c6d7e8f90", name: "Saddle Finance", slug: "saddle-finance",
    network: OPT, type: "EXCHANGE", schemaVersion: "1.3.0",
    tvl: "418442.09", revenue: "1184402.55", users: 8114, pools: 9,
    volume: "296100637.50",
  }),
  "77jZ9KWeyi3CJ96zkkj5s1CojKPHt6XJKjLFzsDCd8Fd": dex({
    id: "0xc0aee478e3658e2610c5f7a4a2e1777ce9e4f2ac", name: "SushiSwap", slug: "sushiswap",
    network: ETH, type: "EXCHANGE", schemaVersion: "1.3.2",
    tvl: "184402110.31", revenue: "684112220.90", users: 1884402, pools: 3418,
    volume: "228037406963.33",
  }),
  "794H6CNzdGF5YfBK9nPsUgGn7EBbdJSCTjgcKPEPyFnn": dex({
    id: "0xba12222222228d8ba445958a75a0704d566bf2c8", name: "Balancer V2", slug: "balancer-v2",
    network: ETH, type: "EXCHANGE", schemaVersion: "1.3.0",
    tvl: "884112003.42", revenue: "184402110.18", users: 418442, pools: 1884,
    volume: "184402110033.55",
  }),
  "3fy93eAT56UJsRCEht8iFhfi6wjHWXtZ9dnnbQmvFopF": dex({
    id: "0xb9fc157394af804a3578134a6585c0dc9cc990d4", name: "Curve Finance", slug: "curve-finance",
    network: ETH, type: "EXCHANGE", schemaVersion: "1.3.0",
    tvl: "1884402110.07", revenue: "284112003.31", users: 618442, pools: 984,
    volume: "418442110033.90",
  }),

  // ---- dex-amm-extended ---------------------------------------------------
  FQ6JYszEKApsBpAmiHesRsd9Ygc6mzmpNRANeVQFYoVX: dex({
    id: "0x1f98431c8ad98523631ae4a59f267346ea31f984", name: "Uniswap V3", slug: "uniswap-v3",
    network: ARB, type: "EXCHANGE", schemaVersion: "4.0.1",
    tvl: "214812934.42", revenue: "1238021673.61", users: 1842331, pools: 4127,
    volume: "412673891204.18",
  }),
  "3oHCddbQGTi42kPZBwyGzD2JzZR33zK2MwXtxAerNJy2": dex({
    id: "0x1af415a1eba07a4986a52b6f2e7de7003d82231e", name: "SushiSwap V3", slug: "sushiswap-v3",
    network: ARB, type: "EXCHANGE", schemaVersion: "4.0.1",
    tvl: "6104233.58", revenue: "27644641.66", users: 118402, pools: 641,
    volume: "9214880553.72",
  }),
  EgnS9YE1avupkvCNj9fHnJxppfEmNNywYJtghqiu2pd9: dex({
    id: "0x1f98431c8ad98523631ae4a59f267346ea31f984", name: "Uniswap V3", slug: "uniswap-v3",
    network: OPT, type: "EXCHANGE", schemaVersion: "4.0.1",
    tvl: "71284993.10", revenue: "264342660.99", users: 618442, pools: 2118,
    volume: "88114220331.86",
  }),
  "4cKy6QQMc5tpfdx8yxfYeb9TLZmgLQe44ddW1G7NwkA6": dex({
    id: "0x1f98431c8ad98523631ae4a59f267346ea31f984", name: "Uniswap V3", slug: "uniswap-v3",
    network: ETH, type: "EXCHANGE", schemaVersion: "4.0.0",
    tvl: "3184220113.90", revenue: "5712354660.99", users: 6184402, pools: 18442,
    volume: "1904118220331.55",
  }),
  JAGXF8B14mpB8QGKnwhKTs5JxsQZBJQvbDGFcWwL7gbm: dex({
    id: "0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865", name: "PancakeSwap V3", slug: "pancakeswap-v3",
    network: ETH, type: "EXCHANGE", schemaVersion: "4.0.1",
    tvl: "184402110.55", revenue: "418442110.31", users: 884112, pools: 2884,
    volume: "139480703443.66",
  }),

  // ---- perp-futures -------------------------------------------------------
  DiR5cWwB3pwXXQWWdus7fDLR2mnFRQLiBFsVmHAH9VAs: perp({
    id: "0x489ee077994b6658eafa855c308275ead8097c4a", name: "GMX", slug: "gmx",
    network: ARB, type: "PERPETUAL", schemaVersion: "1.3.4",
    tvl: "487312904.77", revenue: "1613488639.21", users: 611402, pools: 1,
    volume: "268914773201.55", openInterest: "204118844.90",
  }),
  AMh1u4wCbz8Jybs4Nf7uGBdU9dz2C8mJkH1Aocz6HXUf: perp({
    id: "0x3e0199792ce69dc29a0a36146bfa68bd7c8d6633", name: "MUX Protocol", slug: "mux-protocol",
    network: ARB, type: "PERPETUAL", schemaVersion: "1.3.1",
    tvl: "18420111.03", revenue: "84112220.31", users: 48442, pools: 1,
    volume: "18442110033.90", openInterest: "11844220.55",
  }),
  "5sbJJTTJQQ4kYuVYNBVw9sX8C5juRpVJNLHg7uFugw2e": perp({
    id: "0x8234f990b149ae59416dc260305e565e5dafeb54", name: "Kwenta", slug: "kwenta",
    network: OPT, type: "PERPETUAL", schemaVersion: "1.3.4",
    tvl: "38114002.55", revenue: "629292714.02", users: 118442, pools: 1,
    volume: "104882119003.42", openInterest: "44118220.31",
  }),
  "7hUM4US9DPz6JqLD6ySqwFmLq4XiAF7cEZLmEesQnYgR": perp({
    id: "0x2ffc2f45c7b58f0b1f1e21d0b0e4b0b0e4b0b0e4", name: "MUX Protocol", slug: "mux-protocol",
    network: OPT, type: "PERPETUAL", schemaVersion: "1.3.1",
    tvl: "4118442.09", revenue: "18442110.55", users: 12884, pools: 1,
    volume: "4118442003.31", openInterest: "2884112.90",
  }),

  // ---- options ------------------------------------------------------------
  "3zUv74ekxpiy92MQ2MwemR8fJhjvgyBFaGzQLkYHmaUy": plain({
    id: "0x7c06792af1632e77cb27a558dc0885338f4bdf8e", name: "Opyn Gamma", slug: "opyn-gamma",
    network: ETH, type: "OPTION", schemaVersion: "1.3.2",
    tvl: "18442110.55", revenue: "4118442.31", users: 8442, pools: 118,
  }),

  // ---- bridge -------------------------------------------------------------
  DWo7jrtpTtUM1buqiCUg7j7XUF568qNPBv7FwwDceuxm: bridge({
    id: "0x53bf833a5d6c4dda888f69c22c88c9f356a41614", name: "Stargate", slug: "stargate",
    network: ARB, type: "BRIDGE", schemaVersion: "1.1.0",
    tvl: "92418773.21", revenue: "18442110.55", users: 418442, pools: 8,
    exported: "18442110033.90", transfers: 2884112,
  }),
  "3rg6ZtwNUMpBrM1uSUtNqcbc6tGfyY2WLheDGSc5qMzX": bridge({
    id: "0xe35e9842fceaca96570b734083f4a58e8f7c5f2a", name: "Across V2", slug: "across-v2",
    network: ARB, type: "BRIDGE", schemaVersion: "1.2.0",
    tvl: "24118904.42", revenue: "8442110.31", users: 218442, pools: 6,
    exported: "8442110033.55", transfers: 1184402,
  }),
  "4xY1CAbwQA7oq3a78CX8mgKFvMoZzPsv21A92Hm7rEvv": bridge({
    id: "0x3749c4f034022c39ecaffaba182555d4508caccc", name: "Hop Protocol", slug: "hop-protocol",
    network: ARB, type: "BRIDGE", schemaVersion: "1.2.0",
    tvl: "11844021.77", revenue: "4118442.09", users: 118442, pools: 5,
    exported: "4118442003.31", transfers: 684112,
  }),
  "7NAF7ZtNtJiXkfCFkTSAyFbfLLfUFa55UgK5woxPxZ46": bridge({
    id: "0xb0d502e938ed5f4df2e681fe6e419ff29631d62b", name: "Stargate", slug: "stargate",
    network: OPT, type: "BRIDGE", schemaVersion: "1.1.0",
    tvl: "48442110.31", revenue: "9118442.55", users: 284112, pools: 7,
    exported: "9884112003.19", transfers: 1884402,
  }),
  "4aUWDFLz4sVYKZDw4JDJLk8vjify1Rqij7UGFozNxA8k": bridge({
    id: "0x4200000000000000000000000000000000000010", name: "Optimism Bridge V2", slug: "optimism-bridge-v2",
    network: OPT, type: "BRIDGE", schemaVersion: "1.2.0",
    tvl: "884112003.90", revenue: "0.00", users: 884112, pools: 1,
    exported: "18442110033.31", transfers: 4118442,
  }),
  KoMGmd2d1VMukusmf98SdWCSKH5ZP5UEUDHKrKpY74D: bridge({
    id: "0x83f6244bd87662118d96d9a6d44f09dfff14b30e", name: "Hop Protocol", slug: "hop-protocol",
    network: OPT, type: "BRIDGE", schemaVersion: "1.2.0",
    tvl: "8442110.55", revenue: "2884112.31", users: 94118, pools: 5,
    exported: "2884112003.90", transfers: 418442,
  }),
  GY9s64KVsRkW4Q8pCBKQePyDdcUV1TV1ArWFzvMv2qVb: bridge({
    id: "0x6f26bf09b1c792e3228e5467807a900a503c0281", name: "Across V2", slug: "across-v2",
    network: OPT, type: "BRIDGE", schemaVersion: "1.2.0",
    tvl: "14118442.09", revenue: "4884112.55", users: 148442, pools: 6,
    exported: "5118442003.31", transfers: 784112,
  }),
  "4amk8rvTHgxSobsFKsr5jheHsDzLcwyqc8vHhNC1xhGt": bridge({
    id: "0xaf54be5b6eec24d6bfacf1cce4eaf680a8239398", name: "Stargate", slug: "stargate",
    network: BAS, type: "BRIDGE", schemaVersion: "1.1.0",
    tvl: "38114993.22", revenue: "7118442.09", users: 218442, pools: 5,
    exported: "7884112003.55", transfers: 1418442,
  }),
  "34kdiaZVpPsStQdsh5xFhrZdsZvZYJGfhJ7SVGWY2Y8g": bridge({
    id: "0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5", name: "Across V2", slug: "across-v2",
    network: ETH, type: "BRIDGE", schemaVersion: "1.2.0",
    tvl: "118442003.31", revenue: "28442110.90", users: 618442, pools: 8,
    exported: "28442110033.55", transfers: 3184402,
  }),
  G1pPbbMjwCnFiyMherq8wqfMusZDriLMqvGBHLr2wS34: bridge({
    id: "0x8731d54e9d02c286767d56ac03e8037c07e01e98", name: "Stargate", slug: "stargate",
    network: ETH, type: "BRIDGE", schemaVersion: "1.1.0",
    tvl: "284112003.90", revenue: "48442110.31", users: 884112, pools: 9,
    exported: "48442110033.19", transfers: 4884112,
  }),

  // ---- yield-aggregator ---------------------------------------------------
  G3JZhmKKHC4mydRzD6kSz5fCWve5WDYYCyTFSJyv3SD5: plain({
    id: "0x1c6f0a1e4a2a1a1b1c1d1e1f2a2b2c2d2e2f3a3b", name: "Yearn V2", slug: "yearn-v2",
    network: ARB, type: "YIELD", schemaVersion: "1.3.0",
    tvl: "4812993.18", revenue: "884112.55", users: 6118, pools: 12,
  }),
  "6yqMWioX8XNx2aMDYJGnvrVQWNrZfgBzY3ee1RmkXh5Z": plain({
    id: "0x2845cd8d0b8d5ac9d8f9b6b9d9b6b9d9b6b9d9b6", name: "Arrakis Finance", slug: "arrakis-finance",
    network: OPT, type: "YIELD", schemaVersion: "1.3.0",
    tvl: "2118443.90", revenue: "418442.31", users: 3184, pools: 28,
  }),
  "7rFZ2x6aLQ7EZsNx8F5yenk4xcqwqR3Dynf9rdixCSME": plain({
    id: "0xf403c135812408bfbe8713b5a23a04b3d48aae31", name: "Convex Finance", slug: "convex-finance",
    network: ETH, type: "YIELD", schemaVersion: "1.3.0",
    tvl: "1184402110.55", revenue: "184402110.31", users: 118442, pools: 184,
  }),
  FDLuaz69DbMADuBjJDEcLnTuPnjhZqNbFVrkNiBLGkEg: plain({
    id: "0x50c1a2ea0a861a967d9d0ffe2ae4012c2e053804", name: "Yearn V2", slug: "yearn-v2",
    network: ETH, type: "YIELD", schemaVersion: "1.3.0",
    tvl: "418442110.90", revenue: "88442110.55", users: 84112, pools: 118,
  }),
  Crag42fFb8PrXnbTjHe1UG5KjgzoiUJbqwzJxZ1W8XNJ: plain({
    id: "0x1d0b1c0e4c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f", name: "Ribbon Finance", slug: "ribbon-finance",
    network: ETH, type: "YIELD", schemaVersion: "1.3.1",
    tvl: "44118442.31", revenue: "18442110.09", users: 28442, pools: 24,
  }),

  // ---- generic ------------------------------------------------------------
  "6CdJfr35PDj8AMQikiKGjAUPG2vCu5VLYRawDk8cxwrs": plain({
    id: "0x35ff0e9c8a7bcd5e5b2c1d3e4f5a6b7c8d9e0f1a", name: "Livepeer", slug: "livepeer",
    network: ARB, type: "GENERIC", schemaVersion: "2.1.1",
    tvl: "218441093.55", revenue: "8442110.31", users: 118442, pools: 1,
  }),
  HCzjsuU3dW7V6Z2BP4ncyzkkKYi3QXeuJFaboSak2U7V: plain({
    id: "0x59d9356e565ab3a36dd77763fc0d87feaf85508c", name: "Mountain Protocol", slug: "mountain-protocol",
    network: OPT, type: "GENERIC", schemaVersion: "3.0.0",
    tvl: "48442110.09", revenue: "1184402.55", users: 4118, pools: 1,
  }),

  // ---- nft-marketplace ----------------------------------------------------
  HdVdERFUe8h61vm2fDyycHgxjsde5PbB832NHgJfZNqK: marketplace({
    id: "0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb", name: "CryptoPunks", slug: "cryptopunks",
    network: ETH, type: "NFT_MARKETPLACE", schemaVersion: "1.0.0", users: 6118, pools: 1,
    tradeVolumeUsd: "3184220113.55", revenueUsd: "0.00", collections: 1, trades: 24118,
  }),
  "2GmLsgYGWoFoouZzKjp8biYDkfmeLTkEY3VDQyZqSJHA": marketplace({
    id: "0x00000000000000adc04c56bf30ac9d3c0aaf14dc", name: "OpenSea Seaport", slug: "opensea-seaport",
    network: ETH, type: "NFT_MARKETPLACE", schemaVersion: "1.0.0", users: 2884112, pools: 118442,
    tradeVolumeUsd: "38442110033.19", revenueUsd: "884112003.31", collections: 118442, trades: 18442110,
  }),
  FsT2DES8UdhfDkXCtE56h5WCDrrSXrtJiSMgNWvSdyYL: marketplace({
    id: "0x59728544b08ab483533076417fbbb2fd0b17ce3a", name: "LooksRare", slug: "looksrare",
    network: ETH, type: "NFT_MARKETPLACE", schemaVersion: "1.0.0", users: 418442, pools: 18442,
    tradeVolumeUsd: "6118442003.90", revenueUsd: "118442003.90", collections: 18442, trades: 2884112,
  }),
  "3cMswgcjkpLmuF99ViQRZfCPRyCsnimqQsR9z6mY5e2i": marketplace({
    id: "0x74312363e45dcaba76c59ec49a7aa8a65a67eed3", name: "X2Y2", slug: "x2y2",
    network: ETH, type: "NFT_MARKETPLACE", schemaVersion: "1.0.0", users: 184402, pools: 8442,
    tradeVolumeUsd: "1884402110.55", revenueUsd: "44118442.55", collections: 8442, trades: 884112,
  }),
};
