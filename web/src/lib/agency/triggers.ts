/**
 * W6 — TRIGGER EVALUATION.
 *
 * Turns `zTrigger` (`stream` | `interval` | `manual`) plus incoming data into a
 * proposed action. A satisfied trigger PROPOSES; `runAction()` still runs the
 * full policy gate. There is no path from a trigger to a signature that skips
 * the gate.
 *
 * Two properties worth being explicit about:
 *
 * 1. NO `eval`. Trigger conditions are evaluated by the tiny comparison parser
 *    below. The values on the right of every comparison come from indexed
 *    onchain data, which is attacker-controlled — a token name, an ENS text
 *    record, a memo. Here that data is only ever *compared*. It is never parsed
 *    as an instruction, never concatenated into a prompt, and never used to
 *    choose a target or an amount.
 *
 * 2. NO RE-FIRING. Every firing is keyed by (trigger, signal id) in the signal
 *    ledger. An autonomous app that re-trades on the same event is broken, so
 *    the ledger is checked before the gate, not after.
 */
import type { Agency, Trigger } from "../contracts/manifest";
import { getJournal, journal, type JournalStore } from "./journal";
import type { AgencyProposedAction } from "./policy";
import { runAction, type AgencySigner, type RunActionResult } from "./signer";
import type { MiniAppWallet } from "./wallet";

/** One incoming datum: a Substreams tick, a timer, or a button press. */
export interface TriggerSignal {
  /** Stable id for this event — a block/tx cursor for streams, a timestamp
   *  bucket for intervals. Dedupe is only as good as this id. */
  id: string;
  kind: Trigger["on"];
  at: Date;
  /** UNTRUSTED. Indexed onchain data. Compared, never interpreted. */
  data: Record<string, unknown>;
}

export interface TriggerFiring {
  trigger: Trigger;
  triggerKey: string;
  fired: boolean;
  /** Why it did or did not fire — journalled verbatim. */
  reason: string;
  proposed?: AgencyProposedAction;
}

/* ------------------------------------------------------------------ *
 * Condition evaluation — a comparison parser, not an interpreter.
 * ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ *
 * Signal ledger — the anti-re-fire memory.
 * ------------------------------------------------------------------ */

export interface SignalLedger {
  /** Has (app, key) already been acted on? */
  seen(appId: string, key: string): Promise<boolean>;
  mark(appId: string, key: string): Promise<void>;
  lastFiredAt(appId: string, triggerKey: string): Promise<number | null>;
  recordFire(appId: string, triggerKey: string, at: number): Promise<void>;
}

export class MemorySignalLedger implements SignalLedger {
  private readonly seenKeys = new Map<string, Set<string>>();
  private readonly lastFired = new Map<string, number>();

  async seen(appId: string, key: string): Promise<boolean> {
    return this.seenKeys.get(appId)?.has(key) ?? false;
  }
  async mark(appId: string, key: string): Promise<void> {
    const set = this.seenKeys.get(appId) ?? new Set<string>();
    set.add(key);
    this.seenKeys.set(appId, set);
  }
  async lastFiredAt(appId: string, triggerKey: string): Promise<number | null> {
    return this.lastFired.get(`${appId}::${triggerKey}`) ?? null;
  }
  async recordFire(appId: string, triggerKey: string, at: number): Promise<void> {
    this.lastFired.set(`${appId}::${triggerKey}`, at);
  }
}

const LEDGER_KEY = "__graphminis_signal_ledger__";
type LedgerGlobal = typeof globalThis & { [LEDGER_KEY]?: SignalLedger };

export function getSignalLedger(): SignalLedger {
  const g = globalThis as LedgerGlobal;
  g[LEDGER_KEY] ??= new MemorySignalLedger();
  return g[LEDGER_KEY];
}

export function setSignalLedger(ledger: SignalLedger): void {
  (globalThis as LedgerGlobal)[LEDGER_KEY] = ledger;
}

/* ------------------------------------------------------------------ *
 * Proposal
 * ------------------------------------------------------------------ */

export function triggerKeyOf(trigger: Trigger, index: number): string {
  return `${index}:${trigger.on}:${trigger.run}`;
}

/**
 * Builds the proposed action for a satisfied trigger.
 *
 * Target and amount come from the MANIFEST, never from the signal. That is the
 * whole defence against a crafted stream event: an attacker who controls the
 * data can at most decide *whether* a pre-declared, pre-capped, allowlisted
 * action runs — never what it does or how much it moves.
 */
