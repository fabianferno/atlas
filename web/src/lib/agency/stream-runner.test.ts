/**
 * Stream → trigger seam tests.
 *
 * The interesting claims here are not "it iterates". They are:
 *   - untrusted module output cannot shadow a metric we measured ourselves
 *   - a replayed block does not trade twice
 *   - a reorg never becomes an action
 *   - the cursor is committed after the action, not before
 *   - a halted app keeps consuming the stream and journals the refusal
 *
 * No token, no socket: the runner takes an injected event source.
 */
import type { Action, Agency, Policy } from "../contracts/manifest";
import {
  MemoryCursorStore,
  cursorKeyOf,
  isRetryableStreamError,
  resolveStreamTarget,
  SUBSTREAMS_ENDPOINTS,
  type StreamEvent,
  type StreamTick,
} from "../kit/substreams";
import { assert, assertEqual, describe, itAsync, it } from "./harness.test";
import { MemoryJournalStore } from "./journal";
import { buildSignalData, runStream, streamMode } from "./stream-runner";
import { MemorySignalLedger, setSignalLedger } from "./triggers";
import { provisionWallet, registerApp, haltApp, type MiniAppWallet } from "./wallet";

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

function agency(p: Policy = policy()): Agency {
  return {
    tier: "autonomous",
    triggers: [{ on: "stream", when: "healthFactor < 1.4", run: "derisk", intervalSec: undefined }],
    actions: { derisk: swap },
    policy: p,
  };
}

function tick(blockNumber: number, overrides: Partial<StreamTick> = {}): StreamEvent {
  return {
    kind: "tick",
    id: `${blockNumber}:0xabc${blockNumber}`,
    blockNumber,
    blockId: `0xabc${blockNumber}`,
    at: new Date("2026-07-25T09:00:00.000Z"),
    cursor: `cursor-${blockNumber}`,
    final: true,
    data: {},
    ...overrides,
  };
}

async function* from(events: StreamEvent[]): AsyncGenerator<StreamEvent> {
  for (const e of events) yield e;
}

/** A fresh app id per test — the registry and the ledger are process-global. */
let seq = 0;
async function freshApp(p: Policy = policy()): Promise<{ appId: string; wallet: MiniAppWallet }> {
  seq += 1;
  const appId = `stream-test-${seq}`;
  const wallet = await provisionWallet({ appId, tier: "autonomous", policy: p });
  registerApp({ appId, agency: agency(p), wallet });
  return { appId, wallet };
}

describe("substreams config", () => {
  it("has an endpoint for every network the manifest allows", () => {
    for (const network of ["arbitrum-one", "optimism", "base", "mainnet"] as const) {
      assert(
        SUBSTREAMS_ENDPOINTS[network].startsWith("https://"),
        `${network} endpoint must be an https base url`,
      );
    }
  });

  it("prefers the manifest's own stream block over the default package", () => {
    const target = resolveStreamTarget({
      network: "arbitrum-one",
      stream: { package: "https://spkg.io/x/custom-v1.0.0.spkg", module: "map_positions" },
    });
    assertEqual(target.module, "map_positions", "module comes from the manifest");
    assertEqual(target.spkg, "https://spkg.io/x/custom-v1.0.0.spkg", "package comes from the manifest");
  });

  it("keys cursors per app, network and module so two apps cannot share a resume point", () => {
    const a = cursorKeyOf("app-a", resolveStreamTarget({ network: "base" }));
    const b = cursorKeyOf("app-b", resolveStreamTarget({ network: "base" }));
    assert(a !== b, "cursor keys must not collide across apps");
  });

  it("classifies a disconnect as retryable and a bad token as fatal", () => {
    assert(isRetryableStreamError(new Error("stream closed")), "disconnect is retryable");
    assert(isRetryableStreamError(new Error("[unavailable] backend")), "unavailable is retryable");
    assert(!isRetryableStreamError(new Error("[unauthenticated] bad token")), "auth failure is fatal");
    assert(!isRetryableStreamError(new Error("module not found")), "missing module is fatal");
  });

  it("reports which mode autonomy is actually running in", () => {
    const before = process.env.SUBSTREAMS_API_TOKEN;
    delete process.env.SUBSTREAMS_API_TOKEN;
    assertEqual(streamMode().mode, "interval", "no token means polling, and it says so");
    process.env.SUBSTREAMS_API_TOKEN = "test-token";
    assertEqual(streamMode().mode, "substreams", "a token means subscribed");
    if (before === undefined) delete process.env.SUBSTREAMS_API_TOKEN;
    else process.env.SUBSTREAMS_API_TOKEN = before;
  });
});

describe("signal data assembly", () => {
  it("namespaces untrusted module output under `block`", () => {
    const data = buildSignalData({ ...tick(100) } as StreamTick, {});
    assert("block" in data, "module output must be namespaced");
    assertEqual(data["blockNumber"], 100, "block number comes from the clock");
  });

  it("does not let module output shadow a metric we measured", () => {
    // The attack: a crafted module output claiming a health factor low enough to
    // fire an autonomous rebalance.
    const hostile = { ...tick(101), data: { healthFactor: 0.1 } } as StreamTick;
    const data = buildSignalData(hostile, { healthFactor: 2.5 });
    assertEqual(data["healthFactor"], 2.5, "our own read must win the collision");
  });

  it("refuses prototype keys from the stream payload", () => {
    const data = buildSignalData({ ...tick(102) } as StreamTick, {
      ["__proto__"]: { polluted: true },
    } as unknown as Record<string, unknown>);
    assertEqual(
      (Object.prototype as unknown as { polluted?: boolean }).polluted,
      undefined,
      "Object.prototype must be untouched",
    );
    assert(data !== null, "data still built");
  });
});

