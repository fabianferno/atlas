"use client";

/**
 * heatmap — data shape: `two_categoricals_one_metric`. Protocol × chain.
 *
 * Composer payload:
 *   { metric, unit, rowLabels: string[], colLabels: string[],
 *     cells: (number|null)[][] }   // row-major, aligned to rowLabels/colLabels
 * Also accepts { rows, cols, cells: [{ row, col, value }] }.
 *
 * A single-hue ink ramp, not a viridis/turbo scale. Rule 3 again: intensity is
 * the encoding, and the maximum cell — the answer to the question — is the one
 * cell that carries `--live`.
 */

import { Panel, Empty, Fig, ScrollX, Label, fmtValue } from "@/components/brutal";
import { cn } from "@/lib/utils";
import { dict, list, num, pickStr, str, unitOf, type CatProps } from "./_shared";

export function Heatmap({ data, label, index }: CatProps) {
  const d = dict(data);
  const title = label ?? pickStr(d, ["label", "title"], "");
  const unit = unitOf(d);

  const rowKeys = list(d.rowLabels ?? d.rows ?? d.y ?? d.yLabels)
    .map((v) => str(v))
    .filter(Boolean);
  const colKeys = list(d.colLabels ?? d.cols ?? d.columns ?? d.x ?? d.xLabels)
    .map((v) => str(v))
    .filter(Boolean);

  // Two accepted encodings: a sparse cell list, or a dense row-major matrix.
  const matrix: number[][] = rowKeys.map(() => colKeys.map(() => NaN));
  const rawCells = d.cells ?? d.values ?? d.matrix;
  if (Array.isArray(rawCells) && Array.isArray(rawCells[0])) {
    (rawCells as unknown[]).forEach((r, ri) => {
      list(r).forEach((v, ci) => {
        if (matrix[ri] && ci < colKeys.length) matrix[ri][ci] = num(v, NaN);
      });
    });
  } else {
    list(rawCells).forEach((c) => {
      const o = dict(c);
      const ri = rowKeys.indexOf(pickStr(o, ["row", "y", "protocol"]));
      const ci = colKeys.indexOf(pickStr(o, ["col", "column", "x", "network", "chain"]));
      if (ri >= 0 && ci >= 0) matrix[ri][ci] = num(o.value ?? o.v, NaN);
    });
  }

  const flat = matrix.flat().filter((v) => Number.isFinite(v));
  if (rowKeys.length === 0 || colKeys.length === 0 || flat.length === 0) {
    return (
      <Panel title={title || "heatmap"} index={index}>
        <Empty what="need rows, cols and cells" />
      </Panel>
    );
  }

  const max = Math.max(...flat);
  const min = Math.min(...flat);
  const span = max - min || 1;

  return (
    <Panel title={title} index={index} flush>
      <ScrollX minWidth={Math.max(340, 110 + colKeys.length * 74)}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-[1.5px] border-rule">
              <th className="px-3 py-2" />
              {colKeys.map((c) => (
                <th
                  key={c}
                  className="px-2 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--muted-ink)]"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowKeys.map((r, ri) => (
              <tr key={r}>
                <th
                  scope="row"
                  className="whitespace-nowrap px-3 py-1 text-left text-[0.75rem] font-medium"
                >
                  {r}
                </th>
                {colKeys.map((c, ci) => {
                  const v = matrix[ri][ci];
                  const isMax = Number.isFinite(v) && v === max;
                  const t = Number.isFinite(v) ? (v - min) / span : 0;
                  const bg = !Number.isFinite(v)
                    ? "transparent"
                    : isMax
                      ? "var(--live)"
                      : `color-mix(in srgb, var(--ink) ${(6 + t * 74).toFixed(0)}%, var(--paper))`;
                  return (
                    <td key={c} className="p-0.5">
                      <div
                        title={`${r} × ${c}: ${Number.isFinite(v) ? fmtValue(v, unit) : "no data"}`}
                        className={cn(
                          "flex h-9 items-center justify-center border border-rule",
                          !Number.isFinite(v) && "border-dashed border-hairline",
                        )}
                        style={{ background: bg }}
                      >
                        <Fig
                          size="xs"
                          className={cn(
                            isMax || t > 0.55 ? "text-[var(--card-b)]" : "text-ink",
                            !Number.isFinite(v) && "text-[var(--muted-ink)]",
                          )}
                        >
                          {Number.isFinite(v) ? fmtValue(v, unit) : "—"}
                        </Fig>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollX>
      <div className="flex items-center gap-2 border-t border-hairline px-3 py-1.5">
        <Label>low</Label>
        <span className="flex h-2.5 flex-1 border border-rule">
          {[6, 25, 44, 62, 80].map((p) => (
            <span
              key={p}
              className="flex-1"
              style={{ background: `color-mix(in srgb, var(--ink) ${p}%, var(--paper))` }}
            />
          ))}
        </span>
        <Label>high</Label>
        <span className="inline-block h-2.5 w-4 border border-rule bg-live" />
        <Label>max</Label>
      </div>
    </Panel>
  );
}
