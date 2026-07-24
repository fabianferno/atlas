/**
 * JSON Pointer (RFC 6901) resolution against the A2UI data model, plus the
 * deep binding walk that turns `{"path": "/healthFactor"}` into a value.
 *
 * A2UI extends RFC 6901 with relative paths (no leading slash), which resolve
 * against the current scope — for us that is always the document root unless a
 * component passes one in.
 *
 * Everything here is pure and total. A path that does not resolve yields
 * `undefined`, never a throw: a partially-streamed data model is the normal
 * case, not an error, and half a screen rendering is better than none.
 */

import type { A2uiBinding } from "./types";

function unescapeToken(t: string): string {
  return t.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function parsePointer(path: string): string[] {
  const p = path.startsWith("#") ? path.slice(1) : path;
  if (p === "" || p === "/") return [];
  const body = p.startsWith("/") ? p.slice(1) : p;
  return body.split("/").map(unescapeToken);
}

export function getPath(model: unknown, path: string): unknown {
  let cur: unknown = model;
  for (const token of parsePointer(path)) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const i = Number(token);
      if (!Number.isInteger(i) || i < 0 || i >= cur.length) return undefined;
      cur = cur[i];
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[token];
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * Immutable upsert at a pointer. Used by `updateDataModel` and by the two-way
 * bindings on amount_input / allowlist_picker.
 *
 * Prototype-polluting tokens are dropped. The data model is downstream of an
 * LLM and of indexed onchain strings, so `__proto__` in a path is treated as
 * hostile input rather than as a key.
 */
const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);

export function setPath(
  model: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const tokens = parsePointer(path);
  if (tokens.length === 0) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>) }
      : { ...model };
  }
  if (tokens.some((t) => FORBIDDEN.has(t))) return model;

  const root: Record<string, unknown> = { ...model };
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const t = tokens[i];
    const next = cur[t];
    const copy: Record<string, unknown> =
      next && typeof next === "object" && !Array.isArray(next)
        ? { ...(next as Record<string, unknown>) }
        : {};
    cur[t] = copy;
    cur = copy;
  }
  cur[tokens[tokens.length - 1]] = value;
  return root;
}

/** `{"path": "/x"}` — the only object shape the renderer treats as a binding. */
export function isBinding(v: unknown): v is A2uiBinding {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.path !== "string") return false;
  const keys = Object.keys(o);
  return keys.every((k) => k === "path" || k === "default");
}

/** A2UI literal wrappers, accepted so a composer can escape a real `path` key. */
function literal(v: unknown): { hit: boolean; value: unknown } {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return { hit: false, value: v };
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== 1) return { hit: false, value: v };
  const k = keys[0];
  if (k === "literalString" || k === "literalNumber" || k === "literalBoolean") {
    return { hit: true, value: o[k] };
  }
  return { hit: false, value: v };
}

/**
 * Deep-resolves every binding inside a value against the data model.
 * Cycles are impossible (the model is plain JSON) but depth is capped anyway —
 * generated documents get pathological, and a stack overflow in the renderer
 * during a demo is not a debate you want to have.
 */
export function resolveBindings(value: unknown, model: unknown, depth = 0): unknown {
  if (depth > 24) return undefined;

  const lit = literal(value);
  if (lit.hit) return lit.value;

  if (isBinding(value)) {
    const got = getPath(model, value.path);
    return got === undefined ? value.default : got;
  }

  if (Array.isArray(value)) {
    return value.map((v) => resolveBindings(v, model, depth + 1));
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN.has(k)) continue;
      out[k] = resolveBindings(v, model, depth + 1);
    }
    return out;
  }

  return value;
}

/** Resolves an action's declared context into a flat payload object. */
export function resolveContext(
  context: Record<string, unknown> | undefined,
  model: unknown,
): Record<string, unknown> {
  if (!context) return {};
  const resolved = resolveBindings(context, model);
  return resolved && typeof resolved === "object" && !Array.isArray(resolved)
    ? (resolved as Record<string, unknown>)
    : {};
}