export function proposeFromTrigger(
  agency: Pick<Agency, "actions">,
  trigger: Trigger,
  signal: TriggerSignal,
): AgencyProposedAction | null {
  const action = agency.actions[trigger.run];
  if (!action) return null;
  const declaredAmount = action.params?.["amountUsd"];
  // An action with no declared amount is not "free" — it is unbounded, so it
  // is proposed at Infinity and the per-tx cap rejects it.
  const amountUsd =
    typeof declaredAmount === "number" && Number.isFinite(declaredAmount)
      ? declaredAmount
      : Number.POSITIVE_INFINITY;
  return {
    actionKey: trigger.run,
    action,
    target: action.target ?? "",
    amountUsd,
    // Only a manual trigger driven by a manual signal counts as a human press.
    userInitiated: trigger.on === "manual" && signal.kind === "manual",
  };
}

/* ------------------------------------------------------------------ *
 * Evaluation
 * ------------------------------------------------------------------ */

export interface EvaluateTriggersInput {
  appId: string;
  agency: Pick<Agency, "triggers" | "actions">;
  signal: TriggerSignal;
  ledger?: SignalLedger;
}

/**
 * Which triggers this signal satisfies. Pure with respect to the outside world
 * apart from the ledger read; nothing is marked as fired here, because a
 * proposal is not an execution.
 */
export async function evaluateTriggers(input: EvaluateTriggersInput): Promise<TriggerFiring[]> {
  const ledger = input.ledger ?? getSignalLedger();
  const results: TriggerFiring[] = [];

  for (const [index, trigger] of input.agency.triggers.entries()) {
    const triggerKey = triggerKeyOf(trigger, index);
    const base = { trigger, triggerKey };

    if (trigger.on !== input.signal.kind) {
      results.push({ ...base, fired: false, reason: `signal is ${input.signal.kind}, trigger is ${trigger.on}` });
      continue;
    }

    const dedupeKey = `${triggerKey}#${input.signal.id}`;
    if (await ledger.seen(input.appId, dedupeKey)) {
      results.push({ ...base, fired: false, reason: `already acted on signal ${input.signal.id}` });
      continue;
    }

    if (trigger.on === "interval") {
      const intervalSec = trigger.intervalSec ?? 0;
      if (intervalSec <= 0) {
        results.push({ ...base, fired: false, reason: "interval trigger has no intervalSec" });
        continue;
      }
      const last = await ledger.lastFiredAt(input.appId, triggerKey);
      if (last !== null && input.signal.at.getTime() - last < intervalSec * 1000) {
        const waited = Math.round((input.signal.at.getTime() - last) / 1000);
        results.push({ ...base, fired: false, reason: `only ${waited}s since last fire, interval is ${intervalSec}s` });
        continue;
      }
    }

    if (!evaluateCondition(trigger.when, input.signal.data)) {
      results.push({ ...base, fired: false, reason: `condition not met: ${trigger.when ?? "(none)"}` });
      continue;
    }

    const proposed = proposeFromTrigger(input.agency, trigger, input.signal);
    if (!proposed) {
      results.push({ ...base, fired: false, reason: `action "${trigger.run}" is not defined in this manifest` });
      continue;
    }

    results.push({
      ...base,
      fired: true,
      reason: trigger.when ? `condition met: ${trigger.when}` : "trigger fired",
      proposed,
    });
  }

  return results;
}

export interface RunTriggersInput extends EvaluateTriggersInput {
  agency: Agency;
  wallet: MiniAppWallet;
  store?: JournalStore;
  signer?: AgencySigner;
  now?: Date;
}

export interface TriggerRun {
  firing: TriggerFiring;
  result?: RunActionResult;
}

/**
 * The autonomous path end to end: signal in, journal + (maybe) tx hash out.
 *
 * The ledger is marked BEFORE the gate runs, so a rejected action still burns
 * the signal. Retrying a policy-rejected action on the next tick of the same
 * event is how you get a loop that hammers the gate forever.
 */
export async function runTriggers(input: RunTriggersInput): Promise<TriggerRun[]> {
  const store = input.store ?? getJournal();
  const ledger = input.ledger ?? getSignalLedger();
  const firings = await evaluateTriggers({ ...input, ledger });
  const runs: TriggerRun[] = [];

  await journal.stream(
    store,
    input.appId,
    `signal ${input.signal.id} (${input.signal.kind}) — ${firings.filter((f) => f.fired).length}/${firings.length} triggers satisfied`,
  );

  for (const firing of firings) {
    if (!firing.fired || !firing.proposed) {
      runs.push({ firing });
      continue;
    }
    await journal.trigger(store, input.appId, `${firing.triggerKey} — ${firing.reason}`);
    await ledger.mark(input.appId, `${firing.triggerKey}#${input.signal.id}`);
    await ledger.recordFire(input.appId, firing.triggerKey, input.signal.at.getTime());

    const result = await runAction({
      appId: input.appId,
      proposed: firing.proposed,
      agency: input.agency,
      wallet: input.wallet,
      store,
      signer: input.signer,
      now: input.now ?? input.signal.at,
      source: firing.triggerKey,
    });
    runs.push({ firing, result });
  }

  return runs;
}
