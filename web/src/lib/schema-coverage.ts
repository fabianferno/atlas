/**
 * Which standardized schema families are DECLARED but have nothing behind them.
 *
 * §13 verified that two standardized families — `dex-aggregator@1.0.2` and
 * `network@1.2.0` — have zero deployments on any network, and three seed apps
 * declare one of them as a second family. That declaration is not a mistake: the
 * resolver answers with an explicit `PLACEHOLDER-*` source marked
 * `healthy: false`, the app page renders it "dead, skipped", and §13 argues that
 * showing what the health check skipped *is* the Track 3 point ("a demo where
 * everything is always green never teaches the audience what problem the health
 * check solves"). Nothing here removes a declaration; it only says what came back.
 *
 * Derived from the loaded manifests, never a hardcoded family list — a family
 * that gains a deployment loses the label on its own.
 *
 * WHY THIS LIVES IN `lib/` AND NOT IN THE COMPONENT THAT FIRST NEEDED IT.
 * The rule started as the body of a `useMemo` private to `RegistryGrid`, so it
 * reached exactly one surface: the schema select. Two others rendered the same
 * declarations as a bare list — the registry card's family chips, and
 * `KV k="Schemas"` on the app page — which put a family on screen looking like a
 * working data source, with the contradiction parked in a different control or a
 * different panel. prd.md §13's rule is that the qualification belongs where the
 * claim is displayed, so all three surfaces now ask the same question.
 *
 * It was briefly a module-level export from `registry-grid.tsx` instead. That
 * worked and cost something real: a file that exports a non-component alongside
 * components drops out of React Fast Refresh, so every edit to the registry grid
 * forced a full page reload during development. Copying the derivation to a
 * second file would have been the worse repair — two implementations of "has no
 * live deployment" drift, and the one that drifts is the one that quietly starts
 * overstating — so it moved here instead, where it is a plain function that no
 * component file owns.
 *
 * The denominator is the whole loaded set on purpose, not one app's own sources.
 * The claim being marked is about the FAMILY — "nothing we probed for this family
 * is answering" — not about one app's luck with it. An individual app's dead
 * source is a separate disclosure and already has its own home in the per-source
 * list on the app page, which prints "dead, skipped" against the deployment.
 */
import type { MiniApp } from "@/lib/seed";

export function familiesWithNoLiveSource(apps: readonly MiniApp[]): Set<string> {
  const declared = new Set<string>();
  const healthy = new Set<string>();
  for (const a of apps) {
    for (const f of a.manifest.data.schemas) declared.add(f);
    for (const src of a.manifest.data.sources) {
      if (src.healthy) healthy.add(src.schema);
    }
  }
  return new Set([...declared].filter((f) => !healthy.has(f)));
}

/**
 * The words, once. Every surface that marks a family says exactly this, because
 * two surfaces phrasing the same fact differently is how a reader concludes they
 * are two different facts.
 */
export const NO_LIVE_SOURCE = "no live deployment";