describe("runStream", () => {
  itAsync("a block-level event fires a trigger and reaches the policy gate", async () => {
    setSignalLedger(new MemorySignalLedger());
    const { appId } = await freshApp();
    const store = new MemoryJournalStore();

    const summary = await runStream({
      appId,
      network: "arbitrum-one",
      store,
      cursors: new MemoryCursorStore(),
      events: from([tick(1000), tick(1001)]),
      // Second block is the one that breaches. First must not fire.
      enrich: (t) => ({ healthFactor: t.blockNumber === 1001 ? 1.2 : 1.9 }),
    });

    assertEqual(summary.ticks, 2, "both blocks consumed");
    assertEqual(summary.firings, 1, "exactly one firing — only the breaching block");
    assertEqual(summary.ticksWithFiring, 1, "one tick carried a firing");

    const entries = await store.list(appId);
    assert(
      entries.some((e) => e.kind === "TRIGGER"),
      "a TRIGGER line must appear in the journal",
    );
  });

  itAsync("a replayed block does not fire the same trigger twice", async () => {
    setSignalLedger(new MemorySignalLedger());
    const { appId } = await freshApp();
    const store = new MemoryJournalStore();

    const summary = await runStream({
      appId,
      network: "arbitrum-one",
      store,
      cursors: new MemoryCursorStore(),
      // The same block arrives twice, which is normal after a reconnect.
      events: from([tick(2000), tick(2000)]),
      enrich: () => ({ healthFactor: 1.0 }),
    });

    assertEqual(summary.ticks, 2, "both deliveries consumed");
    assertEqual(summary.firings, 1, "the replay must be deduped by tick id");
  });

  itAsync("a reorg is journalled and never acted on", async () => {
    setSignalLedger(new MemorySignalLedger());
    const { appId } = await freshApp();
    const store = new MemoryJournalStore();

    const summary = await runStream({
      appId,
      network: "arbitrum-one",
      store,
      cursors: new MemoryCursorStore(),
      events: from([{ kind: "undo", lastValidBlock: 3000, cursor: "cursor-undo" }]),
      enrich: () => ({ healthFactor: 0.1 }),
    });

    assertEqual(summary.undos, 1, "the undo was seen");
    assertEqual(summary.ticks, 0, "an undo is not a tick");
    assertEqual(summary.firings, 0, "an undo must never fire a trigger");
    const entries = await store.list(appId);
    assert(
      entries.some((e) => e.message.includes("REORG")),
      "the reorg must be visible in the journal",
    );
  });

  itAsync("commits the cursor only after the block has been processed", async () => {
    setSignalLedger(new MemorySignalLedger());
    const { appId } = await freshApp();
    const cursors = new MemoryCursorStore();
    const target = resolveStreamTarget({ network: "arbitrum-one" });
    const key = cursorKeyOf(appId, target);
    const observed: (string | null)[] = [];

    await runStream({
      appId,
      network: "arbitrum-one",
      store: new MemoryJournalStore(),
      cursors,
      events: from([tick(4000), tick(4001)]),
      // Enrichment runs before the gate, so the cursor visible here is the
      // PREVIOUS block's. If it were already this block's, a crash mid-action
      // would lose the block.
      enrich: async (t) => {
        observed.push(await cursors.get(key));
        return { healthFactor: t.blockNumber === 4000 ? 1.9 : 1.9 };
      },
    });

    assertEqual(observed[0], null, "nothing committed before the first block is processed");
    assertEqual(observed[1], "cursor-4000", "the first block's cursor is committed before the second");
    assertEqual(await cursors.get(key), "cursor-4001", "the last cursor is committed at the end");
  });

  itAsync("a halted app keeps consuming the stream and records the refusal", async () => {
    setSignalLedger(new MemorySignalLedger());
    const { appId } = await freshApp();
    const store = new MemoryJournalStore();
    haltApp(appId);

    const summary = await runStream({
      appId,
      network: "arbitrum-one",
      store,
      cursors: new MemoryCursorStore(),
      events: from([tick(5000)]),
      enrich: () => ({ healthFactor: 1.0 }),
    });

    assertEqual(summary.ticks, 1, "the halted app still consumed the block");
    assertEqual(summary.firings, 1, "the trigger still fired — halting is not unsubscribing");
    assertEqual(summary.executed, 0, "nothing executed");
    assert(summary.rejected >= 1, "the kill switch rejected it at the gate");
    const entries = await store.list(appId);
    assert(
      entries.some((e) => e.kind === "POLICY" && !e.ok),
      "the refusal is visible in the Ledger",
    );
  });

  itAsync("refuses to stream for an app that was never registered", async () => {
    let threw = false;
    try {
      await runStream({
        appId: "no-such-app",
        network: "base",
        events: from([tick(1)]),
      });
    } catch {
      threw = true;
    }
    assert(threw, "an unregistered app has no policy, so it must not stream");
  });
});
