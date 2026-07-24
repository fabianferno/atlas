/**
 * Second-level fixture entities — the rows a mini app actually renders once the
 * user drills past protocol totals.
 *
 * Only the deployments the demo touches are populated. `fixtureFor` synthesises
 * a single protocol-shaped row for everything else, which is enough to keep a
 * fan-out honest without hand-writing 90 market tables.
 */
import type { Row } from "./protocols";

function market(
  id: string,
  name: string,
  symbol: string,
  supplyApy: string,
  borrowApy: string,
  tvl: string,
  deposits: string,
  borrows: string,
  ltv: string,
): Row {
  return {
    id,
    name,
    isActive: true,
    canBorrowFrom: true,
    canUseAsCollateral: true,
    maximumLTV: ltv,
    liquidationThreshold: (Number(ltv) + 5).toFixed(2),
    liquidationPenalty: "5.00",
    inputToken: { id, symbol, decimals: symbol === "USDC" ? 6 : 18 },
    rates: [
      { id: `${id}-supply`, side: "LENDER", type: "VARIABLE", rate: supplyApy },
      { id: `${id}-borrow`, side: "BORROWER", type: "VARIABLE", rate: borrowApy },
    ],
    totalValueLockedUSD: tvl,
    totalDepositBalanceUSD: deposits,
    totalBorrowBalanceUSD: borrows,
    // Utilisation is what a liquidation guard actually watches, so it is worth
    // having in the fixture rather than making the UI derive it.
    exchangeRate: "1.0",
  };
}

function pool(
  id: string,
  name: string,
  symbol: string,
  tvl: string,
  volume24h: string,
  fees: string,
  tokens: [string, string],
): Row {
  return {
    id,
    name,
    symbol,
    isSingleSided: false,
    inputTokens: [
      { id: `${id}-0`, symbol: tokens[0], decimals: tokens[0] === "USDC" ? 6 : 18 },
      { id: `${id}-1`, symbol: tokens[1], decimals: tokens[1] === "USDC" ? 6 : 18 },
    ],
    fees: [{ id: `${id}-tier`, feePercentage: fees, feeType: "FIXED_TRADING_FEE" }],
    totalValueLockedUSD: tvl,
    cumulativeVolumeUSD: (Number(volume24h) * 412).toFixed(2),
    dailyVolumeUSD: volume24h,
  };
}

/** Lending markets, keyed by subgraph ID. */
export const MARKET_FIXTURES: Record<string, Row[]> = {
  // Aave V3 Arbitrum
  "4xyasjQeREe7PxnF6wVdobZvCw5mhoHZq3T7guRpuNPf": [
    market("0x82af49447d8a07e3bd95bd0d56f35241523fbab1", "Aave Arbitrum WETH", "WETH", "1.94", "3.12", "612884220.41", "612884220.41", "244118442.90", "80.50"),
    market("0xaf88d065e77c8cc2239327c5edb3a432268e5831", "Aave Arbitrum USDC", "USDC", "4.71", "6.08", "418442110.55", "418442110.55", "281844220.31", "77.00"),
    market("0x912ce59144191c1204e64559fe8253a0e49e6548", "Aave Arbitrum ARB", "ARB", "0.42", "2.88", "148442003.19", "148442003.19", "41184402.55", "60.00"),
    market("0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f", "Aave Arbitrum WBTC", "WBTC", "0.11", "1.44", "118442110.90", "118442110.90", "18442110.31", "73.00"),
    market("0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", "Aave Arbitrum USDT", "USDT", "5.02", "6.91", "44674646.31", "44674646.31", "27884112.55", "75.00"),
  ],
  // Radiant Capital Arbitrum — the market a liquidation guard would watch
  "5HTkKJNSm72tUGakwj8yroDGHxc6fBhmLaA5oJepZGL3": [
    market("0x82af49447d8a07e3bd95bd0d56f35241523fbab1", "Radiant WETH", "WETH", "2.88", "5.41", "28442110.31", "38442110.31", "18844220.55", "80.00"),
    market("0xaf88d065e77c8cc2239327c5edb3a432268e5831", "Radiant USDC", "USDC", "7.14", "11.82", "21184402.55", "31184402.55", "14118442.09", "80.00"),
    market("0x912ce59144191c1204e64559fe8253a0e49e6548", "Radiant ARB", "ARB", "1.02", "6.44", "11811708.08", "14644490.69", "4951222.96", "65.00"),
  ],
  // Moonwell Base
  "33ex1ExmYQtwGVwri1AP3oMFPGSce6YbocBP7fWbsBrg": [
    market("0x4200000000000000000000000000000000000006", "Moonwell WETH", "WETH", "1.61", "3.04", "142884112.31", "178442110.55", "58442110.09", "81.00"),
    market("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", "Moonwell USDC", "USDC", "5.44", "7.18", "98442110.90", "124118442.31", "44118220.55", "82.00"),
    market("0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22", "Moonwell cbETH", "cbETH", "0.88", "2.41", "51792217.41", "61557667.04", "19323672.55", "75.00"),
  ],
  // Aave V3 Optimism
  "3RWFxWNstn4nP3dXiDfKi9GgBoHx7xzc7APkXs1MLEgi": [
    market("0x4200000000000000000000000000000000000006", "Aave Optimism WETH", "WETH", "1.82", "2.94", "148442110.31", "188442110.31", "68442110.55", "80.50"),
    market("0x0b2c639c533813f4aa9d7837caf62653d097ff85", "Aave Optimism USDC", "USDC", "4.44", "5.88", "104118442.55", "134118442.55", "51184402.09", "77.00"),
    market("0x4200000000000000000000000000000000000042", "Aave Optimism OP", "OP", "0.31", "2.18", "60183566.04", "75551491.76", "22253702.50", "65.00"),
  ],
};

