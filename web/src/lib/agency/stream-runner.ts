/**
 * W2 — THE STREAM → TRIGGER SEAM.
 *
 * This is the module that makes W2's definition of done true: *a block-level
 * event fires a trigger callback.* One Substreams tick arrives, the app's
 * metrics are re-read, `runTriggers` evaluates, and the policy gate decides.
 * Nothing here can sign — it proposes into `runTriggers`, which is the only path
 * to the signer, and that path has no bypass.
 *
 * Three decisions in here that are correctness, not style:
 *
 * 1. THE CURSOR IS COMMITTED AFTER PROCESSING, NOT BEFORE. Commit-then-act loses
 *    a block if the process dies mid-action; act-then-commit replays it, and the
 *    replay is harmless because the signal ledger dedupes on `tick.id`. At-least-
 *    once with an idempotent key beats at-most-once when the effect is a trade.
 *
 * 2. ENRICHMENT OUTRANKS TICK DATA. The tick's payload is untrusted indexed data
 *    (prd.md §7 — prompt/param injection via token names, memos, crafted
 *    amounts). If a module output could set `healthFactor`, whoever influences
 *    that output could fire an autonomous trigger at will. So our own read is
 *    merged LAST and wins every key collision, and the tick payload is namespaced
 *    under `block` where a condition can still reference it explicitly.
 *
 * 3. A HALTED APP STILL CONSUMES THE STREAM. It journals the refusal instead of
 *    unsubscribing. That is what makes the kill switch visible in the Ledger —
 *    "the app is still running, it just can't spend" (prd.md §16) — rather than a
 *    silence you cannot distinguish from a crashed subscription.
 */
import type { Network } from "@/lib/contracts/manifest";
import {
  cursorKeyOf,
  getCursorStore,
  isStreamLive,
  resolveStreamTarget,
  streamEvents,
  type StreamCursorStore,
  type StreamEvent,
  type StreamTarget,
  type StreamTick,
} from "@/lib/kit/substreams";
import { getJournal, journal, type JournalStore } from "./journal";
import { runTriggers, type TriggerRun, type TriggerSignal } from "./triggers";
import { getApp } from "./wallet";

/** What the trigger condition gets to compare against. */
export type SignalData = Record<string, unknown>;

/**
 * Re-reads whatever the app's conditions are about, once per tick. Injectable
 * because the fan-out is a network call and the tests must not make one.
 */
export type Enrich = (tick: StreamTick) => Promise<SignalData> | SignalData;

export interface RunStreamOptions {
  appId: string;
  network: Network;
  /** The manifest's `data.stream` block. Null falls back to the default package. */
  stream?: { package: string; module: string } | null;
  enrich?: Enrich;
  /** Stop after this many ticks. The verify harness uses it; production omits it. */
  maxTicks?: number;
  /** Cold-start block. Negative means "N blocks behind head". */
  startBlockNum?: number;
  stopBlockNum?: number | `+${number}`;
  /** Ignore any stored cursor and start fresh. */
  ignoreCursor?: boolean;
  cursors?: StreamCursorStore;
  store?: JournalStore;
  signal?: AbortSignal;
  /** Called for every tick, fired or not. The observation hook for the UI. */
  onTick?: (tick: StreamTick, runs: TriggerRun[]) => void;
  /**
   * Event source override. Exists so the tests can drive the whole runner —
   * cursor ordering, dedupe, the halted path — without a token or a socket.
   * Production leaves it unset and gets a real subscription.
   */
  events?: AsyncIterable<StreamEvent>;
}

export interface RunStreamSummary {
  appId: string;
  target: StreamTarget;
  ticks: number;
  /** Ticks where at least one trigger's condition was satisfied. */
  ticksWithFiring: number;
  firings: number;
  executed: number;
  rejected: number;
  /** Reorgs seen. Journalled, never acted on. */
  undos: number;
  lastCursor: string | null;
  lastBlock: number | null;
  firstBlock: number | null;
  /** Every rejection reason, in order — the policy story for the demo. */
  rejections: string[];
  txHashes: string[];
}

/**
 * Which evaluation mode autonomy is CAPABLE of, and if it is the weaker one, why.
 * The UI must be able to say "polling" out loud: claiming block-level latency
 * while actually polling would be the same class of lie as an unattested
 * provenance record.
 *
 * CAPABILITY, NOT ACTIVITY — and the distinction is load-bearing. This function
 * reads one thing: whether a token is configured. It cannot know whether anything
 * is subscribed, because subscriptions here are bounded by design (see the header
 * of `app/api/stream/route.ts`) and exist only for the seconds a `watchBlocks` run
 * lasts. The old `reason` string said "subscribed per block", which a UI would
 * reasonably echo — and for a long time nothing in the product called
 * `POST /api/stream` at all, so that string was describing a subscription that had
 * never once been opened. `mode: "substreams"` means the run *would* be per-block
 * when you start one. It does not mean one is running.
 */
