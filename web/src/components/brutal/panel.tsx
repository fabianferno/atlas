"use client";

/**
 * The container every catalog component sits in.
 *
 * Rule 1 (tier → border weight) and the density discipline both live here, so
 * no individual catalog component ever sets a border width. One heavy frame,
 * then hairlines inside.
 *
 * Rule: `.raise` is NEVER applied to a static panel. Pass `actionable` only
 * when the whole panel is a target you can press.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { AgencyTier } from "@/lib/contracts/manifest";
import { useRuntime, tierPanelClass } from "./tier";

export interface PanelProps {
  /** Overrides ambient tier. Almost never needed outside the demo grid. */
  tier?: AgencyTier;
  title?: React.ReactNode;
  /** Right side of the header — tags, counts, live dot. */
  meta?: React.ReactNode;
  /** Only rendered for autonomous tier. Pinned to the top edge. */
  policyStrip?: React.ReactNode;
  /** Stagger index for the assembling animation (`--i`). */
  index?: number;
  /** Adds the hard offset shadow. Actionable surfaces only. */
  actionable?: boolean;
  /** Removes inner padding — tables and logs manage their own. */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
}

export function Panel({
  tier,
  title,
  meta,
  policyStrip,
  index = 0,
  actionable = false,
  flush = false,
  className,
  bodyClassName,
  children,
}: PanelProps) {
  const runtime = useRuntime();
  const t = tier ?? runtime.tier;

  return (
    <section
      className={cn(
        tierPanelClass(t),
        "snap-in flex min-w-0 flex-col",
        actionable && "raise",
        className,
      )}
      style={{ ["--i"]: index } as React.CSSProperties}
    >
      {t === "autonomous" && policyStrip ? (
        <div className="policy-strip">{policyStrip}</div>
      ) : null}

      {title || meta ? (
        <header
          className={cn(
            "flex min-w-0 items-baseline justify-between gap-3 px-3 py-2",
            // Density: hairline inside the frame, never another heavy rule.
            "border-b border-hairline",
            // Rule 1 chrome for monitor tier: a dashed live rule says
            // "this thing is watching" without a badge to read.
            t === "monitor" && "border-b border-[color:color-mix(in_srgb,var(--live)_45%,var(--hairline))]",
          )}
        >
          {title ? (
            <h3 className="display truncate text-[0.8125rem] leading-tight">{title}</h3>
          ) : (
            <span />
          )}
          {meta ? (
            <div className="flex shrink-0 items-center gap-2 text-[0.6875rem]">{meta}</div>
          ) : null}
        </header>
      ) : null}

      <div className={cn("min-w-0 flex-1", !flush && "p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Small uppercase label. The quiet voice inside a panel. */
export function Label({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--muted-ink)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Hairline separator. Containers get borders; insides get these. */
export function Hair({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-hairline", className)} />;
}

/**
 * Charts scroll inside their own box. The page body never scrolls sideways.
 * A box that also needs to bound its HEIGHT wants `ScrollList` instead.
 */
export function ScrollX({
  minWidth = 420,
  className,
  children,
}: {
  minWidth?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("w-full overflow-x-auto overflow-y-hidden", className)}>
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}

/** SSR renders nothing that needs measuring; only the client does the layout pass. */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** How many rows a list-shaped panel shows before it starts scrolling. */
export const VISIBLE_ROWS = 10;

/**
 * A list panel with a bounded viewport.
 *
 * The composer controls how many panels an app has; it does not control how many
 * ROWS a panel gets — that is whatever the subgraph returned. A 400-row
 * leaderboard makes the app a mile long and every panel under it unreachable, so
 * a list longer than `visible` scrolls inside its own box instead of growing the
 * page. Nothing is dropped: every row stays scrollable-to, and the panel's meta
 * says the viewport is partial.
 *
 * The cutoff is MEASURED, not estimated: rows here are variable height (a
 * leaderboard row grows when it carries an address, a journal line wraps), so
 * the box takes the exact offset of row `visible + 1` and cuts there. Callers
 * mark their row elements with `data-row` — including `<tr>`s, which is why this
 * also owns the horizontal axis: a table needs ONE scrollport for both axes or
 * its sticky head has nothing to stick to.
 *
 * `est` is the pre-measurement guess, used only for the first paint so a long
 * list never flashes at full height before clamping.
 */
export function ScrollList({
  count,
  visible = VISIBLE_ROWS,
  est = 32,
  minWidth,
  className,
  children,
}: {
  /** Row count, so the component knows whether to bound anything at all. */
  count: number;
  visible?: number;
  /** Approximate row height in px, for the first paint only. */
  est?: number;
  /** Set for tables/charts that also need to scroll sideways. */
  minWidth?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const over = count > visible;
  const [measured, setMeasured] = useState<number | null>(null);

  useIsoLayoutEffect(() => {
    if (!over) {
      setMeasured(null);
      return;
    }
    const el = box.current;
    if (!el) return;

    const measure = () => {
      const rows = el.querySelectorAll<HTMLElement>("[data-row]");
      const cut = rows[visible];
      if (!cut) return;
      // Scroll-content coordinates: adding scrollTop back keeps this stable no
      // matter where the box is currently scrolled, so re-measures converge.
      const h = Math.round(
        cut.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop,
      );
      if (h > 0) setMeasured((prev) => (prev !== null && Math.abs(prev - h) <= 1 ? prev : h));
    };

    measure();
    // A scrollbar appearing can re-wrap a row, and the panel itself resizes with
    // the grid. Watch the box and the rows that define the cutoff.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const r of Array.from(el.querySelectorAll<HTMLElement>("[data-row]")).slice(0, visible + 1)) {
      ro.observe(r);
    }
    return () => ro.disconnect();
  }, [over, visible, count]);

  const maxHeight = over ? (measured ?? (visible + 1) * est) : undefined;

  return (
    <div
      ref={box}
      className={cn(
        "w-full",
        over ? "overflow-y-auto" : "overflow-y-hidden",
        minWidth === undefined ? null : "overflow-x-auto",
        className,
      )}
      style={maxHeight === undefined ? undefined : { maxHeight }}
    >
      {minWidth === undefined ? children : <div style={{ minWidth }}>{children}</div>}
    </div>
  );
}

/** The line a bounded list puts in its panel meta, so a cut never reads as a loss. */
export function rowsMeta(count: number, visible = VISIBLE_ROWS, noun = "rows"): string {
  return count > visible ? `${visible} of ${count} ${noun} · scroll` : `${count} ${noun}`;
}

/**
 * What a component renders when the agent referenced it but the data model had
 * nothing at that path. Visible, never silent — a blank panel in a demo reads
 * as a bug in the renderer rather than a gap in the data.
 */
export function Empty({ what = "no data" }: { what?: string }) {
  return (
    <div className="mono flex min-h-16 items-center justify-center border border-dashed border-hairline px-3 py-4 text-[0.75rem] text-[var(--muted-ink)]">
      {what}
    </div>
  );
}
