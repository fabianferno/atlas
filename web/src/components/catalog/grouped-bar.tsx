"use client";

/**
 * grouped_bar — data shape: `categorical_many_metrics`.
 *
 * Composer payload:
 *   { metrics: string[],        // humanised metric names
 *     metricKeys: string[],
 *     categories: string[],     // the x axis
 *     series: [{ name, key, accent: boolean, values: number[] }] }
 *
 * Note the orientation: `series` is per-METRIC and `values` is indexed by
 * category. (An earlier draft of this component read per-category rows; the
 * composer's shape is the one that ships.)
 *
 * Rule 3 — metrics take the ink ramp, the one series flagged `accent` takes
 * `--live`, and nothing else is coloured.
 */

import { Panel, Empty, ScrollX, Legend, fmtValue, INK_RAMP } from "@/components/brutal";
import { cn } from "@/lib/utils";
import { dict, list, num, pickStr, str, bool, unitOf, type CatProps } from "./_shared";

export function GroupedBar({ data, label, index }: CatProps) {
  const d = dict(data);
  const unit = unitOf(d);
  const title = label ?? pickStr(d, ["label", "title"], "");

  const categories = list(d.categories).map((c) => str(c)).filter(Boolean);

  const series = list(d.series)
    .map((s) => {
      const o = dict(s);
      return {
        name: pickStr(o, ["name", "label", "key"], "metric"),
        accent: bool(o.accent),
        values: list(o.values).map((v) => num(v, 0)),
      };
    })
    .filter((s) => s.values.length > 0);

  if (series.length === 0 || categories.length === 0) {
    return (
      <Panel title={title || "grouped bar"} index={index}>
        <Empty />
      </Panel>
    );
  }

  const max = Math.max(1, ...series.flatMap((s) => s.values.map((v) => Math.abs(v))));
  const flagged = series.findIndex((s) => s.accent);
  const ai = flagged >= 0 ? flagged : 0;

  const colOf = (i: number) =>
    i === ai ? "var(--live)" : INK_RAMP[Math.min(i + (i > ai ? 0 : 1), INK_RAMP.length - 1)];
  const barClass = (i: number) =>
    i === ai ? "bar--accent" : i === 0 ? "bar" : i === 1 ? "bar--60" : "bar--35";

  return (
    <Panel title={title} index={index}>
      <ScrollX minWidth={Math.max(320, categories.length * (series.length * 16 + 26))}>
        <div className="flex h-44 items-end gap-4 border-b-[1.5px] border-rule">
          {categories.map((c, ci) => (
            <div key={`${c}-${ci}`} className="flex min-w-0 flex-1 flex-col justify-end">
              <div className="flex h-40 items-end justify-center gap-1">
                {series.map((s, si) => (
                  <div
                    key={si}
                    title={`${c} · ${s.name} · ${fmtValue(s.values[ci] ?? 0, unit)}`}
                    className={cn("w-3 border border-b-0 border-rule", barClass(si))}
                    style={{
                      height: `${Math.max(2, (Math.abs(s.values[ci] ?? 0) / max) * 100)}%`,
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-4">
          {categories.map((c, ci) => (
            <div
              key={`l-${ci}`}
              className="fig min-w-0 flex-1 truncate pt-1 text-center text-[0.625rem] text-[var(--muted-ink)]"
              title={c}
            >
              {c}
            </div>
          ))}
        </div>
      </ScrollX>
      <Legend
        items={series.map((s, i) => ({ name: s.name, color: colOf(i), accent: i === ai }))}
      />
    </Panel>
  );
}