export function streamMode(): { mode: "substreams" | "interval"; reason: string } {
  return isStreamLive()
    ? {
        mode: "substreams",
        reason:
          "SUBSTREAMS_API_TOKEN present — per-block evaluation available; a subscription " +
          "opens only for the duration of a bounded watch",
      }
    : {
        mode: "interval",
        reason: "SUBSTREAMS_API_TOKEN not set — falling back to interval polling",
      };
}

/**
 * Merges the untrusted block payload with our own read.
 *
 * Order is the security property: `block.*` is namespaced, the flat top level is
 * ours, and enrichment is applied last so nothing in the stream can shadow a
 * metric the app actually measured.
 */
export function buildSignalData(tick: StreamTick, enriched: SignalData): SignalData {
  const data: SignalData = {
    // Block facts. Trustworthy because they come from the clock, not the module.
    blockNumber: tick.blockNumber,
    blockId: tick.blockId,
    blockTime: Math.floor(tick.at.getTime() / 1000),
    final: tick.final,
    // Untrusted module output, explicitly namespaced.
    block: tick.data,
  };
  for (const [key, value] of Object.entries(enriched)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    data[key] = value;
  }
  return data;
}

/**
 * Subscribes and runs until the stream ends, `maxTicks` is hit, or the signal
 * aborts. Does not reconnect: the caller owns that decision (see
 * `isRetryableStreamError`), because an app that got halted should not be
 * silently resubscribed by its own transport layer.
 */
export async function runStream(options: RunStreamOptions): Promise<RunStreamSummary> {
  const app = getApp(options.appId);
  if (!app) throw new Error(`Unknown mini app "${options.appId}" — register it before streaming`);

  const target = resolveStreamTarget({ network: options.network, stream: options.stream ?? null });
  const store = options.store ?? getJournal();
  const cursors = options.cursors ?? getCursorStore();
  const cursorKey = cursorKeyOf(options.appId, target);
  const startCursor = options.ignoreCursor ? null : await cursors.get(cursorKey);

  const summary: RunStreamSummary = {
    appId: options.appId,
    target,
    ticks: 0,
    ticksWithFiring: 0,
    firings: 0,
    executed: 0,
    rejected: 0,
    undos: 0,
    lastCursor: startCursor,
    lastBlock: null,
    firstBlock: null,
    rejections: [],
    txHashes: [],
  };

  await journal.stream(
    store,
    options.appId,
    `subscribed ${target.module} @ ${target.network} via ${target.endpoint}` +
      (startCursor ? " (resumed from cursor)" : " (from head)"),
  );

  const source =
    options.events ??
    streamEvents({
      target,
      startCursor,
      startBlockNum: options.startBlockNum,
      stopBlockNum: options.stopBlockNum,
      signal: options.signal,
    });

  for await (const event of source) {
    if (event.kind === "undo") {
      summary.undos += 1;
      // A reorg is not an event to act on. Record it, keep the cursor the server
      // handed us, and let the next data message re-establish the position.
      await journal.stream(
        store,
        options.appId,
        `REORG — blocks after ${event.lastValidBlock} are invalid; no action taken`,
      );
      summary.lastCursor = event.cursor;
      await cursors.set(cursorKey, event.cursor);
      continue;
    }

    // `{ kind: "tick" } & StreamTick` — already a tick, no need to strip.
    const tick: StreamTick = event;
    summary.ticks += 1;
    summary.firstBlock ??= tick.blockNumber;
    summary.lastBlock = tick.blockNumber;

    const enriched = options.enrich ? await options.enrich(tick) : {};
    const signal: TriggerSignal = {
      id: tick.id,
      kind: "stream",
      at: tick.at,
      data: buildSignalData(tick, enriched),
    };

    const runs = await runTriggers({
      appId: options.appId,
      agency: app.agency,
      wallet: app.wallet,
      signal,
      store,
    });

    const fired = runs.filter((r) => r.firing.fired);
    if (fired.length > 0) summary.ticksWithFiring += 1;
    summary.firings += fired.length;
    for (const run of runs) {
      if (!run.result) continue;
      if (run.result.executed) summary.executed += 1;
      if (!run.result.decision.allowed) {
        summary.rejected += 1;
        summary.rejections.push(run.result.decision.reason);
      }
      if (run.result.txHash) summary.txHashes.push(run.result.txHash);
    }

    options.onTick?.(tick, runs);

    // Commit last. A replay of this block is deduped by the signal ledger; a
    // block skipped because we committed early is gone.
    summary.lastCursor = tick.cursor;
    await cursors.set(cursorKey, tick.cursor);

    if (options.maxTicks !== undefined && summary.ticks >= options.maxTicks) break;
  }

  await journal.stream(
    store,
    options.appId,
    `stream closed after ${summary.ticks} block(s), ${summary.firings} trigger firing(s)`,
  );

  return summary;
}
