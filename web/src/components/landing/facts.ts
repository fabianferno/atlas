/**
 * Every figure the landing page prints, in one module.
 *
 * The rule this file exists to enforce: if the code holds a number, the page
 * reads the code. A landing page that retypes counts out of the README is one
 * `pnpm seed:live` away from asserting something that is no longer true, and
 * this particular product spends its whole voice on not doing that.
 *
 * What cannot be derived — block heights, transaction hashes, attestation ids —
 * is pinned here as a constant WITH the script that measured it and the date,
 * and the page labels those as a recorded run rather than a live reading.
 */
import liveSeed from "@/lib/kit/seed-live.generated.json";
import { SOURCE_REGISTRY, registryCoverage } from "@/lib/kit/sources";
import { LIVE_SEED_AT, LIVE_SEED_COUNT, SEED_DECLARED_COUNT, SEED_DROPPED } from "@/lib/seed";

const snapshot = liveSeed as unknown as {
  generatedAt?: string;
  totalCostUsd?: number;
};

/* ── derived: the source registry ──────────────────────────────────────── */

const VERIFIED = SOURCE_REGISTRY.filter((e) => e.verification === "verified");

export const REGISTRY = {
  /** Every row in the registry, including placeholders for gaps we know about. */
  entries: SOURCE_REGISTRY.length,
  /** Rows whose deployment id was confirmed by the network crawl. */
  verified: VERIFIED.length,
  /** Families the registry declares at all. */
  familiesDeclared: new Set(SOURCE_REGISTRY.map((e) => e.schema)).size,
  /**
   * Families with at least one non-placeholder deployment. `registryCoverage()`
   * skips placeholders, so its key count is exactly this and stays right if the
   * registry gains a family that turns out to have no live deployment.
   */
  familiesLive: Object.keys(registryCoverage()).length,
  networks: [...new Set(VERIFIED.map((e) => e.network))] as readonly string[],
} as const;

/* ── derived: the seed snapshot ────────────────────────────────────────── */

export const SEED = {
  /** Seed apps the snapshot could measure. */
  live: LIVE_SEED_COUNT,
  /** Seed apps declared, measured or not. The denominator. */
  declared: SEED_DECLARED_COUNT,
  /** Named, because "13 of 16" without the names is a number nobody can check. */
  dropped: SEED_DROPPED,
  measuredAt: LIVE_SEED_AT,
  /** What re-measuring every declared app cost, last run. */
  totalCostUsd: snapshot.totalCostUsd ?? 0,
} as const;

/* ── pinned: measured runs, not live readings ──────────────────────────── */

/**
 * The reference fan-out quoted in README.md and submission.md. A recorded run,
 * not a reading — the page says so. The ~28% dead rate is why sources are
 * health-checked at generation time and frozen into the manifest.
 */
export const REFERENCE_RUN = {
  queried: 18,
  healthy: 13,
  dead: 5,
  rows: 74,
  seconds: 2.8,
  costUsd: 0.0014,
} as const;

/**
 * Both directions of `web/scripts/substreams-verify.ts` against
 * arb-one.streamingfast.io. The control run is here on purpose: a harness that
 * can only report a firing proves nothing about the one that should not fire.
 */
export const SUBSTREAMS = {
  endpoint: "arb-one.streamingfast.io",
  network: "arbitrum-one",
  trigger: "healthFactor < 1.15",
  breach: {
    fromBlock: 487508073,
    toBlock: 487508075,
    seconds: 1.5,
    breachBlock: 487508074,
    healthFactor: 1.035,
    firings: 1,
  },
  control: {
    fromBlock: 487509578,
    toBlock: 487509580,
    firings: 0,
  },
} as const;

/**
 * `scripts/substreams-verify.ts --real`. An `approve`, and described as one —
 * granting the router an allowance is genuinely the first step of a swap and is
 * not a swap, and `approve` is its own Action.kind for that reason.
 */
const TX_HASH =
  "0x5a44e9d5d79446afd042928a76d405459242688f479d7257e23143d6190c9d78";

export const ONCHAIN = {
  arbitrumBlock: 487540654,
  kind: "approve",
  amountUsd: 25,
  txHash: TX_HASH,
  basescanUrl: `https://sepolia.basescan.org/tx/${TX_HASH}`,
  baseBlock: 44604106,
  allowanceUsdc: 25,
} as const;

/* ── pinned: identity ──────────────────────────────────────────────────── */

export const ENS_PARENT = "atlas-apps.eth";

/** Written per published mini app. ENSIP-25 and ENSIP-26 records included. */
export const ENS_RECORDS: readonly string[] = [
  "addr",
  "contenthash",
  "agent-context",
  "agent-endpoint[web]",
  "agent-endpoint[mcp]",
  "agent-registration",
  "url · description · avatar",
];

export const ZEROG = {
  tokenId: 10,
  chainId: 16602,
  chainName: "0G Galileo",
  model: "0gm-1.0-35b-a3b",
  attestation: "0g://6f3651f2…",
} as const;