/** DEX pools, keyed by subgraph ID. */
export const POOL_FIXTURES: Record<string, Row[]> = {
  // Uniswap V3 Arbitrum
  FQ6JYszEKApsBpAmiHesRsd9Ygc6mzmpNRANeVQFYoVX: [
    pool("0xc6962004f452be9203591991d15f6b388e09e8d0", "Uniswap V3 WETH/USDC 0.05%", "WETH/USDC", "48442110.31", "184402110.55", "0.05", ["WETH", "USDC"]),
    pool("0xc31e54c7a869b9fcbecc14363cf510d1c41fa443", "Uniswap V3 WETH/USDC 0.3%", "WETH/USDC", "18442110.90", "41184402.31", "0.30", ["WETH", "USDC"]),
    pool("0x2f5e87c9312fa29aed5c179e456625d79015299c", "Uniswap V3 WBTC/WETH 0.05%", "WBTC/WETH", "28442110.55", "38442110.09", "0.05", ["WBTC", "WETH"]),
    pool("0xc473e2aee3441bf9240be85eb122abb059a3b57c", "Uniswap V3 ARB/WETH 0.3%", "ARB/WETH", "14118442.09", "18844220.31", "0.30", ["ARB", "WETH"]),
    pool("0x641c00a822e8b671738d32a431a4fb6074e5c79d", "Uniswap V3 WETH/USDT 0.05%", "WETH/USDT", "11844220.31", "24118442.90", "0.05", ["WETH", "USDT"]),
  ],
  // Camelot V2 Arbitrum
  E6J42xXvRQGsqcMEoWRkdeJjUTsWdcHL8khuFMY6CDAM: [
    pool("0x84652bb2539513baf36e225c930fdd8eaa63ce27", "Camelot GRAIL/WETH", "GRAIL/WETH", "18442110.55", "8442110.31", "0.30", ["GRAIL", "WETH"]),
    pool("0xa6c5c7d189fa4eb5af8ba34e63dcdd3a635d433f", "Camelot WETH/USDC", "WETH/USDC", "14118442.31", "18442110.09", "0.30", ["WETH", "USDC"]),
    pool("0x913b5e7dd7d80b0be3f4e2d0d1c3e4f5a6b7c8d9", "Camelot ARB/WETH", "ARB/WETH", "8442110.09", "6118442.55", "0.30", ["ARB", "WETH"]),
  ],
  // Uniswap V3 Optimism
  EgnS9YE1avupkvCNj9fHnJxppfEmNNywYJtghqiu2pd9: [
    pool("0x85149247691df622eaf1a8bd0cafd40bc45154a9", "Uniswap V3 WETH/USDC 0.05%", "WETH/USDC", "21184402.55", "48442110.31", "0.05", ["WETH", "USDC"]),
    pool("0x68f5c0a2de713a54991e01858fd27a3832401849", "Uniswap V3 WETH/OP 0.3%", "WETH/OP", "8442110.31", "11844220.09", "0.30", ["WETH", "OP"]),
  ],
  // SushiSwap Arbitrum
  "9tSS5FaePZnjmnXnSKCCqKVLAqA6eGg6jA2oRojsXUbP": [
    pool("0x905dfcd5649217c42684f23958568e533c711aa3", "SushiSwap WETH/USDC", "WETH/USDC", "4118442.09", "2884112.31", "0.30", ["WETH", "USDC"]),
    pool("0x3221022e37029923ace4235d812273c5a42c322d", "SushiSwap WETH/WBTC", "WETH/WBTC", "2884112.55", "1184402.09", "0.30", ["WETH", "WBTC"]),
  ],
  // GMX Arbitrum — a perp venue's liquidity pool, same root field
  DiR5cWwB3pwXXQWWdus7fDLR2mnFRQLiBFsVmHAH9VAs: [
    pool("0x489ee077994b6658eafa855c308275ead8097c4a", "GMX GLP", "GLP", "487312904.77", "884112003.31", "0.10", ["GLP", "USDC"]),
  ],
};
