/**
 * Trigger tests.
 *
 * Two things being proven here beyond "the comparison works": trigger
 * conditions never execute attacker-controlled data, and a signal that has
 * already been acted on cannot fire the same trigger twice.
 */
import type { Action, Agency, Policy, Trigger } from "../contracts/manifest";
import { assert, assertEqual, describe, it, itAsync } from "./harness.test";
import { MemoryJournalStore } from "./journal";
import {
  MemorySignalLedger,
  evaluateCondition,
  isConditionEvaluable,
  evaluateTriggers,
  proposeFromTrigger,
  runTriggers,
  type TriggerSignal,
} from "./triggers";
import { provisionWallet } from "./wallet";

const ROUTER = "0x94cc0aac535ccdb3c01d6787d6413c739ae12bc4";

const swap: Action = { kind: "swap", target: ROUTER, params: { amountUsd: 25 }, label: "Derisk" };

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    wallet: "0x2222222222222222222222222222222222222222",
    maxSpendUsd: 250,
    maxPerTxUsd: 50,
    allowlist: [ROUTER],
    expiresAt: null,
    requireConfirm: false,
    killSwitch: true,
    halted: false,
    ...overrides,
  };
}

function agency(triggers: Trigger[], p: Policy = policy()): Agency {
  return { tier: "autonomous", triggers, actions: { derisk: swap }, policy: p };
}

function signal(overrides: Partial<TriggerSignal> = {}): TriggerSignal {
  return {
    id: "block-12345",
    kind: "stream",
    at: new Date("2026-07-24T12:00:00.000Z"),
    data: { healthFactor: 1.02, pool: { tvlUsd: 4_200_000 }, symbol: "WETH" },
    ...overrides,
  };
}

describe("condition evaluation", () => {
  it("evaluates numeric comparisons against stream data", () => {
    const data = { healthFactor: 1.02 };
    assertEqual(evaluateCondition("healthFactor < 1.15", data), true);
    assertEqual(evaluateCondition("healthFactor > 1.15", data), false);
    assertEqual(evaluateCondition("healthFactor <= 1.02", data), true);
    assertEqual(evaluateCondition("healthFactor >= 1.03", data), false);
  });

  it("resolves dotted paths", () => {
    assertEqual(evaluateCondition("pool.tvlUsd > 1000000", { pool: { tvlUsd: 4_200_000 } }), true);
  });

  it("supports and / or with and binding tighter", () => {
    const data = { hf: 1.0, tvl: 10 };
    assertEqual(evaluateCondition("hf < 1.1 and tvl > 5", data), true);
    assertEqual(evaluateCondition("hf < 1.1 and tvl > 50", data), false);
    assertEqual(evaluateCondition("hf > 9 or tvl > 5", data), true);
    assertEqual(evaluateCondition("hf > 9 or tvl > 50", data), false);
  });

  it("compares strings only with == and !=", () => {
    assertEqual(evaluateCondition("symbol == 'WETH'", { symbol: "WETH" }), true);
    assertEqual(evaluateCondition("symbol != 'WETH'", { symbol: "WETH" }), false);
    // No coercion: a numeric-looking string is not a number.
    assertEqual(evaluateCondition("amount > 5", { amount: "999999" }), false);
  });

  it("treats a null condition as always satisfied", () => {
    assertEqual(evaluateCondition(null, {}), true);
  });

  describe("untrusted data cannot become code", () => {
    it("does not evaluate expressions embedded in data", () => {
      // A token symbol that would be catastrophic under eval().
      const hostile = { symbol: "'); process.exit(1); //", healthFactor: 5 };
      assertEqual(evaluateCondition("healthFactor < 1.15", hostile), false);
      assertEqual(evaluateCondition("symbol == 'WETH'", hostile), false);
    });

    it("returns false for anything it cannot parse", () => {
      assertEqual(evaluateCondition("process.exit(1)", { healthFactor: 1 }), false);
      assertEqual(evaluateCondition("healthFactor < ", { healthFactor: 1 }), false);
      assertEqual(evaluateCondition("<script>", {}), false);
      assertEqual(evaluateCondition("1 === 1", {}), false);
    });

    it("refuses prototype paths", () => {
      assertEqual(evaluateCondition("__proto__.polluted == true", {}), false);
      assertEqual(evaluateCondition("constructor.name == 'Object'", {}), false);
    });

    it("returns false when the referenced path is missing", () => {
      assertEqual(evaluateCondition("healthFactor < 1.15", {}), false);
    });

    it("rejects an absurdly long condition", () => {
      assertEqual(evaluateCondition(`a < 1 and ${"b < 1 and ".repeat(50)}c < 1`, { a: 0 }), false);
    });
  });
});

