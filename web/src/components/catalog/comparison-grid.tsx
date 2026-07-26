"use client";

/**
 * comparison_grid — data shape: `entities_shared_metrics`. The cross-schema
 * shot: three lending protocols on the same six numbers, assembled from three
 * different subgraphs.
 *
 * Composer payload:
 *   { metrics: string[],      // humanised, column-major row headers
 *     metricKeys: string[],
 *     units: string[],        // parallel to metrics
 *     entities: [{ label, values: (number|string|null)[] }] }  // values ∥ metrics
 *
 * Rendered transposed — metrics down the side, entities across the top — which
 * is how you actually read a protocol comparison. The winning cell per metric
 * is marked with a rule and weight, not a colour: with N entities a colour per
 * entity is exactly the rainbow Rule 3 forbids.
 */

import { Panel, Empty, Fig, ScrollList, Tag, fmtValue, shortAddr, rowsMeta } from "@/components/brutal";
import { cn } from "@/lib/utils";
import {
  cellText,
  dict,
  list,
  looksHex,
  num,
  pickStr,
  str,
  bool,
  type CatProps,
} from "./_shared";

/** Lower is better for cost-like metrics; the composer does not tell us. */
const LOWER_IS_BETTER = /(borrow|fee|cost|util|risk|ltv|liquidat|slippage|reserve)/i;

export function ComparisonGrid({ data, label, index }: CatProps) {
  const d = dict(data);
  const title = label ?? pickStr(d, ["label", "title"], "");

  const metrics = list(d.metrics).map((m) => str(m));
  const units = list(d.units).map((u) => str(u));

  const entities = list(d.entities ?? d.columns ?? d.subjects).map((e) => {
    if (typeof e === "string") return { name: e, meta: "", values: [] as unknown[] };
    const o = dict(e);
    return {
      name: pickStr(o, ["label", "name", "protocol", "id"], "—"),
      meta: pickStr(o, ["network", "chain", "schema", "meta"]),
      values: list(o.values),
    };
  });

  // Transpose: one row per metric, one cell per entity.
  const rows =
    metrics.length > 0
      ? metrics.map((m, mi) => ({
          metric: m,
          unit: units[mi] === "none" ? "" : (units[mi] ?? ""),
          higherIsBetter: !LOWER_IS_BETTER.test(m),
          values: entities.map((e) => e.values[mi]),
        }))
      : // Fallback: an explicit row-major payload.
        list(d.rows).map((r) => {
          const o = dict(r);
          return {
            metric: pickStr(o, ["metric", "label", "name", "key"], "—"),
            unit: pickStr(o, ["unit", "units"]),
            higherIsBetter:
              o.higherIsBetter === undefined ? true : bool(o.higherIsBetter),
            values: entities.map((_, i) => list(o.values ?? o.cells)[i]),
          };
        });

  if (entities.length === 0 || rows.length === 0) {
    return (
      <Panel title={title || "comparison"} index={index}>
        <Empty what="need entities and metrics" />
      </Panel>
    );
  }

  return (
    <Panel
      title={title}
      index={index}
      flush
      meta={
        <Fig size="xs" className="text-[var(--muted-ink)]">
          {rowsMeta(rows.length, undefined, "metrics")}
        </Fig>
      }
    >
      <ScrollList
        count={rows.length}
        est={34}
        minWidth={Math.max(360, 140 + entities.length * 110)}
      >
        <table className="cells w-full border-collapse text-left">
          <thead>
            {/* Pinned: the entity names are what the numbers below mean. The
                rule is an inset shadow — a collapsed-table border does not
                travel with a sticky cell. */}
            <tr>
              <th className="sticky top-0 z-10 bg-[var(--card-b)] px-3 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--muted-ink)] shadow-[inset_0_-1px_0_var(--hairline)]">
                metric
              </th>
              {entities.map((e, i) => (
                <th
                  key={`${e.name}-${i}`}
                  className="sticky top-0 z-10 bg-[var(--card-b)] px-3 py-2 align-bottom shadow-[inset_0_-1px_0_var(--hairline)]"
                >
                  <div className="display text-[0.75rem] leading-tight">{e.name}</div>
                  {e.meta ? (
                    <Tag className="mt-1 border-hairline text-[var(--muted-ink)]">{e.meta}</Tag>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => {
              const nums = r.values.map((v) => num(v, NaN));
              const finite = nums.filter((n) => Number.isFinite(n));
              const best =
                finite.length > 1
                  ? nums.indexOf(r.higherIsBetter ? Math.max(...finite) : Math.min(...finite))
                  : -1;
              return (
                <tr key={`${r.metric}-${ri}`} data-row>
                  <th
                    scope="row"
                    className="px-3 py-2 text-[0.75rem] font-medium text-[var(--muted-ink)]"
                  >
                    {r.metric}
                    {r.unit ? (
                      <span className="ml-1 text-[0.625rem] uppercase">({r.unit})</span>
                    ) : null}
                  </th>
                  {r.values.map((v, i) => (
                    <td
                      key={i}
                      className={cn(
                        "px-3 py-2",
                        i === best && "border-l-[1.5px] border-l-rule bg-ink/[0.04]",
                      )}
                    >
                      {/* A metric row can carry an identity cell — "pool" or
                          "id" across three protocols. `num()` refuses "0x…"
                          (before that guard, `Number()` read the address as a
                          hex literal, so the cell printed ~1e+48 and, worse,
                          won the "best on that metric" rule against real
                          numbers). Shorten it like the data table does. */}
                      <Fig
                        size="sm"
                        className={cn(i === best && "font-semibold")}
                        title={looksHex(v) ? str(v) : undefined}
                      >
                        {Number.isFinite(nums[i])
                          ? fmtValue(nums[i], r.unit)
                          : looksHex(v)
                            ? shortAddr(str(v))
                            : cellText(v)}
                      </Fig>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollList>
      <div className="border-t border-hairline px-3 py-1.5 text-[0.625rem] text-[var(--muted-ink)]">
        {str(d.note, "Boxed cell = best on that metric.")}
      </div>
    </Panel>
  );
}
