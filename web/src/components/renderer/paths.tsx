/**
 * Binding resolution.
 *
 * RFC 6901 read/write comes from the kit (`getPointer` / `setPointer`) so there
 * is exactly one pointer implementation in the repo. What lives here is the
 * deep walk that turns a nested structure containing `{"path": "/x"}` into
 * resolved values — the kit describes the format, the renderer resolves it.
 *
 * Everything is pure and total. A path that does not resolve yields
 * `undefined`, never a throw: a partially-streamed data model is the normal
 * case, not an error, and half a screen rendering is better than none.
 */

// `getPointer` / `isPathBinding` are re-exported from ./types (the single
// namespace for the wire format) — deliberately not re-exported here too, or
// the barrel would have two ambiguous star exports of the same name.
import { getPointer, isPathBinding, setPointer, type JsonValue } from "@/lib/kit/a2ui";

/**
 * Prototype-polluting tokens are rejected before they reach `setPointer`. The
 * data model is downstream of an LLM and of indexed onchain strings, so
 * `__proto__` in a path is hostile input, not a key.
 */
const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);

export function safeSetPointer(
  model: JsonValue,
  pointer: string,
  value: JsonValue,
): JsonValue {
  const tokens = pointer.replace(/^\//, "").split("/");
  if (tokens.some((t) => FORBIDDEN.has(t))) return model;
  return setPointer(model, pointer, value);
}

/**
 * Deep-resolves every `{"path": …}` binding inside a value.
 *
 * Depth is capped: generated documents get pathological, and a stack overflow
 * in the renderer during a demo is not a debate you want to have.
 */
export function resolveBindings(value: unknown, model: unknown, depth = 0): unknown {
  if (depth > 24) return undefined;

  if (isPathBinding(value)) {
    return getPointer(model, value.path);
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

/** Resolves an action's declared context into the flat payload we post back. */
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

/** Resolves a dynamic string (`string | {path}`) for labels and captions. */
export function resolveString(value: unknown, model: unknown): string | undefined {
  const v = resolveBindings(value, model);
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** Resolves a dynamic boolean (`boolean | {path}`) for `disabled`. */
export function resolveBoolean(value: unknown, model: unknown): boolean {
  return resolveBindings(value, model) === true;
}