describe("condition evaluability — static, no data", () => {
  it("accepts the comparisons the evaluator accepts", () => {
    for (const when of [
      "healthFactor < 1.4",
      "healthFactor <= 1.4 and utilization > 0.9",
      "a == 1 or b != 2",
      "flag",
      "block.number >= 100",
    ]) {
      assertEqual(isConditionEvaluable(when), true, `should be evaluable: ${when}`);
    }
  });

  it("rejects the prose the offline drafter emits", () => {
    // `draftFromIntent` shipped these verbatim as a trigger's `when`. They fail
    // closed at evaluation, so an autonomous app looked armed and could never
    // fire — the exact case this predicate exists to let a UI report.
    for (const when of ["threshold breached", "condition met", "sender == 0x7f3a…9c41"]) {
      assertEqual(isConditionEvaluable(when), false, `should not be evaluable: ${when}`);
    }
  });

  it("treats null and empty as evaluable, because they mean always-fire", () => {
    // Not "unset". `evaluateCondition(null)` is `true`, i.e. every block. A caller
    // that reported these as unconfigured would describe the opposite of what the
    // evaluator does.
    assertEqual(isConditionEvaluable(null), true);
    assertEqual(isConditionEvaluable(""), true);
    assertEqual(evaluateCondition(null, {}), true);
  });

  it("agrees with the evaluator: inevaluable never fires, whatever the data", () => {
    const data = { healthFactor: 1.0, threshold: 1, breached: true, condition: true, met: true };
    for (const when of ["threshold breached", "condition met"]) {
      assertEqual(isConditionEvaluable(when), false);
      assertEqual(evaluateCondition(when, data), false, `must fail closed: ${when}`);
    }
  });

  it("rejects an over-long expression, same bound as the evaluator", () => {
    const long = `x == ${"1".repeat(320)}`;
    assertEqual(isConditionEvaluable(long), false);
    assertEqual(evaluateCondition(long, {}), false);
  });
});

describe("proposals", () => {
  it("takes target and amount from the manifest, never from the signal", () => {
    const hostile = signal({
      data: { healthFactor: 1.0, amountUsd: 1_000_000, target: "0xattacker000000000000000000000000000000000" },
    });
    const proposed = proposeFromTrigger(agency([]), { on: "stream", when: null, run: "derisk" }, hostile);
    assert(proposed !== null, "expected a proposal");
    assertEqual(proposed!.amountUsd, 25, "amount came from the manifest");
    assertEqual(proposed!.target, ROUTER, "target came from the manifest");
  });

  it("proposes Infinity for an action with no declared amount, so the cap rejects it", () => {
    const noAmount: Agency = {
      ...agency([]),
      actions: { derisk: { ...swap, params: {} } },
    };
    const proposed = proposeFromTrigger(noAmount, { on: "stream", when: null, run: "derisk" }, signal());
    assertEqual(proposed!.amountUsd, Number.POSITIVE_INFINITY);
  });

  it("marks a trigger-fired action as not user-initiated", () => {
    const proposed = proposeFromTrigger(agency([]), { on: "stream", when: null, run: "derisk" }, signal());
    assertEqual(proposed!.userInitiated, false);
  });

  it("marks a manual trigger driven by a manual signal as user-initiated", () => {
    const proposed = proposeFromTrigger(
      agency([]),
      { on: "manual", when: null, run: "derisk" },
      signal({ kind: "manual" }),
    );
    assertEqual(proposed!.userInitiated, true);
  });
});

