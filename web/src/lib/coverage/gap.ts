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
 * THE TWO HALVES ARE NOT EQUALLY STRONG, and pretending otherwise was this
 * module's worst bug. The substreams half searches by name, so a hit is a hit
 * *for this protocol*. The subgraph half is a count of deployments in whatever
 * schema families the planner picked — and the planner always picks something,
 * falling back to `generic@3.0.0`, which has live rows. So "12 deployments" was
 * being returned for protocols nobody has ever indexed, and the report said
 * covered. A count of candidate deployments is not evidence that any of them
 * indexes the subject; establishing that is a later phase's job. Until then the
 * count is reported as what it is, and `covered` is set only by the half that
 * actually matched the subject.
 *
 * `reasons` exists so the verdict is quotable. But a quote is not a proof: when
 * the substreams.dev lookup does not complete, "no package" is unproven, not
 * false. A later phase triggers pipeline construction on `verdict ===
 * "uncovered"`, so reporting a failed lookup as "uncovered" would send that
 * phase to rebuild something that may already be published — the exact mistake
 * this module exists to prevent. Any incomplete lookup therefore yields
 * `"unknown"`, whatever the subgraph side says: subgraph coverage does not make
 * a missing package true, and `"subgraph-only"` claims exactly that. Machines
 * read `substreamsProven` for this; humans read `reasons`.
 */
import type { Network, SchemaFamily } from "@/lib/contracts/manifest";
import { registryCoverage } from "@/lib/kit/sources";
import { searchPackages, searchTermFor, type RegistryPackage } from "./registry";

export type CoverageVerdict = "covered" | "subgraph-only" | "substreams-only" | "uncovered" | "unknown";

export interface CoverageReport {
  /** What was searched for. Echoed so a report is self-describing. */
  subject: string;
  subgraph: {
    /**
     * Deployments in the schema families this question plans to query. NOT a
     * count of deployments known to index the subject — nothing here checks
     * that. Treat it as how many candidates a later, subject-aware check would
     * have to look at.
     */
    deployments: number;
    byNetwork: Partial<Record<Network, number>>;
  };
  substreams: {
    /** The term actually sent to substreams.dev, narrowed from `subject`. */
    query: string;
    packages: RegistryPackage[];
  };
  /**
   * Did the substreams.dev lookup complete and return a response we could read
   * in full? False when it failed, timed out, or answered with rows none of
   * which parsed. This is the machine-readable form of "the absence of packages
   * is unproven" — a later phase decides whether to build on it, and keying that
   * decision on the wording of a sentence in `reasons` would break the day
   * someone rephrases the sentence.
   */
  substreamsProven: boolean;
  /**
   * True only when something is PROVEN to index this subject — today that means
   * a published substreams package matched the search. Subgraph deployment
   * counts do not set this: they are candidates in the planned schema families,
   * not a demonstrated match (see the header). False for `"unknown"` too — an
   * unproven absence is not a confirmed presence.
   */
  covered: boolean;
  verdict: CoverageVerdict;
  /** What was checked and what came back, in order. */
  reasons: string[];
}

export interface AssessOptions {
  /**
   * Free text describing the protocol or activity. Echoed as `subject`, and
   * narrowed by `searchTermFor` before it reaches the registry — the whole
   * sentence would only ever manufacture false absences.
   */
  query: string;
  schemas: readonly SchemaFamily[];
  networks: readonly Network[];
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /**
   * Injectable for tests, mirroring `fetchImpl`. Defaults to the real registry
   * so callers get live data; tests that only need synthetic (schema, network)
   * counts should pass a fixture instead of depending on what's really in
   * `sources.ts` today.
   */
  coverage?: () => Record<SchemaFamily, Partial<Record<Network, number>>>;
}

