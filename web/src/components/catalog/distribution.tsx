"use client";

/**
 * distribution — data shape: `many_observations`. Holder concentration, trade
 * size distribution, LTV spread across a lending market.
 *
 * Composer payload:
 *   { metric, unit, count, total,
 *     buckets: [{ from, to, count }],   // already binned, 12 buckets
 *     top: [{ label, value }] }
 * Also accepts raw { values: number[] } or { bins: [{from,to,count}] }.
 *
 * Histogram in ink; the modal bin takes the accent because "where is the mass"
 * is the question this shape answers. Markers are black rules with labels —
 * they are annotations, not another series.
 */

import { Panel, Empty, Fig, Label, ScrollX, fmtCompact, fmtNum } from "@/components/brutal";
import { cn } from "@/lib/utils";
import { dict, list, num, pickStr, numOr, pick, str, unitOf, type CatProps } from "./_shared";

interface Bin {
  from: number;
  to: number;
  count: number;
}

export function Distribution({ data, label, index }: CatProps) {
  const d = dict(data);
  const title = label ?? pickStr(d, ["label", "title"], "");
  const unit = unitOf(d);

  const preBinned = list(d.buckets ?? d.bins)
    .map((b) => {
      const o = dict(b);
      return {
        from: num(o.from ?? o.lo ?? o.start, NaN),
        to: num(o.to ?? o.hi ?? o.end, NaN),
        count: num(o.count ?? o.n ?? o.value, NaN),
      };
    })
    .filter((b) => Number.isFinite(b.count) && Number.isFinite(b.from));

  const values = list(d.values ?? d.observations ?? (Array.isArray(data) ? data : []))
    .map((v) => num(v, NaN))
    .filter(Number.isFinite);

  let bins: Bin[] = preBinned;
  if (bins.length === 0 && values.length > 0) {
    const k = Math.max(4, Math.min(24, numOr(pick(d, "binCount", "bins"), Math.ceil(Math.sqrt(values.length)))));
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const w = (hi - lo) / k || 1;
    bins = Array.from({ length: k }, (_, i) => ({
      from: lo + i * w,
      to: lo + (i + 1) * w,
      count: 0,
    }));
    for (const v of values) {
      const i = Math.min(k - 1, Math.max(0, Math.floor((v - lo) / w)));
      bins[i].count += 1;
    }
  }

  if (bins.length === 0) {
    return (
      <Panel title={title || "distribution"} index={index}>
        <Empty what="no observations" />
      </Panel>
    );
  }

  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const modal = bins.findIndex((b) => b.count === maxCount);
  const lo = bins[0].from;
  const hi = bins[bins.length - 1].to;
  const total = bins.reduce((s, b) => s + b.count, 0);

  const markers = list(d.markers).map((m) => {
    const o = dict(m);
    return { label: pickStr(o, ["label", "name"], ""), value: num(o.value ?? o.v, NaN) };
  });

  return (
    <Panel title={title} index={index}>
      <ScrollX minWidth={Math.max(320, bins.length * 16)}>
        <div className="relative">
          <div className="flex h-36 items-end gap-px border-b-[1.5px] border-rule">
            {bins.map((b, i) => (
              <div
                key={i}
                title={`${fmtNum(b.from, 2)} – ${fmtNum(b.to, 2)} ${unit}: ${b.count}`}
                className={cn(
                  "min-w-[3px] flex-1 border border-b-0 border-rule",
                  i === modal ? "bar--accent" : "bar--60",
                )}
                style={{ height: `${Math.max(1, (b.count / maxCount) * 100)}%` }}
              />
            ))}
          </div>
          {markers
            .filter((m) => Number.isFinite(m.value) && m.value >= lo && m.value <= hi)
            .map((m) => (
              <div
                key={m.label}
                className="pointer-events-none absolute bottom-0 top-0"
                style={{ left: `${((m.value - lo) / (hi - lo || 1)) * 100}%` }}
              >
                <div className="h-full w-0 border-l-[1.5px] border-dashed border-rule" />
                <div className="absolute -top-0.5 left-1 whitespace-nowrap bg-[var(--card-b)] px-1 text-[0.625rem] font-semibold uppercase">
                  {m.label}
                </div>
              </div>
            ))}
        </div>
        <div className="flex justify-between pt-1">
          <Fig size="xs" className="text-[var(--muted-ink)]">
            {fmtCompact(lo)}
          </Fig>
          <Fig size="xs" className="text-[var(--muted-ink)]">
            {fmtCompact(hi)} {unit}
          </Fig>
        </div>
      </ScrollX>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Label>
          n=<span className="fig">{total}</span>
        </Label>
        <Label>
          mode <span className="fig">{fmtCompact(bins[modal].from)}</span>–
          <span className="fig">{fmtCompact(bins[modal].to)}</span>
        </Label>
        {str(d.note) ? <Label className="normal-case">{str(d.note)}</Label> : null}
      </div>
    </Panel>
  );
}
