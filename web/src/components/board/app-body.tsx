"use client";

/**
 * The generated body of a mini app.
 *
 * TODO(integrator): W5 owns the real A2UI renderer at `@/components/renderer`.
 * This is a local stand-in so the Studio, the app route and the registry all
 * run today with fixture data. It draws the same catalog component names as
 * `lib/contracts/catalog.ts`, so the swap is one line:
 *
 *     <AppBody doc={manifest.ui as UiDoc} />   →   <Renderer doc={manifest.ui} />
 *
 * Rule 3 is respected here: charts are ink at varying weight with exactly one
 * semantic accent — the series the question was about. No protocol colours.
 */
import type { ReactNode } from "react";
import type { Accent, UiBlock, UiDoc } from "@/lib/seed";
import { fmtNum, fmtUsd } from "@/lib/store";
import { Fig, Label } from "@/components/board/chrome";
import { cn } from "@/lib/utils";

/** True for the local fixture shape. A real A2UI document has `components`. */
export function isUiDoc(v: unknown): v is UiDoc {
  return typeof v === "object" && v !== null && Array.isArray((v as { blocks?: unknown }).blocks);
}

export function AppBody({
  doc,
  animate = false,
  compact = false,
}: {
  doc: unknown;
  /** The assembling sequence. Components snap into place one at a time. */
  animate?: boolean;
  compact?: boolean;
}) {
  if (!isUiDoc(doc)) {
    // A real A2UI document arrived. W5's renderer owns this path — swap the
    // call site for `@/components/renderer` once it exports a surface.
    return (
      <div className="panel p-4">
        <p className="mono text-[0.6875rem] text-[var(--muted-ink)]">
          A2UI document present — hand it to the renderer.
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {doc.blocks.map((block, i) => (
        <section
          key={block.id}
          className={cn(
            "panel min-w-0 p-3",
            animate && "snap-in",
            block.span === 2 && "sm:col-span-2",
            block.span === 3 && "sm:col-span-2 xl:col-span-3",
          )}
          style={animate ? ({ ["--i" as string]: i } as React.CSSProperties) : undefined}
        >
          <div className="flex items-baseline justify-between gap-2 pb-2">
            <Label>{block.label}</Label>
            <span className="mono text-[0.5625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
              {block.component}
            </span>
          </div>
          <Block block={block} compact={compact} />
        </section>
      ))}
    </div>
  );
}

function Block({ block, compact }: { block: UiBlock; compact: boolean }) {
  switch (block.component) {
    case "metric_card": {
      const d = block.data;
      return (
        <div>
          <div className={cn("fig font-semibold leading-none", compact ? "text-2xl" : "text-3xl")}>{d.value}</div>
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            {d.delta ? (
              <Fig
                className="text-xs font-medium"
                accent={d.dir === "up" ? "gain" : d.dir === "down" ? "loss" : "ink"}
              >
                {d.delta}
              </Fig>
            ) : null}
            {d.sub ? <span className="text-xs text-[var(--muted-ink)]">{d.sub}</span> : null}
          </div>
        </div>
      );
    }

    case "leaderboard":
    case "bar_chart": {
      const d = block.data;
      const rows: { label: string; value: number; note?: string }[] = d.rows;
      const max = Math.max(...rows.map((r) => r.value), 1);
      return (
        <ol className="space-y-1.5">
          {rows.map((row, i) => {
            const note = row.note;
            return (
              <li key={row.label} className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs">
                    {block.component === "leaderboard" ? (
                      <span className="fig mr-1.5 text-[var(--muted-ink)]">{String(i + 1).padStart(2, "0")}</span>
                    ) : null}
                    {row.label}
                    {note ? <span className="ml-1.5 text-[0.6875rem] text-[var(--muted-ink)]">{note}</span> : null}
                  </span>
                  <Fig className="shrink-0 text-xs font-medium">
                    {d.unit === "%" ? `${row.value.toFixed(2)}%` : fmtUsd(row.value, { compact: true })}
                  </Fig>
                </div>
                <div className="mt-1 h-2 w-full" style={{ background: "var(--hairline)" }}>
                  <div
                    className={cn("h-full", i === d.accentIndex ? "bar--accent" : i < 3 ? "bar" : "bar--60")}
                    style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      );
    }

    case "time_series": {
      const d = block.data;
      const max = Math.max(...d.points);
      const min = Math.min(...d.points);
      const range = max - min || 1;
      const w = 300;
      const h = 84;
      const pts = d.points
        .map((p, i) => {
          const x = (i / Math.max(1, d.points.length - 1)) * w;
          const y = h - ((p - min) / range) * (h - 8) - 4;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
      return (
        <div>
          <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full" preserveAspectRatio="none" role="img" aria-label={block.label}>
            <line x1="0" y1={h - 1} x2={w} y2={h - 1} stroke="var(--hairline)" strokeWidth="2" />
            <polyline
              points={pts}
              fill="none"
              stroke={accentVar(d.accent ?? "ink")}
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="mt-1 flex justify-between">
            <span className="mono text-[0.625rem] text-[var(--muted-ink)]">{d.xFirst}</span>
            <span className="mono text-[0.625rem] text-[var(--muted-ink)]">{d.xLast}</span>
          </div>
        </div>
      );
    }

    case "gauge": {
      const d = block.data;
      const pct = clamp01((d.value - d.min) / (d.max - d.min || 1));
      const tPct = clamp01((d.threshold - d.min) / (d.max - d.min || 1));
      return (
        <div>
          <div className="flex items-baseline gap-2">
            <Fig className="text-3xl font-semibold leading-none" accent={d.status}>
              {d.value.toFixed(2)}
              {d.unit}
            </Fig>
            <span className="mono text-[0.625rem] text-[var(--muted-ink)]">
              trigger {d.threshold.toFixed(2)}
              {d.unit}
            </span>
          </div>
          <div className="relative mt-3 h-4 w-full border-[1.5px] border-rule">
            <div className="absolute inset-y-0 left-0" style={{ width: `${pct * 100}%`, background: accentVar(d.status) }} />
            <div
              className="absolute inset-y-[-4px] w-[3px]"
              style={{ left: `calc(${tPct * 100}% - 1.5px)`, background: "var(--ink)" }}
              aria-hidden
            />
          </div>
          <div className="mt-1 flex justify-between">
            <span className="mono text-[0.625rem] text-[var(--muted-ink)]">{d.min}</span>
            <span className="mono text-[0.625rem] text-[var(--muted-ink)]">{d.max}</span>
          </div>
        </div>
      );
    }

    case "progress_bar": {
      const d = block.data;
      const pct = clamp01(d.value / (d.target || 1));
      const spending = d.unit === "USD";
      return (
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <Fig className="text-2xl font-semibold leading-none" accent={spending && d.value > 0 ? "spend" : "ink"}>
              {spending ? fmtUsd(d.value) : `${d.value}${d.unit ? ` ${d.unit}` : ""}`}
            </Fig>
            <Fig className="text-xs text-[var(--muted-ink)]">
              of {spending ? fmtUsd(d.target) : `${d.target} ${d.unit}`}
            </Fig>
          </div>
          <div className="mt-2 h-3 w-full border-[1.5px] border-rule">
            <div
              className="h-full"
              style={{ width: `${pct * 100}%`, background: spending ? "var(--spend)" : "var(--ink)" }}
            />
          </div>
          {d.note ? <div className="mono mt-1 text-[0.625rem] text-[var(--muted-ink)]">{d.note}</div> : null}
        </div>
      );
    }

    case "comparison_grid": {
      const d = block.data;
      return (
        <Scroller>
          <table className="cells w-full text-xs">
            <thead>
              <tr>
                <th className="pb-1 text-left" />
                {d.columns.map((c) => (
                  <th key={c} className="mono pb-1 text-right text-[0.625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.label}>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{r.label}</td>
                  {r.cells.map((cell, i) => (
                    <td key={i} className="fig py-1.5 pl-3 text-right">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
      );
    }

    case "data_table": {
      const d = block.data;
      return (
        <Scroller>
          <table className="cells w-full text-xs">
            <thead>
              <tr>
                {d.columns.map((c, i) => (
                  <th
                    key={c}
                    className={cn(
                      "mono pb-1 text-[0.625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]",
                      d.numeric[i] ? "text-right" : "text-left",
                    )}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className={cn("py-1.5 whitespace-nowrap", d.numeric[ci] ? "fig pl-3 text-right" : "pr-3")}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
      );
    }

    case "position_card": {
      const d = block.data;
      return (
        <div>
          <div className="fig text-lg font-semibold leading-none">{d.asset}</div>
          <dl className="cells mt-2">
            {d.rows.map((r) => (
              <div key={r.k} className="flex items-baseline justify-between gap-3 border-t border-[var(--hairline)] py-1.5 first:border-t-0">
                <dt className="text-xs text-[var(--muted-ink)]">{r.k}</dt>
                <dd>
                  <Fig className="text-xs font-medium" accent={r.accent}>
                    {r.v}
                  </Fig>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      );
    }

    case "alert_banner": {
      const d = block.data;
      const dark = d.level !== "risk";
      return (
        <div
          className="flex items-center gap-2 border-[1.5px] border-rule px-2.5 py-2"
          style={{ background: accentVar(d.level), color: dark ? "#fff" : "var(--ink)" }}
        >
          <span className="mono text-[0.625rem] uppercase tracking-[0.1em] opacity-80">{d.level}</span>
          <span className="text-xs font-medium">{d.text}</span>
        </div>
      );
    }

    case "flow_diagram": {
      const d = block.data;
      const max = Math.max(...d.flows.map((f) => f.value), 1);
      return (
        <ul className="space-y-1.5">
          {d.flows.map((f) => (
            <li key={`${f.from}-${f.to}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs">
                  {f.from} <span className="text-[var(--muted-ink)]">→</span> {f.to}
                </span>
                <Fig className="shrink-0 text-xs font-medium">{fmtUsd(f.value, { compact: true })}</Fig>
              </div>
              <div className="mt-1 h-2 w-full" style={{ background: "var(--hairline)" }}>
                <div className="bar h-full" style={{ width: `${Math.max(2, (f.value / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      );
    }

    case "distribution": {
      const d = block.data;
      const max = Math.max(...d.buckets.map((b) => b.count), 1);
      return (
        <div>
          <div className="flex h-20 items-end gap-1">
            {d.buckets.map((b) => (
              <div
                key={b.label}
                className="bar flex-1"
                style={{ height: `${Math.max(4, (b.count / max) * 100)}%` }}
                title={`${b.label}: ${fmtNum(b.count)}`}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between">
            <span className="mono text-[0.625rem] text-[var(--muted-ink)]">{d.buckets[0]?.label}</span>
            <span className="mono text-[0.625rem] text-[var(--muted-ink)]">{d.buckets[d.buckets.length - 1]?.label}</span>
          </div>
        </div>
      );
    }
  }
}

function Scroller({ children }: { children: ReactNode }) {
  // Wide data scrolls inside its own container. The page never scrolls sideways.
  return <div className="-mx-1 overflow-x-auto px-1">{children}</div>;
}

function accentVar(accent: Accent): string {
  return accent === "ink" ? "var(--ink)" : `var(--${accent})`;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
