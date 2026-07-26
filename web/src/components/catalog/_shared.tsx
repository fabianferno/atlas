"use client";

/**
 * Defensive readers for `CatalogComponentProps.data`.
 *
 * `data` is `unknown` by contract, and it is downstream of two untrusted-ish
 * sources: an LLM composer and indexed onchain data (token names, ENS text
 * records and memos are attacker-controlled — see contracts/policy.ts). So no
 * component destructures raw data. Everything comes through these coercers,
 * which narrow, clamp and default rather than throw.
 *
 * A malformed payload must degrade to an `<Empty/>` state, never a blank panel
 * and never a crashed render — one bad field in a fan-out result should not
 * take down the whole generated interface.
 */

import type { CatalogComponentProps } from "@/lib/contracts/catalog";

/**
 * Every catalog component takes `CatalogComponentProps` (the frozen contract)
 * plus one optional renderer-supplied extra: the stagger index that drives
 * `--i` on `.snap-in`. It is optional so the registry still types as
 * `ComponentType<CatalogComponentProps>` and a missing entry is a type error.
 */
export type CatProps = CatalogComponentProps & { index?: number };

export type Dict = Record<string, unknown>;

const EMPTY: Dict = {};

export function isDict(v: unknown): v is Dict {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function dict(v: unknown): Dict {
  return isDict(v) ? v : EMPTY;
}

export function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** First array found among the given keys, else `data` itself if it is one. */
export function rowsOf(data: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  const d = dict(data);
  for (const k of keys) {
    if (Array.isArray(d[k])) return d[k] as unknown[];
  }
  return [];
}

/**
 * Strings JS will happily read as a *non-decimal literal*: `0x…` (hex), `0b…`
 * (binary), `0o…` (octal), with an optional sign. Nothing in this product ever
 * means a number when it writes one of those — subgraphs return BigInt and
 * BigDecimal as plain decimal strings, and a `0x` string is always an id, an
 * address, a tx hash or a pool key.
 */
const NON_DECIMAL_LITERAL = /^[+-]?0[xXbBoO]/;

export function num(v: unknown, fallback = NaN): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string" && v.trim() !== "") {
    // This used to be a bare `Number(v)`, which is how every entity id in the
    // product ended up rendered as a figure: `Number("0xbea9f78…56e9")` is not
    // NaN, it is 1.0884986328782432e+48 — finite, so every downstream
    // `Number.isFinite` check said "this is a number" and the table printed
    // 3.6e+35T where an address belonged. Short ids were worse than wrong and
    // plausible: "0x1f98" came out as 8088. Refuse the literal forms outright
    // so callers get their fallback (usually NaN) and fall through to their
    // address/text branch.
    if (NON_DECIMAL_LITERAL.test(v.trim())) return fallback;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  if (typeof v === "bigint") return Number(v);
  return fallback;
}

export function numOr(v: unknown, fallback: number): number {
  const n = num(v, fallback);
  return Number.isFinite(n) ? n : fallback;
}

export function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint" || typeof v === "boolean") {
    return String(v);
  }
  return fallback;
}

export function bool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}

/** Reads the first present key. Composers are inconsistent about naming. */
export function pick(d: Dict, ...keys: string[]): unknown {
  for (const k of keys) {
    if (d[k] !== undefined && d[k] !== null) return d[k];
  }
  return undefined;
}

export function pickNum(d: Dict, keys: string[], fallback = NaN): number {
  return num(pick(d, ...keys), fallback);
}

export function pickStr(d: Dict, keys: string[], fallback = ""): string {
  return str(pick(d, ...keys), fallback);
}

/** Clamp, used everywhere a policy cap or a gauge bound is involved. */
export function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

/** Renders arbitrary cell values without ever printing "[object Object]". */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return `[${v.length}]`;
  return "{…}";
}

/**
 * True when a string looks like an EVM address or tx hash — render as mono and
 * shorten it. This is a *presentation* test, deliberately stricter than the
 * parse-side guard in `num()`: it wants at least 8 hex digits so it does not
 * ellipsise something that is only incidentally hex-shaped. Anything shorter
 * (`"0x1f98"`) is still refused by `num()` and simply renders as plain text —
 * the two must never disagree in the direction that lets a hex string reach a
 * numeric formatter.
 */
export function looksHex(v: unknown): boolean {
  // `0X` as well as `0x`: subgraphs emit lowercase, but a hand-written fixture
  // or a checksummed value pasted from a block explorer may not, and the parse
  // guard above is already case-insensitive. The two should agree.
  return typeof v === "string" && /^0[xX][0-9a-fA-F]{8,}$/.test(v);
}

/** Index of the maximum, used to pick the single accented series (Rule 3). */
export function argMax(values: number[]): number {
  let best = -1;
  let bestV = -Infinity;
  values.forEach((v, i) => {
    if (Number.isFinite(v) && v > bestV) {
      bestV = v;
      best = i;
    }
  });
  return best;
}

/**
 * Resolves which single series carries the accent. Explicit wins; otherwise
 * the composer's `accent` flag; otherwise the largest. Exactly one, always.
 */
export function accentIndex(
  items: { accent?: unknown }[],
  values: number[],
  explicit?: unknown,
): number {
  if (typeof explicit === "number" && explicit >= 0 && explicit < items.length) {
    return explicit;
  }
  const flagged = items.findIndex((it) => bool(it.accent));
  if (flagged >= 0) return flagged;
  return argMax(values);
}

/**
 * The composer's presentation hints, merged into `data.hints` by the renderer.
 *
 * Advisory only — the renderer owns the visual system (prd.md §6). We read
 * `accent` (which of the five semantic tokens applies, if any) and `unit`.
 * `accentField` tells us which series the question was about so we do not have
 * to re-derive it; Rule 3 still allows exactly one accented series.
 */
export interface Hints {
  accent?: "live" | "gain" | "loss" | "risk" | "spend";
  accentField?: string;
  unit?: string;
  precision?: number;
  span?: number;
  fields?: Dict;
}

export function hintsOf(d: Dict): Hints {
  const h = dict(d.hints);
  return {
    accent: (["live", "gain", "loss", "risk", "spend"] as const).find(
      (a) => a === h.accent,
    ),
    accentField: str(h.accentField) || undefined,
    unit: str(h.unit) || undefined,
    precision: typeof h.precision === "number" ? h.precision : undefined,
    span: typeof h.span === "number" ? h.span : undefined,
    fields: dict(h.fields),
  };
}

/** Unit from the payload, then from hints. "none" means "no suffix". */
export function unitOf(d: Dict): string {
  const u = pickStr(d, ["unit", "units"]) || hintsOf(d).unit || "";
  return u === "none" ? "" : u;
}

/** Internal event name the renderer intercepts for two-way data binding. */
export const BIND_EVENT = "@a2ui/bind";

export type Dispatch = (event: {
  name: string;
  context: Record<string, unknown>;
}) => void;

/** Writes a value back into the A2UI data model at `path`. */
export function bindValue(
  onAction: Dispatch | undefined,
  path: string | undefined,
  value: unknown,
) {
  if (!onAction || !path) return;
  onAction({ name: BIND_EVENT, context: { path, value } });
}
