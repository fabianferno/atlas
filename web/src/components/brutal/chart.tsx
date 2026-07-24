"use client";

/**
 * Hand-rolled SVG chart scaffolding. No charting library.
 *
 * prd.md §6 Rule 3: charts are monochrome ink at varying weight plus EXACTLY
 * one semantic accent — the series the question was about. There is therefore
 * no categorical palette in this file, and adding one is a design regression.
 * `inkRamp` is the only series-colour source, and `accent` is a single opt-in.
 *
 * With ten schema families a rainbow chart is both illegible and generic;
 * position and labels carry what colour would have.
 */

import { cn } from "@/lib/utils";

/** Monochrome series ramp: ink, then progressively mixed toward paper. */
export const INK_RAMP = [
  "var(--ink)",
  "color-mix(in srgb, var(--ink) 62%, var(--paper))",
  "color-mix(in srgb, var(--ink) 42%, var(--paper))",
  "color-mix(in srgb, var(--ink) 26%, var(--paper))",
  "color-mix(in srgb, var(--ink) 16%, var(--paper))",
] as const;

export function inkRamp(i: number): string {
  return INK_RAMP[Math.min(i, INK_RAMP.length - 1)];
}

/** The bar classes from globals.css, in ramp order. */
export const BAR_RAMP = ["bar", "bar--60", "bar--35", "bar--35", "bar--35"] as const;

export function barRamp(i: number): string {
  return BAR_RAMP[Math.min(i, BAR_RAMP.length - 1)];
}

export interface Box {
  w: number;
  h: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function box(
  w: number,
  h: number,
  pad: Partial<Pick<Box, "top" | "right" | "bottom" | "left">> = {},
): Box {
  return {
    w,
    h,
    top: pad.top ?? 10,
    right: pad.right ?? 8,
    bottom: pad.bottom ?? 20,
    left: pad.left ?? 42,
  };
}

export const plotW = (b: Box) => Math.max(1, b.w - b.left - b.right);
export const plotH = (b: Box) => Math.max(1, b.h - b.top - b.bottom);

/** Linear scale factory. Domain [min,max] → range [a,b]. */
export function scale(min: number, max: number, a: number, b: number) {
  const span = max - min || 1;
  return (v: number) => a + ((v - min) / span) * (b - a);
}

/** Round a domain outward to human ticks. Charts should not show 1.00003. */
export function niceDomain(min: number, max: number, ticks = 4): [number, number, number[]] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1, [0, 1]];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(1, ticks);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Number(v.toFixed(10)));
  return [lo, hi, out];
}

/**
 * Responsive SVG frame. Fixed coordinate system, scaled to the container, with
 * horizontal scroll owned by the chart rather than the page.
 */
export function ChartSvg({
  b,
  className,
  children,
  label,
}: {
  b: Box;
  className?: string;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${b.w} ${b.h}`}
      width="100%"
      height={b.h}
      preserveAspectRatio="xMidYMid meet"
      className={cn("block overflow-visible", className)}
    >
      {children}
    </svg>
  );
}

/** Hairline gridlines + left axis labels. Quiet by construction. */
export function YAxis({
  b,
  ticks,
  y,
  format,
}: {
  b: Box;
  ticks: number[];
  y: (v: number) => number;
  format: (v: number) => string;
}) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={b.left}
            x2={b.w - b.right}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--hairline)"
            strokeWidth={1}
          />
          <text
            x={b.left - 6}
            y={y(t)}
            textAnchor="end"
            dominantBaseline="middle"
            className="fig"
            fontSize={9}
            fill="var(--muted-ink)"
          >
            {format(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

export function XLabels({
  b,
  items,
}: {
  b: Box;
  items: { x: number; text: string }[];
}) {
  return (
    <g>
      {items.map((it, i) => (
        <text
          key={`${it.text}-${i}`}
          x={it.x}
          y={b.h - b.bottom + 12}
          textAnchor="middle"
          className="fig"
          fontSize={9}
          fill="var(--muted-ink)"
        >
          {it.text}
        </text>
      ))}
    </g>
  );
}

/** The plot floor and left wall. Black, 1.5px — the frame, not decoration. */
export function Frame({ b }: { b: Box }) {
  return (
    <path
      d={`M ${b.left} ${b.top} L ${b.left} ${b.h - b.bottom} L ${b.w - b.right} ${b.h - b.bottom}`}
      fill="none"
      stroke="var(--rule)"
      strokeWidth={1.5}
    />
  );
}

export function linePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}

export function areaPath(pts: { x: number; y: number }[], base: number): string {
  if (pts.length === 0) return "";
  const first = pts[0];
  const last = pts[pts.length - 1];
  return `${linePath(pts)} L ${last.x.toFixed(2)} ${base.toFixed(2)} L ${first.x.toFixed(2)} ${base.toFixed(2)} Z`;
}

/**
 * The one-accent legend. Renders series names with their ink weight and marks
 * the accented one. If more than one series would be accented, that is a bug
 * in the caller, not something to render.
 */
export function Legend({
  items,
}: {
  items: { name: string; color: string; accent?: boolean }[];
}) {
  if (items.length < 2) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((it) => (
        <span key={it.name} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2 w-3 border border-rule"
            style={{ background: it.color }}
          />
          <span
            className={cn(
              "text-[0.6875rem]",
              it.accent ? "font-semibold text-ink" : "text-[var(--muted-ink)]",
            )}
          >
            {it.name}
          </span>
        </span>
      ))}
    </div>
  );
}
