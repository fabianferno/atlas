/**
 * Formatters for the data voice (prd.md §6 Rule 4).
 *
 * Everything here is deterministic and timezone-free on purpose: these strings
 * render on the server and again on the client, so `toLocaleString` with an
 * ambient locale/timezone is a hydration mismatch waiting to happen. Dates are
 * formatted from UTC parts by hand.
 */

const UNITS = ["", "K", "M", "B", "T"] as const;

/** Fixed-decimal number with thin grouping. Tabular numerals do the aligning. */
export function fmtNum(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "—";
  const fixed = Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(digits);
  const [int, frac] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${grouped}.${frac}` : grouped;
}

/** 1.24M — the default for anything that shares a chart axis. */
export function fmtCompact(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "—";
  const sign = v < 0 ? "-" : "";
  let n = Math.abs(v);
  let i = 0;
  while (n >= 1000 && i < UNITS.length - 1) {
    n /= 1000;
    i += 1;
  }
  const d = n >= 100 ? 0 : n >= 10 ? 1 : digits;
  return `${sign}${n.toFixed(d).replace(/\.0+$/, "")}${UNITS[i]}`;
}

export function fmtUsd(v: number, compact = true): string {
  if (!Number.isFinite(v)) return "—";
  const sign = v < 0 ? "-" : "";
  const n = Math.abs(v);
  if (compact && n >= 10_000) return `${sign}$${fmtCompact(n)}`;
  return `${sign}$${fmtNum(n, n < 1 ? 4 : 2)}`;
}

export function fmtPct(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

export function fmtSigned(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${fmtNum(v, digits)}`;
}

export function fmtSignedPct(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

/** 0x1f98…c984 — long enough to recognise, short enough for a dense row. */
export function shortAddr(a: string, head = 6, tail = 4): string {
  if (!a) return "—";
  if (a.length <= head + tail + 1) return a;
  return `${a.slice(0, head)}…${a.slice(-tail)}`;
}

function toDate(v: string | number | Date): Date | null {
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** 14:22:07 UTC — journal lines and log timestamps. */
export function fmtTime(v: string | number | Date): string {
  const d = toDate(v);
  if (!d) return "—";
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}

/** 2026-07-24 */
export function fmtDate(v: string | number | Date): string {
  const d = toDate(v);
  if (!d) return "—";
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

/** 07-24 14:22 — chart axes and compact rows. */
export function fmtStamp(v: string | number | Date): string {
  const d = toDate(v);
  if (!d) return "—";
  return `${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

/** "in 4d 6h" / "expired" — policy expiry, without a live clock. */
export function fmtUntil(v: string | number | Date, now: Date = new Date()): string {
  const d = toDate(v);
  if (!d) return "no expiry";
  const ms = d.getTime() - now.getTime();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m`;
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/**
 * Applies a unit hint from the data model.
 *
 * The vocabulary is the composer's (`A2UIHints["unit"]` in lib/kit/a2ui.ts):
 * "usd" | "pct" | "count" | "token" | "ratio" | "none". Anything else is
 * treated as a literal suffix, so a hand-written fixture can still say "ETH".
 */
export function fmtValue(v: number, unit?: string): string {
  if (!Number.isFinite(v)) return "—";
  if (!unit) return fmtCompact(v);
  const u = unit.trim();
  if (u === "usd" || u === "USD" || u === "$") return fmtUsd(v);
  if (u === "pct" || u === "%") return fmtPct(v);
  if (u === "ratio" || u === "x") return `${fmtNum(v, 2)}×`;
  if (u === "count") return fmtCompact(v, 0);
  if (u === "none" || u === "token") return fmtCompact(v);
  return `${fmtCompact(v)} ${u}`;
}
