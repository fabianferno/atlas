/**
 * The drawer's pure decisions, kept out of the components that render them.
 *
 * This file has no React import and no JSX, and that is load-bearing rather
 * than tidy: the suite runs under `tsx` with no DOM, so anything that pulls in
 * a component cannot be tested here at all. Every rule below is one the product
 * would otherwise be asserting without a check.
 */
import { REQUIRED_FOR_AUTONOMOUS, type ComponentName } from "@/lib/contracts/catalog";
import type { AgencyTier } from "@/lib/contracts/manifest";

/**
 * What `AppRuntime` guarantees is on screen no matter which tab is open.
 *
 * The policy strip renders the policy summary and the kill switch above the tab
 * strip, and the Activity tab holds the journal. Passing this to the renderer is
 * how the composed document is allowed to stop carrying its own copies of the
 * three — see `missingRequired`.
 */
export const HOST_PROVIDED: readonly ComponentName[] = ["policy_badge", "trade_log", "kill_switch"];

/**
 * Which of the autonomous trio the client must append itself.
 *
 * THE REINTERPRETATION THIS FILE EXISTS FOR. `REQUIRED_FOR_AUTONOMOUS` was
 * enforced as "these three must be in the DOCUMENT", which is why the runtime
 * rendering its own trade log next to the document's trade log was invisible to
 * the check — both were satisfying it, twice. The rule it was always standing in
 * for is "these three must be ON SCREEN", so a host that renders them in its own
 * chrome now says so and the renderer stops re-appending them.
 *
 * `providedByHost` defaults to empty, and that default is the safety property:
 * a caller that does not know about this parameter — `studio-input.tsx` renders
 * a bare draft with no chrome around it — keeps the old behaviour exactly.
 */
export function missingRequired(
  tier: AgencyTier,
  present: ReadonlySet<ComponentName>,
  providedByHost: readonly ComponentName[] = [],
): ComponentName[] {
  if (tier !== "autonomous") return [];
  return REQUIRED_FOR_AUTONOMOUS.filter((n) => !present.has(n) && !providedByHost.includes(n));
}

export type TabKey = "app" | "data" | "safety" | "activity" | "about";

export interface TabDef {
  key: TabKey;
  label: string;
}

/**
 * The tab set, derived from the tier rather than fixed.
 *
 * Safety is autonomous-only because it is the panel about a wallet, a signer and
 * per-constraint enforcement, and a read-only app has none of those — an empty
 * Safety tab would read as "nothing is enforced" rather than "there is nothing
 * to enforce". App is always first: the composed body is what the drawer is for.
 */
export function tabsFor(tier: AgencyTier): TabDef[] {
  const tabs: TabDef[] = [
    { key: "app", label: "App" },
    { key: "data", label: "Data" },
  ];
  if (tier === "autonomous") tabs.push({ key: "safety", label: "Safety" });
  tabs.push({ key: "activity", label: "Activity" });
  tabs.push({ key: "about", label: "About" });
  return tabs;
}

export interface SeamFacts {
  /** Rows the last run returned, or null when nothing has been run this session. */
  rows: number | null;
  sourcesHealthy: number;
  sourcesQueried: number;
  /** `RunOutcome.live`, or null when nothing has been run. */
  live: boolean | null;
}

/**
 * The line under the tab strip that names the composed body as composed.
 *
 * It must not imply a query that did not happen. `rows: null` means no run this
 * session, so the row count is simply absent rather than zero — and `live:
 * false` appends the fixture disclosure, because a row count sitting next to
 * "composed by the agent" otherwise reads as a measurement of live data. The
 * receipts above already shout FIXTURES; this line may not quietly disagree.
 */
export function seamLine(f: SeamFacts): string {
  const head =
    f.rows === null
      ? "Composed by the agent"
      : `Composed by the agent from ${f.rows} row${f.rows === 1 ? "" : "s"}`;
  const fixtures = f.live === false ? " · fixtures, not a live query" : "";
  return `${head} · ${f.sourcesHealthy} of ${f.sourcesQueried} deployments live${fixtures}`;
}
