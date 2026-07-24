/**
 * Shared chrome. Rule 1 lives here: border weight encodes agency tier.
 * Nothing in this file decorates — every class it emits means something.
 */
import type { ReactNode } from "react";
import type { AgencyTier } from "@/lib/contracts/manifest";
import { TIER_BLURB, TIER_LABEL } from "@/lib/seed";
import { cn } from "@/lib/utils";

/** readonly 1.5px · monitor 2.5px · autonomous 5px. The signature. */
export function panelClass(tier: AgencyTier, extra?: string): string {
  return cn(
    "panel",
    tier === "monitor" && "panel--monitor",
    tier === "autonomous" && "panel--autonomous",
    extra,
  );
}

export function TierTag({ tier, className }: { tier: AgencyTier; className?: string }) {
  return (
    <span
      className={cn("tag inline-flex items-center gap-1.5 whitespace-nowrap", className)}
      style={{
        borderWidth: tier === "autonomous" ? "3px" : tier === "monitor" ? "2px" : "1.5px",
        background: tier === "autonomous" ? "var(--ink)" : "transparent",
        color: tier === "autonomous" ? "var(--card-b)" : "var(--ink)",
      }}
      title={TIER_BLURB[tier]}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}

export function LiveDot({ label = "live" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="live-dot" aria-hidden />
      <span className="mono text-[0.6875rem] uppercase tracking-[0.08em]" style={{ color: "var(--live)" }}>
        {label}
      </span>
    </span>
  );
}

export function SectionHead({
  title,
  note,
  right,
}: {
  title: string;
  note?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-[2.5px] border-rule pb-2">
      <h2 className="display text-[0.9375rem] leading-none sm:text-base">{title}</h2>
      <div className="flex items-baseline gap-3">
        {note ? <span className="mono text-[0.6875rem] text-[var(--muted-ink)]">{note}</span> : null}
        {right}
      </div>
    </div>
  );
}

/** Label above a figure. Uppercase, small, quiet. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "mono block text-[0.625rem] uppercase leading-none tracking-[0.1em] text-[var(--muted-ink)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Every figure, address, hash and timestamp. Tabular numerals. */
export function Fig({
  children,
  accent,
  className,
}: {
  children: ReactNode;
  accent?: "live" | "gain" | "loss" | "risk" | "spend" | "ink";
  className?: string;
}) {
  return (
    <span
      className={cn("fig", className)}
      style={accent && accent !== "ink" ? { color: `var(--${accent})` } : undefined}
    >
      {children}
    </span>
  );
}

export function HairRule() {
  return <div className="h-px w-full" style={{ background: "var(--hairline)" }} />;
}
