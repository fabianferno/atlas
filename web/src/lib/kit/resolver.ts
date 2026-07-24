/**
 * W1 — `ResolveSources` from contracts/api.ts.
 *
 * Schema families in, live health-checked deployments out. The health check is
 * not an optimisation: roughly 28% of standardized deployments are unserved at
 * any given moment, so a resolver that returns the registry verbatim hands the
 * fan-out a batch that is a quarter dead and gets the demo killed on stage.
 */
import type { Network, SchemaFamily, Source } from "@/lib/contracts/manifest";
import type { ResolveSources } from "@/lib/contracts/api";
import type { Transport } from "./gateway";
import { isLive } from "./gateway";
import {
  candidateSources,
  entryToSource,
  healthCheckAll,
  lookupEntry,
  type HealthDetail,
  type RegistryEntry,
} from "./sources";

export interface ResolveOptions {
  transport?: Transport;
  /** Cap on deployments probed per (schema, network). Candidates are ordered by
   *  reliability, so a cap keeps the best ones. */
  maxPerPair?: number;
  /** Total cap across the whole request. Guards against a plan that names all
   *  ten families on four networks and then waits eight seconds. */
  maxSources?: number;
  timeoutMs?: number;
  concurrency?: number;
}

export interface Resolution {
  /** Healthy sources only — what you pass to `fanOut`. */
  sources: Source[];
  /** Every candidate that was probed, healthy or not. `checked.length` is the
   *  denominator in "27 of 31 live". */
  checked: Source[];
  dead: Source[];
  details: HealthDetail[];
  /** Families and networks that produced no healthy source at all. Worth
   *  surfacing — it is the difference between "no data" and "nothing to query". */
  emptySchemas: SchemaFamily[];
  emptyNetworks: Network[];
  live: boolean;
  elapsedMs: number;
}

function capPerPair(entries: RegistryEntry[], max: number): RegistryEntry[] {
  const seen = new Map<string, number>();
  const out: RegistryEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.schema}|${entry.network}`;
    const n = seen.get(key) ?? 0;
    if (n >= max) continue;
    seen.set(key, n + 1);
    out.push(entry);
  }
  return out;
}

/**
 * The full resolution, with the counts a UI needs. `resolveSources` below is the
 * contract-shaped view of this — everything interesting lives here.
 */
export async function resolveSourcesDetailed(
  schemas: SchemaFamily[],
  networks: Network[],
  options: ResolveOptions = {},
): Promise<Resolution> {
  const started = Date.now();
  const maxPerPair = options.maxPerPair ?? 6;
  const maxSources = options.maxSources ?? 40;

  const candidates = capPerPair(candidateSources(schemas, networks), maxPerPair).slice(
    0,
    maxSources,
  );

  const details = await healthCheckAll(candidates, {
    transport: options.transport,
    timeoutMs: options.timeoutMs,
    concurrency: options.concurrency,
  });

  const checked = details.map((d) => d.source);
  const sources = checked.filter((s) => s.healthy);
  const dead = checked.filter((s) => !s.healthy);

  const liveSchemas = new Set(sources.map((s) => s.schema));
  const liveNetworks = new Set(sources.map((s) => s.network));

  return {
    sources,
    checked,
    dead,
    details,
    emptySchemas: schemas.filter((s) => !liveSchemas.has(s)),
    emptyNetworks: networks.filter((n) => !liveNetworks.has(n)),
    live: isLive(options.transport ?? "gateway"),
    elapsedMs: Date.now() - started,
  };
}

/** The contracts/api.ts signature. Healthy sources only, by design. */
export const resolveSources: ResolveSources = async (schemas, networks) => {
  const resolution = await resolveSourcesDetailed([...schemas], [...networks]);
  return resolution.sources;
};

/**
 * Re-probe sources that arrived from somewhere else — a stored manifest, a fork,
 * an MCP discovery call. A manifest can be months old; its `healthy: true` is a
 * historical claim, not a current one.
 */
export async function refreshSources(
  sources: Source[],
  options: ResolveOptions = {},
): Promise<Resolution> {
  const started = Date.now();
  const details = await healthCheckAll(
    sources.map((s) => lookupEntry(s.subgraphId) ?? s),
    { transport: options.transport, timeoutMs: options.timeoutMs, concurrency: options.concurrency },
  );
  const checked = details.map((d, i) => ({ ...sources[i], ...d.source }));
  return {
    sources: checked.filter((s) => s.healthy),
    checked,
    dead: checked.filter((s) => !s.healthy),
    details,
    emptySchemas: [],
    emptyNetworks: [],
    live: isLive(options.transport ?? "gateway"),
    elapsedMs: Date.now() - started,
  };
}

/** Unchecked candidates, for a coverage view that must not cost 31 requests. */
export function candidateList(
  schemas: SchemaFamily[],
  networks: Network[],
): Source[] {
  return candidateSources(schemas, networks).map(entryToSource);
}
