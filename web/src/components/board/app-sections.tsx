"use client";

/**
 * Two arrangements of the same sections.
 *
 * The sections arrive as already-built elements rather than as props to build
 * from. That is the seam: `AppRuntime` owns the data and the fetches, these two
 * own arrangement and nothing else, and neither can accidentally render a panel
 * with different inputs than the other.
 *
 * WHAT IS NOT IN `AppSections`, and must never be added to it: the policy strip.
 * The autonomous safety invariant now rests on that strip being on screen no
 * matter which tab is open — `AppRuntime` passes HOST_PROVIDED to the renderer
 * on the strength of it, so the composed body no longer carries its own policy
 * badge or kill switch. `AppRuntime` renders the strip ABOVE the call to either
 * layout, and neither layout holds a reference to it, so neither can suppress
 * it. There is no DOM in this repo's test harness and so no test can assert
 * this; the structure is the enforcement.
 */
import { useId, type ReactNode } from "react";
import { tabsFor, type TabKey } from "@/lib/app-view";
import type { AgencyTier } from "@/lib/contracts/manifest";
import { cn } from "@/lib/utils";

export interface AppSections {
  app: ReactNode;
  publish: ReactNode;
  dataPlan: ReactNode;
  /** Null for every tier but autonomous — there is no wallet to describe. */
  permissions: ReactNode | null;
  ratings: ReactNode;
  /** Null unless the tier is autonomous or monitor — nothing to log otherwise. */
  tradeLog: ReactNode | null;
  provenance: ReactNode;
  usage: ReactNode;
}

/**
 * Which pieces make up each tab body, in the order `TabbedSections` composes
 * them today: App = `app`; Data = `dataPlan`; Safety = `permissions`; Activity =
 * `tradeLog` then `usage`; About = `publish` then `provenance` then `ratings`.
 * A free function rather than a method so `RailSections` never has to import
 * it — the two layouts arrange these fine-grained members independently, and
 * that independence is the fix for the bug where `RailSections` once reused
 * this grouping and silently reordered the page.
 */
function tabBody(sections: AppSections, key: TabKey): ReactNode {
  switch (key) {
    case "app":
      return sections.app;
    case "data":
      return sections.dataPlan;
    case "safety":
      return sections.permissions;
    case "activity":
      return (
        <>
          {sections.tradeLog}
          {sections.usage}
        </>
      );
    case "about":
      return (
        <>
          {sections.publish}
          {sections.provenance}
          {sections.ratings}
        </>
      );
  }
}

/**
 * The drawer. One tab body at a time, with the composed document first and
 * named as composed.
 */
export function TabbedSections({
  sections,
  tier,
  seam,
  activeTab,
  onTabChange,
}: {
  sections: AppSections;
  tier: AgencyTier;
  /** The line naming the composed body. Rendered on the App tab only. */
  seam: string;
  activeTab: TabKey;
  onTabChange: (key: TabKey) => void;
}) {
  const tabs = tabsFor(tier);
  const base = useId();

  // Arrow keys move between tabs, Home/End jump to the first/last. This does
  // not fight the option wheel beside the drawer: the wheel's own arrow
  // handling is an `onKeyDown` on its focused element (`option-wheel.tsx`,
  // role="listbox", tabIndex={0}), not a document listener, so the two can
  // never both be focused.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.key === activeTab);
    let nextIndex: number;
    if (e.key === "ArrowRight") nextIndex = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") nextIndex = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = tabs.length - 1;
    else return;
    e.preventDefault();
    const next = tabs[nextIndex];
    onTabChange(next.key);
    document.getElementById(`${base}-tab-${next.key}`)?.focus();
  };

  return (
    <div className="mt-4">
      <div
        role="tablist"
        aria-label="Mini app sections"
        onKeyDown={onKeyDown}
        className="flex gap-1 border-b border-hairline"
      >
        {tabs.map((t) => {
          const active = t.key === activeTab;
          return (
            <button
              key={t.key}
              id={`${base}-tab-${t.key}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${base}-panel-${t.key}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onTabChange(t.key)}
              className={cn(
                "mono px-2.5 py-1.5 text-[0.6875rem] uppercase tracking-[0.08em]",
                active ? "text-[var(--ink)]" : "text-[var(--muted-ink)]",
                active && "shadow-[inset_0_-2px_0_var(--action)]",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* The seam. It sits under the strip on the App tab only, because it is a
          claim about the panel directly below it and nowhere else. */}
      {activeTab === "app" ? (
        <p className="mono px-0.5 pt-2 text-[0.625rem] leading-snug text-[var(--muted-ink)]">
          {seam}
        </p>
      ) : null}

      {/* All five panels render, always — only the inactive ones carry
          `hidden`. `aria-controls` on each tab above points at a panel id that
          must exist in the DOM for assistive tech to resolve it; rendering
          only the active panel left four of five tabs pointing at nothing.
          `hidden` also keeps a panel's scroll position intact across tab
          switches, since it is never unmounted. `tabIndex={-1}` on the hidden
          ones keeps only the active panel in the tab order — `hidden` already
          does this in browsers that honour it, but the explicit index does
          not depend on that. */}
      {tabs.map((t) => {
        const active = t.key === activeTab;
        return (
          <div
            key={t.key}
            role="tabpanel"
            id={`${base}-panel-${t.key}`}
            aria-labelledby={`${base}-tab-${t.key}`}
            hidden={!active}
            tabIndex={active ? 0 : -1}
            className="space-y-4 pt-3 outline-none"
          >
            {tabBody(sections, t.key)}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The full-page route. The 380px rail, unchanged — this is the width it was
 * measured for, and the `@4xl` split is container-relative so it answers about
 * this element rather than the window.
 *
 * `AppSections` hands both layouts the same fine-grained members precisely so
 * this one can arrange them in the ORIGINAL page order rather than inheriting
 * whatever grouping the tabs want: left column is `publish`, `dataPlan`,
 * `permissions`, `ratings`; aside is `tradeLog`, `provenance`, `usage`. That
 * order is what `app-runtime.tsx` rendered before this refactor, and it must
 * stay exactly that — a shared tab-shaped bundle here once let a change made
 * for the drawer silently reorder this page too.
 *
 * It renders the rail ONLY, not `sections.app`. On the page the composed body
 * lives inside the tier panel with the strip and the header, and the rail sits
 * outside and below it — which is exactly where `app-runtime.tsx:571` had it
 * before this refactor. Folding the body in here would pull the rail inside the
 * panel and change the page's appearance, which this refactor must not do.
 */
export function RailSections({ sections }: { sections: AppSections }) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <div className="min-w-0 space-y-4">
        {sections.publish}
        {sections.dataPlan}
        {sections.permissions}
        {sections.ratings}
      </div>
      <aside className="min-w-0 space-y-4">
        {sections.tradeLog}
        {sections.provenance}
        {sections.usage}
      </aside>
    </div>
  );
}
