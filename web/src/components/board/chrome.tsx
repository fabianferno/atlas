/**
 * Shared chrome. Rule 1 lives here: border weight encodes agency tier.
 * Nothing in this file decorates — every class it emits means something.
 */
import type { ReactNode } from "react";
import type { AgencyTier } from "@/lib/contracts/manifest";
import { TIER_BLURB, TIER_LABEL } from "@/lib/seed";
import { cn } from "@/lib/utils";
import { SponsorMark, type Sponsor } from "@/components/brand/sponsor-mark";

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
        background: tier === "autonomous" ? "var(--action)" : "var(--card-b)",
        color: tier === "autonomous" ? "#fff" : "var(--ink)",
        boxShadow:
          tier === "autonomous"
            ? "inset 0 1px 0 rgba(255,255,255,0.4), var(--elev-2)"
            : tier === "monitor"
              ? "inset 0 1px 0 var(--bevel-hi), var(--elev-1), 0 0 0 1px color-mix(in srgb, var(--live) 30%, transparent)"
              : "var(--inset-groove)",
      }}
      title={TIER_BLURB[tier]}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}

/**
 * LIVE — reserved for something that is genuinely happening right now.
 *
 * This mark used to sit on every mini app whose `running` flag was true, which
 * asserted an open Substreams subscription. Nothing was subscribed: until
 * `watchBlocks` landed, `POST /api/stream` had no callers anywhere in the
 * product. So the loudest signal in the design system was backing the one claim
 * the system could not make.
 *
 * The rule now: `--live` and the `.live-dot` blip mean a bounded Substreams run
 * is open at this moment, or a request is genuinely in flight. For "configured
 * and would act if a trigger fired", use `ArmedLamp`. §6 Rule 2 — colour is
 * semantic, never decorative — is what forces the split rather than letting one
 * mark cover both.
 */
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

const ARMED_TITLE =
  "Armed — published, not halted, and would act if a trigger fired. Not subscribed: a Substreams run is opened only by a bounded watch, and nothing is streaming right now.";

/**
 * ARMED — a lamp that is wired but not lit.
 *
 * The same moulded dome as the source-health pips in `app-runtime.tsx`, and
 * pointedly NOT `.live-dot`: no glow, no `blip` animation, `--gain` rather than
 * `--live`. A glow reads as transmitting, which is the exact claim this mark
 * must not make.
 *
 * `--gain` is "policy passed" in Rule 2's five, and the policy strip already
 * renders the literal word "armed" in that colour — so this reuses an existing
 * pairing instead of minting a sixth accent for a fact the system already had a
 * colour for.
 *
 * Armed is still the interesting state at the autonomous tier: per §7 an armed
 * agent holds standing spending authority whether or not a block is arriving.
 */
export function ArmedLamp({
  label,
  className,
  /** Card faces run this small; the top bar matches its neighbours at 0.6875rem. */
  labelClassName = "text-[0.5625rem]",
}: {
  label?: string;
  className?: string;
  labelClassName?: string;
}) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5", className)} title={ARMED_TITLE}>
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full"
        style={{
          background: "var(--gain)",
          boxShadow:
            "inset 0 -1px 1px rgba(0,0,0,0.30), 0 0 0 1.5px color-mix(in srgb, var(--gain) 20%, transparent)",
        }}
      />
      {label ? (
        <span
          className={cn("mono uppercase tracking-[0.08em]", labelClassName)}
          style={{ color: "var(--gain)" }}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}

export function SectionHead({
  title,
  note,
  right,
  // Same chrome either way — `as` only sets the outline level, for surfaces
  // where this head is the page's leading heading rather than a section's.
  as: Heading = "h2",
}: {
  /**
   * A node, not a string, so a head that names a protocol can carry that
   * protocol's mark inside the sentence — "Explore mini apps on ⬤ The Graph" —
   * rather than parking a logo in the `right` slot where it reads as chrome.
   * Callers passing a plain string are unaffected.
   */
  title: ReactNode;
  note?: string;
  right?: ReactNode;
  as?: "h1" | "h2";
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline shadow-[inset_0_-1px_0_var(--bevel-hi)] pb-2">
      <Heading className="display text-[0.9375rem] leading-none sm:text-base">{title}</Heading>
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

export function KV({
  k,
  v,
  mono,
  accent,
  href,
  mark,
}: {
  k: string;
  /*
   * A node, not just a string. It was `string`, and that is why the Schemas row
   * above was a `join(" · ")` — the only rendering the type allowed. A row whose
   * value contains one part that is measured and one part that is a declaration
   * with nothing behind it cannot be coloured as a single fact, and flattening it
   * to one grey string is what let a dead family read like a live source. Callers
   * that pass a plain string are unaffected.
   */
  v: React.ReactNode;
  mono?: boolean;
  accent?: "live" | "gain" | "loss" | "risk" | "spend";
  /** Only pass this when the destination is known to exist. */
  href?: string | null;
  /**
   * Whose infrastructure this row is about, marked beside the term rather than
   * the value. The value column is right-aligned and truncates, so a logo in it
   * would be the first thing cut; the term never truncates.
   *
   * Only pass it when the row holds a value, never when it reads "not minted"
   * or "none" — a sponsor mark against an absence is the failure described in
   * the header of `sponsor-mark.tsx`.
   */
  mark?: Sponsor;
}) {
  const fig = (
    <Fig className={cn("text-[0.6875rem]", mono && "block truncate")} accent={accent}>
      {v}
    </Fig>
  );
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-[var(--hairline)] py-1.5 first:border-t-0">
      <dt className="mono flex shrink-0 items-center gap-1.5 text-[0.625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
        {mark ? <SponsorMark of={mark} size={12} /> : null}
        {k}
      </dt>
      <dd className="min-w-0 text-right">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="underline decoration-dotted">
            {fig}
          </a>
        ) : (
          fig
        )}
      </dd>
    </div>
  );
}
