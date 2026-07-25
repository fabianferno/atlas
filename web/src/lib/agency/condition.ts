/**
 * W6 — TRIGGER CONDITION GRAMMAR. A comparison parser, not an interpreter.
 *
 * NO IMPORTS, DELIBERATELY. This module is reachable from a `"use client"`
 * component, so it must stay free of anything that touches a key, a socket or an
 * env var. `./triggers` re-exports it, so server callers are unchanged.
 *
 * NO `eval`. The values on the right of every comparison come from indexed
 * onchain data, which is attacker-controlled — a token name, an ENS text record,
 * a memo. Here that data is only ever *compared*. It is never parsed as an
 * instruction, never concatenated into a prompt, and never used to choose a
 * target or an amount.
 */

type Literal = number | string | boolean | null;
type Operand = { path: string } | { literal: Literal };

const COMPARATORS = ["<=", ">=", "!=", "==", "<", ">"] as const;
type Comparator = (typeof COMPARATORS)[number];

const PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*$/;

function parseOperand(raw: string): Operand | null {
  const token = raw.trim();
  if (token === "") return null;
  if (token === "true") return { literal: true };
  if (token === "false") return { literal: false };
  if (token === "null") return { literal: null };
  if (/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(token)) return { literal: Number(token) };
  if (
    (token.startsWith("'") && token.endsWith("'") && token.length >= 2) ||
    (token.startsWith('"') && token.endsWith('"') && token.length >= 2)
  ) {
    return { literal: token.slice(1, -1) };
  }
  if (PATH_RE.test(token)) return { path: token };
  return null;
}

/** Dotted lookup with no prototype access. Missing path -> undefined. */
function resolvePath(data: Record<string, unknown>, path: string): unknown {
  let cursor: unknown = data;
  for (const segment of path.split(".")) {
    if (segment === "__proto__" || segment === "constructor" || segment === "prototype") {
      return undefined;
    }
    if (typeof cursor !== "object" || cursor === null) return undefined;
    if (!Object.prototype.hasOwnProperty.call(cursor, segment)) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function valueOf(operand: Operand, data: Record<string, unknown>): unknown {
  return "path" in operand ? resolvePath(data, operand.path) : operand.literal;
}

function compare(left: unknown, op: Comparator, right: unknown): boolean {
  if (op === "==") return left === right;
  if (op === "!=") return left !== right;
  // Ordering comparisons are numbers only. A string that looks like a number
  // from untrusted data does not get silently coerced into one.
  if (typeof left !== "number" || typeof right !== "number") return false;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  switch (op) {
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
  }
}

/** A single `a op b`, or a bare path/literal evaluated for truthiness. */
function evaluateComparison(clause: string, data: Record<string, unknown>): boolean {
  for (const op of COMPARATORS) {
    const idx = clause.indexOf(op);
    if (idx > 0) {
      const left = parseOperand(clause.slice(0, idx));
      const right = parseOperand(clause.slice(idx + op.length));
      if (!left || !right) return false;
      return compare(valueOf(left, data), op, valueOf(right, data));
    }
  }
  const bare = parseOperand(clause);
  if (!bare) return false;
  return valueOf(bare, data) === true;
}

/**
 * Evaluates a `when` expression: comparisons joined by `and` / `or`, with `and`
 * binding tighter. Anything it cannot parse evaluates to `false` — an
 * unparseable condition must never be a reason to move money.
 */
export function evaluateCondition(
  when: string | null,
  data: Record<string, unknown>,
): boolean {
  if (when === null) return true; // no condition == always satisfied
  const expression = when.trim();
  if (expression === "") return true;
  if (expression.length > 300) return false; // nothing legitimate is this long
  return expression
    .split(/\s+or\s+/i)
    .some((orTerm) =>
      orTerm
        .split(/\s+and\s+/i)
        .every((andTerm) => evaluateComparison(andTerm.trim(), data)),
    );
}

/**
 * Whether a condition can be evaluated at all — a STATIC check of the grammar,
 * with no data.
 *
 * This exists because "unparseable" and "not satisfied" are the same answer from
 * `evaluateCondition` (`false`, which is the only safe direction to fail) and
 * very different facts to show a user. `draftFromIntent` emits prose like
 * `"threshold breached"` when it cannot derive a real comparison from a sentence,
 * so a drafted autonomous app shipped a trigger that fails closed on every block
 * — correct, and silently inert. Nothing on screen said so, and a trigger listed
 * without comment reads as armed.
 *
 * Note the asymmetry, which is intended: `null` and `""` are EVALUABLE and mean
 * "always satisfied" (see `evaluateCondition`). That is a real configuration — an
 * on-every-block trigger — not a missing one. So a caller must not treat `null`
 * as "unset"; the distinction is between a condition that expresses something and
 * one whose author expressed nothing.
 *
 * Probed against a sentinel data model rather than reimplementing the grammar: a
 * second copy is exactly how a UI ends up disagreeing with the evaluator.
 */
export function isConditionEvaluable(when: string | null): boolean {
  if (when === null) return true;
  const expression = when.trim();
  if (expression === "") return true;
  if (expression.length > 300) return false;
  return expression
    .split(/\s+or\s+/i)
    .every((orTerm) =>
      orTerm
        .split(/\s+and\s+/i)
        .every((andTerm) => isComparisonEvaluable(andTerm.trim())),
    );
}

/** One clause: either `<operand> <op> <operand>`, or a bare truthy path. */
function isComparisonEvaluable(clause: string): boolean {
  for (const op of COMPARATORS) {
    const idx = clause.indexOf(op);
    if (idx > 0) {
      return (
        parseOperand(clause.slice(0, idx)) !== null &&
        parseOperand(clause.slice(idx + op.length)) !== null
      );
    }
  }
  return parseOperand(clause) !== null;
}
