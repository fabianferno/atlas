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
 *
 * The one invariant worth stating out loud, because it was broken once and the
 * breakage was invisible in fixtures but hit every real subgraph row: a cell is
 * classified as an *address* before it is classified as a *number*. Hex is an
 * identity, and no identity may reach a numeric formatter.
 */

import {
  Panel,
  Empty,
  Fig,
  ScrollList,
  VISIBLE_ROWS,
  fmtValue,
  shortAddr,
} from "@/components/brutal";
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

  // Right-align a column when its first present value is numeric. An address
  // column is never right-aligned, even when the payload asked for it — the
  // cells refuse to right-align a hex value (see below) and a right-aligned
  // header over left-aligned cells reads as a rendering fault.
  const aligned = cols.map((c, i) => {
    const sample = rows.find((r) => r[i] !== null && r[i] !== undefined)?.[i];
    if (looksHex(sample)) return { ...c, align: "left" as const };
    if (c.align === "right") return c;
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
          {/* Say the viewport is partial, or a scrolled table reads as a table
              that lost rows. */}
          {rows.length > VISIBLE_ROWS
            ? `${VISIBLE_ROWS} of ${num(d.rowCount, rows.length)} rows · scroll`
            : `${num(d.rowCount, rows.length)} rows`}
        </Fig>
      }
    >
      <ScrollList count={rows.length} minWidth={Math.max(320, aligned.length * 110)} est={30}>
        <table className="cells w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-hairline">
              {aligned.map((c, i) => (
                <th
                  key={`${c.key}-${i}`}
                  className={cn(
                    // Pinned: scrolling 400 rows past a lost header is reading
                    // numbers without knowing what they are.
                    // The heavy rule is an inset shadow, not the <tr> border: a
                    // collapsed-table border does not travel with a sticky cell
                    // and vanishes on the first scroll.
                    "sticky top-0 z-10 whitespace-nowrap bg-[var(--card-b)] px-3 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--muted-ink)] shadow-[inset_0_-1px_0_var(--hairline)]",
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
              <tr key={ri} data-row>
                {aligned.map((c, ci) => {
                  const v = r[ci];
                  // Identity beats arithmetic. `hex` is tested FIRST and `isNum`
                  // is explicitly barred from claiming a hex value, because the
                  // old order (`isNum ? … : hex ? …`) made the address branch
                  // unreachable for exactly the strings it existed for: with a
                  // bare `Number()` behind `num()`, "0xbea9…56e9" parsed to a
                  // finite 1.09e+48 and every subgraph `id` column rendered as
                  // "3.6e+35T". `num()` now refuses `0x` strings on its own, so
                  // this is belt and braces — but the two guards are in
                  // different files and only one of them is obvious at the
                  // call site.
                  const hex = looksHex(v);
                  const n = num(v, NaN);
                  const isNum =
                    !hex &&
                    (typeof v === "number" ||
                      (typeof v === "string" && v !== "" && Number.isFinite(n)));
                  return (
                    <td
                      key={ci}
                      className={cn(
                        "px-3 py-1.5 align-top text-[0.75rem]",
                        // An address is a label, not a figure: it stays left
                        // even in a column the header inferred as right.
                        !hex && (isNum || c.align === "right") && "text-right",
                      )}
                      title={hex ? str(v) : undefined}
                    >
                      {hex ? (
                        <Fig size="sm" className="text-[var(--muted-ink)]">
                          {shortAddr(str(v))}
                        </Fig>
                      ) : isNum ? (
                        <Fig size="sm">{fmtValue(n, c.unit)}</Fig>
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
      </ScrollList>
    </Panel>
  );
}
