"use client";

/**
 * time_series — data shapes: `timeseries_one_metric`, `timeseries_many_metrics`.
 *
 * { series: [{ name, accent?, points: [{ t, v }] }], unit?, accent?: number }
 * or the single-series shorthand { points: [{ t, v }], unit? }
 *
 * Hand-rolled SVG. Lines are ink at descending weight; one line — the series
 * the question was about — is `--live` and 2px (Rule 3). No fills, no dots
 * except on the last point, which is the one you actually read.
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
  LiveDot,
} from "@/components/brutal";
import { accentIndex, dict, list, num, pickStr, str, bool, unitOf, type CatProps } from "./_shared";

interface Pt {
  t: number;
  v: number;
}

function readPoints(v: unknown): Pt[] {
  return list(v)
    .map((p) => {
      if (Array.isArray(p) && p.length >= 2) {
        return { t: toTime(p[0]), v: num(p[1], NaN) };
      }
      const o = dict(p);
      return {
        t: toTime(o.t ?? o.time ?? o.timestamp ?? o.date ?? o.x),
        v: num(o.v ?? o.value ?? o.y ?? o.amount, NaN),
      };
    })
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
}

function toTime(v: unknown): number {
  if (typeof v === "number") {
    // Subgraph timestamps are seconds; JS wants ms. Anything before 2001 in ms
    // is almost certainly a seconds value.
    return v < 1e11 ? v * 1000 : v;
  }
  const s = str(v);
  const n = Number(s);
  if (Number.isFinite(n) && s !== "") return n < 1e11 ? n * 1000 : n;
  const d = Date.parse(s);
  return Number.isFinite(d) ? d : NaN;
}

export function TimeSeries({ data, label, index }: CatProps) {
  const d = dict(data);
  const unit = unitOf(d);
  const title = label ?? pickStr(d, ["label", "title"], "");
  const live = bool(d.live ?? d.streaming);

  const rawSeries = Array.isArray(d.series)
    ? d.series
    : Array.isArray(d.points) || Array.isArray(data)
      ? [{ name: pickStr(d, ["name"], title || "series"), points: d.points ?? data }]
      : [];

  const series = list(rawSeries)
    .map((s) => {
      const o = dict(s);
      return {
        name: pickStr(o, ["name", "label", "key"], "series"),
        accent: o.accent,
        points: readPoints(o.points ?? o.values ?? o.data ?? s),
      };
    })
    .filter((s) => s.points.length > 1);

  if (series.length === 0) {
    return (
      <Panel title={title || "time series"} index={index}>
        <Empty what="no points" />
      </Panel>
    );
  }

  const ai = accentIndex(
    series,
    series.map((s) => Math.max(...s.points.map((p) => p.v))),
    d.accent,
  );

  const allV = series.flatMap((s) => s.points.map((p) => p.v));
  const allT = series.flatMap((s) => s.points.map((p) => p.t));
  const [lo, hi, ticks] = niceDomain(Math.min(...allV), Math.max(...allV), 4);

  const b = box(520, 190, { left: 46, top: 12, bottom: 22, right: 10 });
  const x = scale(Math.min(...allT), Math.max(...allT), b.left, b.left + plotW(b));
  const y = scale(lo, hi, b.top + plotH(b), b.top);

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const tMin = Math.min(...allT);
    const t = tMin + f * (Math.max(...allT) - tMin);
    return { x: x(t), text: fmtStamp(t) };
  });

  return (
    <Panel
      title={title}
      index={index}
      meta={
        live ? (
          <span className="inline-flex items-center gap-1 text-live">
            <LiveDot />
            live
          </span>
        ) : undefined
      }
    >
      <ScrollX minWidth={420}>
        <ChartSvg b={b} label={title || "time series"}>
          <YAxis b={b} ticks={ticks} y={y} format={(v) => fmtCompact(v)} />
          <Frame b={b} />
          {series.map((s, i) => {
            const pts = s.points.map((p) => ({ x: x(p.t), y: y(p.v) }));
            const accent = i === ai;
            const last = pts[pts.length - 1];
            return (
              <g key={`${s.name}-${i}`}>
                <path
                  d={linePath(pts)}
                  fill="none"
                  stroke={accent ? "var(--live)" : inkRamp(i + (i >= ai ? 0 : 1))}
                  strokeWidth={accent ? 2.25 : 1.25}
                  strokeLinejoin="miter"
                  strokeLinecap="butt"
                />
                <rect
                  x={last.x - 2.5}
                  y={last.y - 2.5}
                  width={5}
                  height={5}
                  fill={accent ? "var(--live)" : "var(--ink)"}
                />
              </g>
            );
          })}
          <XLabels b={b} items={xTicks} />
        </ChartSvg>
      </ScrollX>
      <Legend
        items={series.map((s, i) => ({
          name: unit ? `${s.name} (${unit})` : s.name,
          color: i === ai ? "var(--live)" : inkRamp(i + (i >= ai ? 0 : 1)),
          accent: i === ai,
        }))}
      />
    </Panel>
  );
}