describe("trigger evaluation", () => {
  itAsync("fires when the condition is met", async () => {
    const firings = await evaluateTriggers({
      appId: "t",
      agency: agency([{ on: "stream", when: "healthFactor < 1.15", run: "derisk" }]),
      signal: signal(),
      ledger: new MemorySignalLedger(),
    });
    assertEqual(firings[0]!.fired, true);
  });

  itAsync("does not fire when the signal kind does not match", async () => {
    const firings = await evaluateTriggers({
      appId: "t",
      agency: agency([{ on: "interval", when: null, run: "derisk", intervalSec: 60 }]),
      signal: signal({ kind: "stream" }),
      ledger: new MemorySignalLedger(),
    });
    assertEqual(firings[0]!.fired, false);
  });

  itAsync("does not fire for an action the manifest does not declare", async () => {
    const firings = await evaluateTriggers({
      appId: "t",
      agency: agency([{ on: "stream", when: null, run: "not-a-real-action" }]),
      signal: signal(),
      ledger: new MemorySignalLedger(),
    });
    assertEqual(firings[0]!.fired, false);
    assert(firings[0]!.reason.includes("not defined"), firings[0]!.reason);
  });

  itAsync("respects intervalSec", async () => {
    const ledger = new MemorySignalLedger();
    const trigger: Trigger = { on: "interval", when: null, run: "derisk", intervalSec: 300 };
    const at = new Date("2026-07-24T12:00:00.000Z");
    await ledger.recordFire("t", "0:interval:derisk", at.getTime());

    const tooSoon = await evaluateTriggers({
      appId: "t",
      agency: agency([trigger]),
      signal: signal({ kind: "interval", id: "tick-2", at: new Date(at.getTime() + 60_000) }),
      ledger,
    });
    assertEqual(tooSoon[0]!.fired, false);

    const later = await evaluateTriggers({
      appId: "t",
      agency: agency([trigger]),
      signal: signal({ kind: "interval", id: "tick-3", at: new Date(at.getTime() + 301_000) }),
      ledger,
    });
    assertEqual(later[0]!.fired, true);
  });
});

describe("re-firing", () => {
  itAsync("acts once on a signal and never again", async () => {
    const ledger = new MemorySignalLedger();
    const store = new MemoryJournalStore();
    const wallet = await provisionWallet({ appId: "refire", tier: "autonomous", policy: policy(), kind: "stub" });
    const a = agency([{ on: "stream", when: "healthFactor < 1.15", run: "derisk" }]);
    const input = { appId: "refire", agency: a, wallet, signal: signal(), ledger, store };

    const first = await runTriggers(input);
    assertEqual(first[0]!.firing.fired, true);
    assert(!!first[0]!.result?.txHash, "the first delivery signs");

    // Same signal id redelivered — Substreams reorgs and retries make this
    // routine, and trading twice on it would be a bug that costs money.
    const second = await runTriggers(input);
    assertEqual(second[0]!.firing.fired, false);
    assertEqual(second[0]!.result, undefined, "nothing was proposed the second time");
    assertEqual(await store.totalSpentUsd("refire"), 25, "still one trade's worth of spend");
  });

  itAsync("a rejected action still burns the signal — no retry loop", async () => {
    const ledger = new MemorySignalLedger();
    const store = new MemoryJournalStore();
    const halted = policy({ halted: true });
    const wallet = await provisionWallet({ appId: "burn", tier: "autonomous", policy: halted, kind: "stub" });
    const a = agency([{ on: "stream", when: "healthFactor < 1.15", run: "derisk" }], halted);
    const input = { appId: "burn", agency: a, wallet, signal: signal(), ledger, store };

    const first = await runTriggers(input);
    assertEqual(first[0]!.result?.decision.allowed, false);
    const second = await runTriggers(input);
    assertEqual(second[0]!.firing.fired, false, "the signal was consumed even though the action was denied");
  });

  itAsync("a different signal id fires again", async () => {
    const ledger = new MemorySignalLedger();
    const store = new MemoryJournalStore();
    const wallet = await provisionWallet({ appId: "next", tier: "autonomous", policy: policy(), kind: "stub" });
    const a = agency([{ on: "stream", when: "healthFactor < 1.15", run: "derisk" }]);

    await runTriggers({ appId: "next", agency: a, wallet, signal: signal({ id: "block-1" }), ledger, store });
    await runTriggers({ appId: "next", agency: a, wallet, signal: signal({ id: "block-2" }), ledger, store });
    assertEqual(await store.totalSpentUsd("next"), 50);
  });
});

describe("the trigger path runs the same gate as a human", () => {
  itAsync("a trigger cannot act on a monitor-tier app", async () => {
    const ledger = new MemorySignalLedger();
    const store = new MemoryJournalStore();
    const p = policy({ requireConfirm: true });
    const wallet = await provisionWallet({ appId: "monitor", tier: "monitor", policy: p, kind: "stub" });
    const a: Agency = { ...agency([{ on: "stream", when: "healthFactor < 1.15", run: "derisk" }], p), tier: "monitor" };

    const runs = await runTriggers({ appId: "monitor", agency: a, wallet, signal: signal(), ledger, store });
    assertEqual(runs[0]!.firing.fired, true, "the trigger is satisfied");
    assertEqual(runs[0]!.result?.decision.allowed, false, "and the gate still refuses it");
    if (runs[0]!.result && !runs[0]!.result.decision.allowed) {
      assertEqual(runs[0]!.result.decision.reason, "not_autonomous");
    }
    assertEqual(await store.totalSpentUsd("monitor"), 0);
  });
});
