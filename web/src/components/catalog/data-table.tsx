"use client";

/**
 * data_table — data shape: `rows_arbitrary_columns`. The fallback when nothing
 * else fits, and the "show your work" panel the composer always appends, so it
 * is the component most likely to receive genuinely unknown values.
 *
 * Composer payload:
 *   { columns: string[],      // humanised headers
 *     columnKeys: string[],
 *     units: string[],        // parallel to columns
 *     rows: unknown[][] }     // ROW-MAJOR ARRAYS, aligned to columns
 *
 * Also accepts object rows (`rows: Record<string, unknown>[]`) with an optional
 * explicit column list, for hand-written fixtures.
 *
 * Hairlines between rows (`.cells`), one heavy rule under the head. Addresses
 * and hashes are detected and shortened; nothing renders "[object Object]".
 */

import { Panel, Empty, Fig, ScrollX, fmtValue, shortAddr } from "@/components/brutal";
import { cn } from "@/lib/utils";
import {
  cellText,
  dict,
  isDict,
  list,
  looksHex,
  num,
  pickStr,
  str,
  type CatProps,
} from "./_shared";

interface Col {
  key: string;
  label: string;
  align: "left" | "right";
  unit: string;
}

export function DataTable({ data, label, index }: CatProps) {
  const d = dict(data);
  const title = label ?? pickStr(d, ["label", "title"], "");
  const rawRows = list(d.rows ?? d.items ?? d.records ?? (Array.isArray(data) ? data : []));

  const headers = list(d.columns).map((c) => (isDict(c) ? pickStr(c, ["label", "key"], "") : str(c)));
  const keys = list(d.columnKeys).map((k) => str(k));
  const units = list(d.units).map((u) => str(u));

  // Two intake shapes: composer arrays, or object rows.
  const arrayMode = rawRows.length > 0 && Array.isArray(rawRows[0]);

  let cols: Col[] = [];
  if (headers.length > 0) {
    cols = headers.map((h, i) => ({
      key: keys[i] ?? h,
      label: h,
      align: "left",
      unit: units[i] === "none" ? "" : (units[i] ?? ""),
    }));
  } else if (list(d.columns).some(isDict)) {
    cols = list(d.columns).map((c): Col => {
      const o = dict(c);
      const key = pickStr(o, ["key", "field", "name"], "");
      return {
        key,
        label: pickStr(o, ["label", "title", "header"], key),
        align: pickStr(o, ["align"]) === "right" ? "right" : "left",
        unit: pickStr(o, ["unit", "units"]),
      };
    });
  } else if (!arrayMode && rawRows.length > 0) {
    // Infer from the union of the first few rows — fan-out results are ragged.
    const seen: string[] = [];
    for (const r of rawRows.slice(0, 8)) {
      for (const k of Object.keys(dict(r))) if (!seen.includes(k)) seen.push(k);
    }
    cols = seen.slice(0, 12).map((k) => ({ key: k, label: k, align: "left", unit: "" }));
  }

  const rows: unknown[][] = arrayMode
    ? rawRows.map((r) => list(r))
    : rawRows.map((r) => cols.map((c) => dict(r)[c.key]));

  if (rows.length === 0 || cols.length === 0) {
    return (
      <Panel title={title || "table"} index={index}>
        <Empty what="no rows" />
      </Panel>
    );
  }

  // Right-align a column when its first present value is numeric.
  const aligned = cols.map((c, i) => {
    if (c.align === "right") return c;
    const sample = rows.find((r) => r[i] !== null && r[i] !== undefined)?.[i];
    const isNum = typeof sample === "number";
    return { ...c, align: isNum ? ("right" as const) : c.align };
  });

  return (
    <Panel
      title={title}
      index={index}
      flush
      meta={
        <Fig size="xs" className="text-[var(--muted-ink)]">
          {num(d.rowCount, rows.length)} rows
        </Fig>
      }
    >
      <ScrollX minWidth={Math.max(320, aligned.length * 110)}>
        <table className="cells w-full border-collapse text-left">
          <thead>
            <tr className="border-b-[1.5px] border-rule">
              {aligned.map((c, i) => (
                <th
                  key={`${c.key}-${i}`}
                  className={cn(
                    "whitespace-nowrap px-3 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--muted-ink)]",
                    c.align === "right" && "text-right",
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {aligned.map((c, ci) => {
                  const v = r[ci];
                  const n = num(v, NaN);
                  const isNum =
                    typeof v === "number" ||
                    (typeof v === "string" && v !== "" && Number.isFinite(n));
                  const hex = looksHex(v);
                  return (
                    <td
                      key={ci}
                      className={cn(
                        "px-3 py-1.5 align-top text-[0.75rem]",
                        (isNum || c.align === "right") && "text-right",
                      )}
                      title={hex ? str(v) : undefined}
                    >
                      {isNum ? (
                        <Fig size="sm">{fmtValue(n, c.unit)}</Fig>
                      ) : hex ? (
                        <Fig size="sm" className="text-[var(--muted-ink)]">
                          {shortAddr(str(v))}
                        </Fig>
                      ) : (
                        <span className="block max-w-[18rem] truncate">{cellText(v)}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollX>
    </Panel>
  );
}
