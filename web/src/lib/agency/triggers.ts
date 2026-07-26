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
import type { Agency, Trigger } from "@/lib/contracts/manifest";
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
 * Condition evaluation lives in `./condition`, which has ZERO imports.
 *
 * It was inline here until a UI needed to ask "can this condition even be
 * evaluated?" — and could not, because this module reaches `./signer`, which
 * pulls viem and permissionless, so importing it from a client component would
 * drag a signing stack into the browser bundle.
 *
 * The alternative was a second copy of the grammar in a component, which is the
 * worse failure by a distance: a UI that says a condition parses while the
 * evaluator disagrees is how an autonomous app ends up looking armed and being
 * inert. One grammar, two callers.
 *
 * Re-exported so every existing importer of `./triggers` is unaffected.
 * ------------------------------------------------------------------ */

// Imported for use below AND re-exported: a bare `export ... from` would satisfy
// importers of this module without creating a local binding, so `runTriggers`
// would not compile.
import { evaluateCondition, isConditionEvaluable } from "./condition";

export { evaluateCondition, isConditionEvaluable };

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

const LEDGER_KEY = "__atlas_signal_ledger__";
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
