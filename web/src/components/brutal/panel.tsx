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

/** Charts scroll inside their own box. The page body never scrolls sideways. */
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
