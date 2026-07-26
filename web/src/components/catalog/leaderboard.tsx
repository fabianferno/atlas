"use client";

/**
 * leaderboard — data shape: `categorical_ranked`. The most common question
 * shape in the product ("top pools by fees", "biggest borrowers").
 *
 * Composer payload:
 *   { metric, unit, rows: [{ rank, label, value, delta }] }   // delta absolute
 * Also accepts { rows: [{ label, value, sublabel?, deltaPct?, address? }] }.
 *
 * Rank is mono and left-aligned; the row's inline bar is ink except for the
 * one accented entry. The rank number does more work than colour would.
 */

import { Panel, Empty, Fig, Delta, Address, fmtValue } from "@/components/brutal";
import { cn } from "@/lib/utils";
import { accentIndex, dict, num, pickNum, pickStr, rowsOf, unitOf, type CatProps } from "./_shared";

export function Leaderboard({ data, label, index }: CatProps) {
  const d = dict(data);
  const unit = unitOf(d);
  const title = label ?? pickStr(d, ["label", "title"], "");
  const raw = rowsOf(data, "rows", "items", "entries", "ranked", "leaders");

  const rows = raw.map((r) => {
    const o = dict(r);
    // Two separate questions about the ranked value, and they used to be one.
    // `value` feeds the bar geometry and must be a finite number or the row
    // has no width; `hasValue` says whether that number came from the data at
    // all. Collapsing them meant an unreadable cell — an id string, say —
    // rendered as a confident "0", which is a claim the row cannot back. (It
    // was worse before `num()` refused "0x…": the hex parsed to ~1e+48, took
    // the max, and squashed every honest bar in the list to 2%.)
    const rawValue = num(o.value ?? o.v ?? o.amount ?? o.total ?? o.tvl ?? o.fees, NaN);
    return {
      label: pickStr(o, ["label", "name", "pool", "protocol", "market", "key"], "—"),
      sublabel: pickStr(o, ["sublabel", "network", "chain", "category"]),
      address: pickStr(o, ["address", "id", "account"]),
      hasValue: Number.isFinite(rawValue),
      value: Number.isFinite(rawValue) ? rawValue : 0,
      deltaPct: pickNum(o, ["deltaPct", "changePct"]),
      /** Composer's `delta` is a raw column value, not a percentage. */
      deltaAbs: pickNum(o, ["delta", "change"]),
      accent: o.accent,
    };
  });

  if (rows.length === 0) {
    return (
      <Panel title={title || "leaderboard"} index={index}>
        <Empty />
      </Panel>
    );
  }

  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const ai = accentIndex(rows, rows.map((r) => r.value), d.accent);

  return (
    <Panel title={title} index={index} flush>
      <ol className="flex flex-col">
        {rows.map((r, i) => (
          <li
            key={`${r.label}-${i}`}
            className="relative grid grid-cols-[1.75rem_1fr_auto] items-center gap-2 border-b border-hairline px-3 py-2 last:border-b-0"
          >
            {/* Rank bar sits behind the row — position carries magnitude. */}
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0",
                i === ai ? "bg-live/10" : "bg-ink/[0.05]",
              )}
              style={{ width: `${Math.max(2, (Math.abs(r.value) / max) * 100)}%` }}
            />
            <Fig
              size="sm"
              className={cn("relative", i === ai ? "text-live" : "text-[var(--muted-ink)]")}
            >
              {String(i + 1).padStart(2, "0")}
            </Fig>
            <span className="relative flex min-w-0 flex-col">
              <span
                className={cn("truncate text-[0.8125rem]", i === ai && "font-semibold")}
                title={r.label}
              >
                {r.label}
              </span>
              {r.address ? (
                <Address value={r.address} size="xs" />
              ) : r.sublabel ? (
                <span className="truncate text-[0.6875rem] text-[var(--muted-ink)]">
                  {r.sublabel}
                </span>
              ) : null}
            </span>
            <span className="relative flex items-baseline gap-2">
              <Fig size="sm" tone={i === ai ? "live" : "neutral"}>
                {r.hasValue ? fmtValue(r.value, unit) : "—"}
              </Fig>
              {Number.isFinite(r.deltaPct) ? (
                <Delta pct={r.deltaPct} size="xs" />
              ) : Number.isFinite(r.deltaAbs) ? (
                <Delta pct={r.deltaAbs} abs={fmtValue(r.deltaAbs, unit)} size="xs" />
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
