"use client";

/**
 * area_stack — data shape: `timeseries_composition`.
 *
 * { layers: [{ name, accent?, points: [{ t, v }] }], unit?, accent?: number }
 *
 * Composition of a whole over time — TVL by pool, borrows by collateral. Bands
 * are the ink ramp with a hairline between them; one band takes `--live`.
 * Explicitly NOT a colour-coded stack: ten schema families would give ten
 * indistinguishable pastels (Rule 3).
 */

import {
  Panel,
  Empty,
  ScrollX,
  Legend,
  ChartSvg,
  YAxis,
  XLabels,
  Frame,
  box,
  plotH,
  plotW,
  scale,
  niceDomain,
  linePath,
  inkRamp,
  fmtCompact,
  fmtStamp,
} from "@/components/brutal";
import { accentIndex, dict, list, num, pickStr, str, unitOf, type CatProps } from "./_shared";

function toTime(v: unknown): number {
  if (typeof v === "number") return v < 1e11 ? v * 1000 : v;
  const s = str(v);
  // `num()` refuses "0x…"; a bare `Number(s)` would read an entity id as a hex
  // literal and put the point 1e37 years out, which silently collapses the
  // whole stack onto one pixel. Same guard as time-series/candlestick.
  const n = num(s, NaN);
  if (Number.isFinite(n) && s !== "") return n < 1e11 ? n * 1000 : n;
  const d = Date.parse(s);
  return Number.isFinite(d) ? d : NaN;
}

export function AreaStack({ data, label, index }: CatProps) {
  const d = dict(data);
  const unit = unitOf(d);
  const title = label ?? pickStr(d, ["label", "title"], "");

  const layers = list(d.layers ?? d.series ?? d.stacks)
    .map((s) => {
      const o = dict(s);
      const pts = list(o.points ?? o.values ?? o.data)
        .map((p) => {
          const q = dict(p);
          return {
            t: toTime(q.t ?? q.time ?? q.timestamp ?? q.date ?? q.x),
            v: num(q.v ?? q.value ?? q.y, 0),
          };
        })
        .filter((p) => Number.isFinite(p.t))
        .sort((a, b) => a.t - b.t);
      return { name: pickStr(o, ["name", "label", "key"], "layer"), accent: o.accent, points: pts };
    })
    .filter((l) => l.points.length > 1);

  if (layers.length === 0) {
    return (
      <Panel title={title || "area stack"} index={index}>
        <Empty what="no layers" />
      </Panel>
    );
  }

  // Align on the shortest layer — a ragged stack lies about the total.
  const n = Math.min(...layers.map((l) => l.points.length));
  const times = layers[0].points.slice(0, n).map((p) => p.t);
  const cumulative: number[][] = [];
  let running = new Array<number>(n).fill(0);
  for (const l of layers) {
    running = running.map((acc, i) => acc + Math.max(0, l.points[i].v));
    cumulative.push([...running]);
  }
  const totals = cumulative[cumulative.length - 1];

  const [lo, hi, ticks] = niceDomain(0, Math.max(...totals), 4);
  const b = box(520, 190, { left: 46, top: 12, bottom: 22, right: 10 });
  const x = scale(times[0], times[n - 1], b.left, b.left + plotW(b));
  const y = scale(lo, hi, b.top + plotH(b), b.top);

  const ai = accentIndex(
    layers,
    layers.map((l) => l.points.reduce((s, p) => s + p.v, 0)),
    d.accent,
  );

  const baseline = y(lo);

  return (
    <Panel title={title} index={index}>
      <ScrollX minWidth={420}>
        <ChartSvg b={b} label={title || "area stack"}>
          <YAxis b={b} ticks={ticks} y={y} format={(v) => fmtCompact(v)} />
          {/* Painted top-down so each band covers the one beneath it. */}
          {cumulative
            .map((top, i) => ({ top, i }))
            .reverse()
            .map(({ top, i }) => {
              const upper = top.map((v, k) => ({ x: x(times[k]), y: y(v) }));
              const path = `${linePath(upper)} L ${x(times[n - 1]).toFixed(2)} ${baseline.toFixed(
                2,
              )} L ${x(times[0]).toFixed(2)} ${baseline.toFixed(2)} Z`;
              return (
                <path
                  key={`${layers[i].name}-${i}`}
                  d={path}
                  fill={i === ai ? "var(--live)" : inkRamp(i + (i >= ai ? 0 : 1))}
                  stroke="var(--card-b)"
                  strokeWidth={0.75}
                />
              );
            })}
          <Frame b={b} />
          <XLabels
            b={b}
            items={[0, 0.5, 1].map((f) => {
              const t = times[Math.round(f * (n - 1))];
              return { x: x(t), text: fmtStamp(t) };
            })}
          />
        </ChartSvg>
      </ScrollX>
      <Legend
        items={layers.map((l, i) => ({
          name: unit ? `${l.name} (${unit})` : l.name,
          color: i === ai ? "var(--live)" : inkRamp(i + (i >= ai ? 0 : 1)),
          accent: i === ai,
        }))}
      />
    </Panel>
  );
}
