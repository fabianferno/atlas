/**
 * PHASE 0 CONTRACT — the kit's public API.
 *
 * The Studio imports these and never reaches around them. That separation is
 * what lets one repo credibly claim both "reusable tooling" (Graph Track 1)
 * and "end-user app" (Graph Track 2).
 *
 * Every workstream binds to these signatures. Stub implementations that
 * satisfy the types are expected and encouraged — an agent building the
 * renderer should be able to work before the data plane exists.
 */
import type { Manifest, Source, AgencyTier, SchemaFamily, Network } from "./manifest";
import type { ComponentName } from "./catalog";

/** W3 — natural language to a query plan, on 0G Compute. */
export interface PlanInput {
  question: string;
  hints?: { networks?: Network[]; schemas?: SchemaFamily[]; tier?: AgencyTier };
}
export interface PlanResult {
  intent: string;
  schemas: SchemaFamily[];
  networks: Network[];
  queries: Record<string, string>;
  variables: Record<string, unknown>;
  tier: AgencyTier;
  /** Present when inference ran on 0G Private Computer. */
  attestationRef: string | null;
  model: string;
}
export type Plan = (input: PlanInput) => Promise<PlanResult>;

/** W1 — schema family to live, health-checked deployments. */
export type ResolveSources = (
  schemas: SchemaFamily[],
  networks: Network[],
) => Promise<Source[]>;

/** W1 — parallel query across every healthy source. Dead sources are skipped,
 *  never retried inline, and reported so the UI can show "27 of 31 live". */
export interface FanOutResult {
  rows: Record<string, unknown>[];
  bySchema: Record<string, Record<string, unknown>[]>;
  sourcesQueried: number;
  sourcesHealthy: number;
  sourcesFailed: string[];
  costUsd: number;
  elapsedMs: number;
}
export type FanOut = (plan: PlanResult, sources: Source[]) => Promise<FanOutResult>;

/** W4 — plan plus data to an A2UI document. */
export interface ComposeResult {
  /** A2UI v0.9.1 document. */
  ui: unknown;
  componentsUsed: ComponentName[];
  attestationRef: string | null;
}
export type Compose = (plan: PlanResult, data: FanOutResult) => Promise<ComposeResult>;

/** W7/W10 — pin, name, mint, register. */
export interface PublishOptions {
  name: string;
  tier: AgencyTier;
  policy?: Partial<Manifest["agency"]["policy"]>;
  priceUsd?: number;
}
export interface PublishResult {
  manifest: Manifest;
  ens: string | null;
  manifestCid: string | null;
  agenticIdTokenId: number | null;
  txHash: string | null;
}
export type Publish = (
  manifest: Manifest,
  options: PublishOptions,
) => Promise<PublishResult>;

/** W7 — ENS name to a rehydrated, live manifest. */
export type Resolve = (ensName: string) => Promise<Manifest | null>;

export interface GraphMinisKit {
  plan: Plan;
  resolveSources: ResolveSources;
  fanOut: FanOut;
  compose: Compose;
  publish: Publish;
  resolve: Resolve;
}
