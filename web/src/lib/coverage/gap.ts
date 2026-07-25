/**
 * IS THERE COVERAGE, AND HOW DO WE KNOW.
 *
 * This system's premise is that resolving a standardized schema beats resolving
 * a subgraph id, because it answers questions nobody anticipated. That premise
 * has an edge: a protocol nobody has indexed. At that edge the honest options
 * are to say so, or to build the coverage — and both require first establishing
 * the absence rather than assuming it.
 *
 * Two independent lookups, deliberately not collapsed into one number:
 *
 *   SUBGRAPH    how many standardized deployments exist for the requested
 *               families and networks, from the local registry.
 *   SUBSTREAMS  whether any published package matches, from substreams.dev.
 *
 * They stay separate because the remedies differ. A package but no subgraph
 * means stream it. A subgraph but no package means query it. Neither means the
 * agent has something to build. Collapsing them to a boolean would throw away
 * the one distinction that decides what happens next.
 *
 * `reasons` exists so the verdict is quotable. "No coverage" with nothing behind
 * it is indistinguishable from a lookup that failed.
 */
import type { Network, SchemaFamily } from "@/lib/contracts/manifest";
import { registryCoverage } from "@/lib/kit/sources";
import { searchPackages, type RegistryPackage } from "./registry";

export type CoverageVerdict = "covered" | "subgraph-only" | "substreams-only" | "uncovered";

export interface CoverageReport {
  /** What was searched for. Echoed so a report is self-describing. */
  subject: string;
  subgraph: {
    deployments: number;
    byNetwork: Partial<Record<Network, number>>;
  };
  substreams: {
    packages: RegistryPackage[];
  };
  /** True when anything at all indexes this today. */
  covered: boolean;
  verdict: CoverageVerdict;
  /** What was checked and what came back, in order. */
  reasons: string[];
}

export interface AssessOptions {
  /** Free text describing the protocol or activity. Used as the registry query. */
  query: string;
  schemas: readonly SchemaFamily[];
  networks: readonly Network[];
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export async function assessCoverage(options: AssessOptions): Promise<CoverageReport> {
  const reasons: string[] = [];

  const coverage = registryCoverage();
  const byNetwork: Partial<Record<Network, number>> = {};
  let deployments = 0;
  for (const schema of options.schemas) {
    const perNetwork = coverage[schema];
    if (!perNetwork) continue;
    for (const network of options.networks) {
      const count = perNetwork[network] ?? 0;
      if (count === 0) continue;
      byNetwork[network] = (byNetwork[network] ?? 0) + count;
      deployments += count;
    }
  }

  reasons.push(
    options.schemas.length === 0
      ? "No standardized schema family matched the request."
      : `Standardized deployments for ${options.schemas.join(", ")} on ${options.networks.join(", ")}: ${deployments}.`,
  );

  // A registry outage must not be reported as absence. If the lookup itself
  // fails, say that instead — the difference decides whether we build.
  let packages: RegistryPackage[] = [];
  let registryFailed = false;
  try {
    const search = await searchPackages({
      query: options.query,
      pageSize: 10,
      fetchImpl: options.fetchImpl,
      signal: options.signal,
    });
    packages = search.packages;
    reasons.push(
      packages.length === 0
        ? `substreams.dev has no published package matching "${options.query}".`
        : `substreams.dev has ${packages.length} package(s) matching "${options.query}": ${packages.map((p) => p.reference).join(", ")}.`,
    );
  } catch (err) {
    registryFailed = true;
    reasons.push(
      `substreams.dev lookup FAILED for "${options.query}" (${err instanceof Error ? err.message : String(err)}) — absence of packages is unproven.`,
    );
  }

  const hasSubgraph = deployments > 0;
  const hasPackage = packages.length > 0;

  const verdict: CoverageVerdict = hasSubgraph
    ? hasPackage
      ? "covered"
      : "subgraph-only"
    : hasPackage
      ? "substreams-only"
      : "uncovered";

  if (verdict === "uncovered" && registryFailed) {
    reasons.push("Treating this as uncovered would be a guess. Re-run the registry lookup first.");
  }

  return {
    subject: options.query,
    subgraph: { deployments, byNetwork },
    substreams: { packages },
    covered: hasSubgraph || hasPackage,
    verdict,
    reasons,
  };
}
