"use client";

/**
 * bar_chart — data shape: `categorical_one_metric`.
 *
 * Composer payload: { metric, unit, categories: [{ label, value }] }
 * Also accepts { series | rows | bars: [{ label, value, accent? }] }.
 *
 * Horizontal bars: category labels are long (protocol names, pool pairs) and a
 * horizontal layout keeps them readable without rotating text, which is the
 * fastest way to make a chart look generic.
 *
 * Rule 3 — bars are ink; exactly one carries `--live`.
 */

import type { CatalogComponentProps } from "@/lib/contracts/catalog";
import { Panel, Fig, Empty, fmtValue } from "@/components/brutal";
import { cn } from "@/lib/utils";
import { accentIndex, dict, num, pickStr, rowsOf, unitOf } from "./_shared";

export function BarChart({ data, label, index }: CatalogComponentProps & { index?: number }) {
  const d = dict(data);
  const raw = rowsOf(data, "categories", "series", "rows", "bars", "items", "data");
  const unit = unitOf(d);
  const title = label ?? pickStr(d, ["label", "title"], "");

  const items = raw
    .map((r) => {
      const o = dict(r);
      return {
        label: pickStr(o, ["label", "name", "category", "key", "protocol"], "—"),
        value: num(o.value ?? o.v ?? o.amount ?? o.total, 0),
        accent: o.accent,
      };
    })
    .filter((it) => Number.isFinite(it.value));

  if (items.length === 0) {
    return (
      <Panel title={title || "bar chart"} index={index}>
        <Empty />
      </Panel>
    );
  }

  const max = Math.max(...items.map((it) => Math.abs(it.value)), 1);
  const ai = accentIndex(items, items.map((it) => it.value), d.accent);

  return (
    <Panel title={title} index={index} flush>
      <ul className="flex flex-col">
        {items.map((it, i) => (
          <li
            key={`${it.label}-${i}`}
            className="grid grid-cols-[minmax(5rem,9rem)_1fr_auto] items-center gap-2 border-b border-hairline px-3 py-1.5 last:border-b-0"
          >
            <span className="truncate text-[0.75rem]" title={it.label}>
              {it.label}
            </span>
            <span className="flex h-4 min-w-0 items-center">
              <span
                className={cn(
                  "h-3 border border-rule",
                  i === ai ? "bar--accent" : i < 3 ? "bar" : "bar--60",
                )}
                style={{ width: `${Math.max(1.5, (Math.abs(it.value) / max) * 100)}%` }}
              />
            </span>
            <Fig size="sm" className="tabular-nums">
              {fmtValue(it.value, unit)}
            </Fig>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
