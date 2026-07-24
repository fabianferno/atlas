"use client";

/**
 * The data voice (prd.md §6 Rule 4). Every figure, address, hash, timestamp
 * and log line goes through one of these. Tabular numerals always — `.mono`
 * and `.fig` in globals.css set `font-variant-numeric: tabular-nums`.
 */

import { cn } from "@/lib/utils";
import { toneText, type Tone } from "./tag";
import { fmtSignedPct, fmtStamp, shortAddr } from "./format";

const sizeClass = {
  xl: "text-[2.25rem] leading-[1.05] font-medium tracking-[-0.02em]",
  lg: "text-[1.5rem] leading-[1.1] font-medium tracking-[-0.01em]",
  md: "text-[1rem] leading-tight",
  sm: "text-[0.8125rem] leading-tight",
  xs: "text-[0.6875rem] leading-tight",
} as const;

export type FigSize = keyof typeof sizeClass;

/** A number. Mono, tabular, one of five tones or plain ink. */
export function Fig({
  size = "md",
  tone = "neutral",
  className,
  children,
  title,
}: {
  size?: FigSize;
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span title={title} className={cn("fig", sizeClass[size], toneText[tone], className)}>
      {children}
    </span>
  );
}

/** Signed change. Green up, red down, ink flat — semantic, not decorative. */
export function Delta({
  pct,
  abs,
  size = "sm",
  invert = false,
}: {
  pct?: number;
  abs?: string;
  size?: FigSize;
  /** For metrics where down is good (gas paid, liquidation risk). */
  invert?: boolean;
}) {
  if (pct === undefined && abs === undefined) return null;
  const v = pct ?? 0;
  const good = invert ? v < 0 : v > 0;
  const tone: Tone = v === 0 ? "neutral" : good ? "gain" : "loss";
  const arrow = v === 0 ? "→" : v > 0 ? "▲" : "▼";
  return (
    <Fig size={size} tone={tone} className="whitespace-nowrap">
      {arrow} {pct !== undefined ? fmtSignedPct(pct, 2) : abs}
    </Fig>
  );
}

/** An address. Never rendered full-width — it is an identifier, not prose. */
export function Address({
  value,
  label,
  size = "sm",
}: {
  value: string;
  label?: string;
  size?: FigSize;
}) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5">
      {label ? (
        <span className="truncate text-[0.75rem] font-medium">{label}</span>
      ) : null}
      <Fig size={size} tone="neutral" title={value} className="text-[var(--muted-ink)]">
        {shortAddr(value)}
      </Fig>
    </span>
  );
}

export function Stamp({ at, size = "xs" }: { at: string | number | Date; size?: FigSize }) {
  return (
    <Fig size={size} className="text-[var(--muted-ink)]">
      {fmtStamp(at)}
    </Fig>
  );
}
