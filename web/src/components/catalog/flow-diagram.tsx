"use client";

/**
 * flow_diagram — data shape: `source_target_volume`. Bridge flows, aggregator
 * routing, collateral migrations.
 *
 * { flows: [{ source, target, value, accent? }], unit?, accent?: number }
 *
 * A two-column Sankey, hand-rolled. Ribbons are ink at low opacity so overlaps
 * read as density; the single largest route (or the one the composer flagged)
 * is `--live`. Node height is volume — the encoding is thickness, not colour.
 */

import { Panel, Empty, ScrollX, Fig, Label, fmtValue } from "@/components/brutal";
import { accentIndex, dict, num, pickStr, rowsOf, unitOf, type CatProps } from "./_shared";

interface Flow {
  source: string;
  target: string;
  value: number;
  accent?: unknown;
}

interface Node {
  key: string;
  total: number;
  y: number;
  h: number;
  cursor: number;
}

export function FlowDiagram({ data, label, index }: CatProps) {
  const d = dict(data);
  const title = label ?? pickStr(d, ["label", "title"], "");
  const unit = unitOf(d) || "usd";

  const flows: Flow[] = rowsOf(data, "flows", "links", "edges", "rows")
    .map((f) => {
      const o = dict(f);
      return {
        source: pickStr(o, ["source", "from", "src", "origin"], "—"),
        target: pickStr(o, ["target", "to", "dst", "destination"], "—"),
        value: num(o.value ?? o.v ?? o.volume ?? o.amount, 0),
        accent: o.accent,
      };
    })
    .filter((f) => f.value > 0)
    .sort((a, b) => b.value - a.value);

  if (flows.length === 0) {
    return (
      <Panel title={title || "flows"} index={index}>
        <Empty what="no flows" />
      </Panel>
    );
  }

  const ai = accentIndex(flows, flows.map((f) => f.value), d.accent);

  const W = 520;
  const NODE_W = 12;
  const GAP = 6;
  const PAD = 8;

  const build = (keys: string[], totals: Map<string, number>, height: number): Map<string, Node> => {
    const sum = keys.reduce((s, k) => s + (totals.get(k) ?? 0), 0) || 1;
    const usable = height - PAD * 2 - GAP * Math.max(0, keys.length - 1);
    const out = new Map<string, Node>();
    let y = PAD;
    for (const k of keys) {
      const h = Math.max(8, ((totals.get(k) ?? 0) / sum) * usable);
      out.set(k, { key: k, total: totals.get(k) ?? 0, y, h, cursor: y });
      y += h + GAP;
    }
    return out;
  };

  const srcTotals = new Map<string, number>();
  const dstTotals = new Map<string, number>();
  for (const f of flows) {
    srcTotals.set(f.source, (srcTotals.get(f.source) ?? 0) + f.value);
    dstTotals.set(f.target, (dstTotals.get(f.target) ?? 0) + f.value);
  }
  const srcKeys = [...srcTotals.keys()].sort((a, b) => (srcTotals.get(b) ?? 0) - (srcTotals.get(a) ?? 0));
  const dstKeys = [...dstTotals.keys()].sort((a, b) => (dstTotals.get(b) ?? 0) - (dstTotals.get(a) ?? 0));

  const H = Math.max(160, Math.max(srcKeys.length, dstKeys.length) * 34 + PAD * 2);
  const left = build(srcKeys, srcTotals, H);
  const right = build(dstKeys, dstTotals, H);

  const x0 = 96;
  const x1 = W - 96 - NODE_W;
  const total = flows.reduce((s, f) => s + f.value, 0);

  return (
    <Panel title={title} index={index}>
      <ScrollX minWidth={460}>
        <svg
          role="img"
          aria-label={`${title || "flows"}: ${flows.length} routes`}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="xMidYMid meet"
        >
          {flows.map((f, i) => {
            const s = left.get(f.source);
            const t = right.get(f.target);
            if (!s || !t) return null;
            const sh = (f.value / (s.total || 1)) * s.h;
            const th = (f.value / (t.total || 1)) * t.h;
            const sy = s.cursor;
            const ty = t.cursor;
            s.cursor += sh;
            t.cursor += th;
            const mx = (x0 + NODE_W + x1) / 2;
            const accent = i === ai;
            const path = [
              `M ${x0 + NODE_W} ${sy}`,
              `C ${mx} ${sy}, ${mx} ${ty}, ${x1} ${ty}`,
              `L ${x1} ${ty + th}`,
              `C ${mx} ${ty + th}, ${mx} ${sy + sh}, ${x0 + NODE_W} ${sy + sh}`,
              "Z",
            ].join(" ");
            return (
              <path
                key={`${f.source}-${f.target}-${i}`}
                d={path}
                fill={accent ? "var(--live)" : "var(--ink)"}
                fillOpacity={accent ? 0.5 : 0.14}
                stroke={accent ? "var(--live)" : "none"}
                strokeWidth={accent ? 1 : 0}
              >
                <title>{`${f.source} → ${f.target}: ${fmtValue(f.value, unit)}`}</title>
              </path>
            );
          })}

          {[...left.values()].map((n) => (
            <g key={`s-${n.key}`}>
              <rect x={x0} y={n.y} width={NODE_W} height={n.h} fill="var(--ink)" stroke="var(--rule)" strokeWidth={1} />
              <text
                x={x0 - 6}
                y={n.y + n.h / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--ink)"
              >
                {n.key}
              </text>
            </g>
          ))}
          {[...right.values()].map((n) => (
            <g key={`t-${n.key}`}>
              <rect x={x1} y={n.y} width={NODE_W} height={n.h} fill="var(--ink)" stroke="var(--rule)" strokeWidth={1} />
              <text
                x={x1 + NODE_W + 6}
                y={n.y + n.h / 2}
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--ink)"
              >
                {n.key}
              </text>
            </g>
          ))}
        </svg>
      </ScrollX>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Label>
          total <Fig size="xs">{fmtValue(total, unit)}</Fig>
        </Label>
        <Label>
          top route{" "}
          <span className="text-live">
            {flows[ai].source} → {flows[ai].target}
          </span>{" "}
          <Fig size="xs" tone="live">
            {fmtValue(flows[ai].value, unit)}
          </Fig>
        </Label>
      </div>
    </Panel>
  );
}