export async function assessCoverage(options: AssessOptions): Promise<CoverageReport> {
  const reasons: string[] = [];

  const coverage = (options.coverage ?? registryCoverage)();
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

  // State what was measured, not what it implies. The old wording ("Standardized
  // deployments for X: 12") was read — including by us — as "12 subgraphs index
  // this protocol", which the number does not say and this module cannot check.
  reasons.push(
    options.schemas.length === 0
      ? "No standardized schema family matched the request."
      : deployments === 0
        ? `No standardized deployments exist for ${options.schemas.join(", ")} on ${options.networks.join(", ")}.`
        : `${deployments} deployment(s) exist in the schema families this question plans to query ` +
          `(${options.schemas.join(", ")} on ${options.networks.join(", ")}); whether any of them ` +
          `indexes this protocol was not checked.`,
  );

  // The whole question is not a package name. Narrow it, and say what was sent —
  // a verdict nobody can reproduce is not evidence.
  const search = searchTermFor(options.query);
  if (search.term !== options.query.trim()) {
    reasons.push(`Searched substreams.dev for "${search.term}" (narrowed from "${options.query}").`);
  }

  // A registry outage must not be reported as absence. If the lookup itself
  // fails, say that instead — the difference decides whether we build.
  let packages: RegistryPackage[] = [];
  let substreamsProven = false;
  try {
    const result = await searchPackages({
      query: search.term,
      pageSize: 10,
      fetchImpl: options.fetchImpl,
      signal: options.signal,
    });
    packages = result.packages;
    // Rows arrived that we could not read. Something about the response shape
    // moved, and an empty `packages` under those conditions is our parser's
    // opinion, not the registry's answer.
    substreamsProven = result.unusable === 0;
    if (result.unusable > 0) {
      reasons.push(
        `substreams.dev returned ${result.unusable} row(s) for "${search.term}" that could not be parsed ` +
          `(no usable name or .spkg URL) — the response shape may have changed, so absence of packages is unproven.`,
      );
    }
    // The term was inferred from the question, so both outcomes carry a caveat
    // when the inference was a guess: a miss may be the wrong word rather than
    // an absent package, and a hit may be a package that merely shares a common
    // word. Naming the matched packages is what lets a reader check the second.
    const guessed = search.broad
      ? ` "${search.term}" was picked as the first distinctive word of the question rather than identified as the protocol's name`
      : "";
    if (packages.length > 0) {
      reasons.push(
        `substreams.dev has ${packages.length} package(s) matching "${search.term}": ${packages.map((p) => p.reference).join(", ")}.` +
          (guessed ? `${guessed} — read those names before treating this as a match.` : ""),
      );
    } else if (substreamsProven) {
      reasons.push(
        `substreams.dev has no published package matching "${search.term}".` +
          (guessed ? `${guessed}, so a zero result understates coverage more often than it proves absence.` : ""),
      );
    }
  } catch (err) {
    reasons.push(
      `substreams.dev lookup FAILED for "${search.term}" (${err instanceof Error ? err.message : String(err)}) — absence of packages is unproven.`,
    );
  }

  const hasSubgraph = deployments > 0;
  const hasPackage = packages.length > 0;

  // Presence first: a named package that came back is proof, and proof outranks
  // whether the rest of the response was readable. Otherwise an unproven lookup
  // is `"unknown"` regardless of subgraph deployments — "subgraph-only" asserts
  // that no package exists, and that was never established.
  const verdict: CoverageVerdict = hasPackage
    ? hasSubgraph
      ? "covered"
      : "substreams-only"
    : substreamsProven
      ? hasSubgraph
        ? "subgraph-only"
        : "uncovered"
      : "unknown";

  if (verdict === "unknown") {
    reasons.push("Treating this as uncovered would be a guess. Re-run the registry lookup first.");
  }
  if (verdict === "subgraph-only") {
    reasons.push(
      "No package exists, and the deployments above are candidates rather than a confirmed match — " +
        "so this reports which sources to look at, not that the subject is covered.",
    );
  }

  return {
    subject: options.query,
    subgraph: { deployments, byNetwork },
    substreams: { query: search.term, packages },
    substreamsProven,
    // Only the half that matched by name can set this. A deployment count in the
    // planned schema families is not a demonstrated match, and "unknown" means
    // we never found out — neither may read as coverage.
    covered: hasPackage,
    verdict,
    reasons,
  };
}
