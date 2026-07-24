"use client";

/**
 * Layout containers — the second, smaller half of the client-held catalog.
 *
 * These carry no data and take no actions; they exist so an A2UI document can
 * express "these four panels sit in a two-up grid". They are enumerated here
 * exactly like the data catalog: a closed set of names, resolved by lookup,
 * never constructed from agent output.
 *
 * Deliberately minimal. The composition rules live in the design system, not in
 * the agent's imagination — the fewer arrangement knobs exist, the harder it is
 * for a machine-assembled screen to look wrong (prd.md §6).
 */

import { cn } from "@/lib/utils";
import { Hair } from "@/components/brutal";

export interface LayoutProps {
  id: string;
  props: Record<string, unknown>;
  children: React.ReactNode;
  index: number;
}

const gapClass = (v: unknown) =>
  v === "none" ? "gap-0" : v === "sm" ? "gap-2" : v === "lg" ? "gap-6" : "gap-4";

function Column({ props, children }: LayoutProps) {
  return <div className={cn("flex min-w-0 flex-col", gapClass(props.gap))}>{children}</div>;
}

/** Stacks on mobile — the page body must never scroll sideways. */
function Row({ props, children }: LayoutProps) {
  return (
    <div className={cn("flex min-w-0 flex-col sm:flex-row sm:items-stretch", gapClass(props.gap))}>
      {children}
    </div>
  );
}

function Grid({ props, children }: LayoutProps) {
  const cols = typeof props.columns === "number" ? props.columns : 2;
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-1",
        cols >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2",
        gapClass(props.gap),
      )}
    >
      {children}
    </div>
  );
}

function Section({ props, children }: LayoutProps) {
  const title = typeof props.title === "string" ? props.title : "";
  return (
    <section className="flex min-w-0 flex-col gap-3">
      {title ? (
        <h2 className="display text-[0.9375rem] leading-tight">{title}</h2>
      ) : null}
      {children}
    </section>
  );
}

function Heading({ props }: LayoutProps) {
  const text = typeof props.text === "string" ? props.text : "";
  const level = typeof props.level === "number" ? props.level : 2;
  return (
    <h2
      className={cn(
        "display leading-tight",
        level <= 1 ? "text-[1.375rem]" : level === 2 ? "text-[1.0625rem]" : "text-[0.875rem]",
      )}
    >
      {text}
    </h2>
  );
}

function Text({ props }: LayoutProps) {
  const text = typeof props.text === "string" ? props.text : "";
  const muted = props.muted === true;
  return (
    <p
      className={cn(
        "max-w-prose text-[0.8125rem] leading-snug",
        muted && "text-[var(--muted-ink)]",
      )}
    >
      {text}
    </p>
  );
}

function Divider() {
  return <Hair />;
}

export type LayoutComponent = (p: LayoutProps) => React.ReactNode;

/** The closed set. Aliases map A2UI's stock names onto ours. */
export const LAYOUT: Record<string, LayoutComponent> = {
  column: Column,
  Column,
  row: Row,
  Row,
  grid: Grid,
  Grid,
  section: Section,
  Section,
  Card: Section,
  List: Column,
  heading: Heading,
  Heading: Heading,
  text: Text,
  Text: Text,
  divider: Divider,
  Divider: Divider,
};

export function lookupLayout(name: string): LayoutComponent | null {
  return Object.prototype.hasOwnProperty.call(LAYOUT, name) ? LAYOUT[name] : null;
}
