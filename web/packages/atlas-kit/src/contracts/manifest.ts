/**
 * PHASE 0 CONTRACT — do not change without a coordinated update.
 *
 * The Mini App Manifest is the single most important object in the system.
 * Registry, ENS binding, forking, provenance and agency are all functions of it.
 *
 * See prd.md §5.
 */
import { z } from "zod";

/** The ten Messari standardized schema families, via The Graph. */
export const SCHEMA_FAMILIES = [
  "generic@3.0.0",
  "dex-amm@1.3.2",
  "dex-amm-extended@4.0.1",
  "dex-aggregator@1.0.2",
  "lending-cdp@3.1.0",
  "yield-aggregator@1.3.1",
  "nft-marketplace@2.1.0",
  "network@1.2.0",
  "bridge@1.2.0",
  "perp-futures@1.3.4",
  "options@1.3.2",
] as const;
export type SchemaFamily = (typeof SCHEMA_FAMILIES)[number];

export const NETWORKS = ["arbitrum-one", "optimism", "base", "mainnet"] as const;
export type Network = (typeof NETWORKS)[number];

/**
 * Agency tier. Drives border weight in the UI (prd.md §6 Rule 1) and what the
 * policy engine will allow. This is the most load-bearing field in the manifest.
 */
export const AGENCY_TIERS = ["readonly", "monitor", "autonomous"] as const;
export type AgencyTier = (typeof AGENCY_TIERS)[number];

/** A single resolved, health-checked subgraph deployment. */
export const zSource = z.object({
  subgraphId: z.string(),
  schema: z.enum(SCHEMA_FAMILIES),
  network: z.enum(NETWORKS),
  /** ISO timestamp of the last successful health probe. ~28% of deployments
   *  are dead at any moment — never trust an unchecked source. */
  healthCheckedAt: z.string().datetime().nullable(),
  healthy: z.boolean(),
  label: z.string().optional(),
});
export type Source = z.infer<typeof zSource>;

export const zDataPlan = z.object({
  schemas: z.array(z.enum(SCHEMA_FAMILIES)).min(1),
  networks: z.array(z.enum(NETWORKS)).min(1),
  sources: z.array(zSource),
  /** Named GraphQL query templates, keyed by purpose. */
  queries: z.record(z.string(), z.string()),
  variables: z.record(z.string(), z.unknown()).default({}),
  /** Substreams subscription. Event-driven triggers require this — polling a
   *  subgraph means an autonomous guard is up to 5 minutes late. */
  stream: z
    .object({
      package: z.string(),
      module: z.string(),
      filter: z.record(z.string(), z.unknown()).default({}),
    })
    .nullable()
    .default(null),
  transport: z.enum(["gateway", "x402", "mcp"]).default("gateway"),
});
export type DataPlan = z.infer<typeof zDataPlan>;

/**
 * Enforced at the signer, never suggested to the model. The model proposes;
 * the policy engine disposes. See prd.md §7.
 */
export const zPolicy = z.object({
  wallet: z.string().nullable(),
  maxSpendUsd: z.number().nonnegative(),
  maxPerTxUsd: z.number().nonnegative(),
  /** Empty allowlist means no actions. No exceptions. */
  allowlist: z.array(z.string()).default([]),
  expiresAt: z.string().datetime().nullable(),
  requireConfirm: z.boolean().default(true),
  killSwitch: z.boolean().default(true),
  /** Tripped by the user or by a failed invariant. Blocks every action. */
  halted: z.boolean().default(false),
});
export type Policy = z.infer<typeof zPolicy>;

export const zAction = z.object({
  // `approve` is additive to the original set. Granting a spender an allowance
  // is a real onchain action a mini app takes — it is the first step of every
  // swap — and it needs its own name: describing it as a `swap` would make the
  // manifest lie about what the signer did.
  kind: z.enum(["swap", "approve", "supply", "withdraw", "repay", "claim", "notify"]),
  target: z.string().optional(),
  params: z.record(z.string(), z.unknown()).default({}),
  label: z.string(),
});
export type Action = z.infer<typeof zAction>;

export const zTrigger = z.object({
  on: z.enum(["stream", "interval", "manual"]),
  when: z.string().nullable().default(null),
  run: z.string(),
  intervalSec: z.number().int().positive().optional(),
});
export type Trigger = z.infer<typeof zTrigger>;

export const zAgency = z.object({
  tier: z.enum(AGENCY_TIERS),
  triggers: z.array(zTrigger).default([]),
  actions: z.record(z.string(), zAction).default({}),
  policy: zPolicy,
});
export type Agency = z.infer<typeof zAgency>;

export const zProvenance = z.object({
  model: z.string(),
  compute: z.enum(["0g-private-computer", "openai", "local"]),
  attestationRef: z.string().nullable(),
  generatedAt: z.string().datetime(),
});
export type Provenance = z.infer<typeof zProvenance>;

export const zIdentity = z.object({
  ens: z.string().nullable(),
  agenticId: z
    .object({ chain: z.literal("0g"), contract: z.string(), tokenId: z.number() })
    .nullable(),
  manifestCid: z.string().nullable(),
});
export type Identity = z.infer<typeof zIdentity>;

export const zManifest = z.object({
  /**
   * `atlas/2` is what we write now. `graphmini/2` is accepted because manifests
   * published under the old name are already pinned and already referenced by
   * `contenthash` on live ENS names — and a content-addressed document cannot be
   * edited, because the CID *is* its hash. Rejecting the old marker would not
   * migrate anything; it would make four published mini apps stop resolving,
   * with `manifest: null` and a "malformed manifest at a valid CID" warning.
   *
   * A spec literal that refuses its own history is a migration bug, not strictness.
   * Drop `graphmini/2` only once nothing onchain points at a manifest carrying it.
   */
  spec: z.union([z.literal("atlas/2"), z.literal("graphmini/2")]),
  name: z.string().regex(/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/, "ENS label"),
  title: z.string(),
  intent: z.string(),
  category: z.string().default("defi"),
  tags: z.array(z.string()).default([]),

  data: zDataPlan,
  /** A2UI v0.9.1 document. Opaque here on purpose — see contracts/a2ui.ts. */
  ui: z.unknown(),
  agency: zAgency,
  identity: zIdentity,
  provenance: zProvenance,

  author: z.string().nullable(),
  appVersion: z.string().default("1.0.0"),
  /** Pins a version. Forking a moving target produces silent breakage. */
  forkedFrom: z.string().nullable().default(null),
  pricing: z
    .object({ x402: z.object({ enabled: z.boolean(), priceUsd: z.number() }) })
    .nullable()
    .default(null),

  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Manifest = z.infer<typeof zManifest>;

/**
 * Forking strips identity, wallet, and provenance. A fork must never inherit
 * the parent's wallet or its attestation — this is a security requirement,
 * not a design preference. See prd.md §12.
 */
export function forkManifest(parent: Manifest, newName: string): Manifest {
  const now = new Date().toISOString();
  return {
    ...parent,
    name: newName,
    identity: { ens: null, agenticId: null, manifestCid: null },
    agency: {
      ...parent.agency,
      policy: { ...parent.agency.policy, wallet: null, halted: false },
    },
    provenance: { ...parent.provenance, attestationRef: null, generatedAt: now },
    author: null,
    appVersion: "1.0.0",
    forkedFrom: `${parent.name}@${parent.appVersion}`,
    createdAt: now,
    updatedAt: now,
  };
}
