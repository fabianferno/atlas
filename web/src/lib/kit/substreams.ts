/**
 * W2 — SUBSTREAMS SUBSCRIPTION.
 *
 * Polling a subgraph means an autonomous guard is up to five minutes late. For
 * an app that only displays, that is a latency preference. For one that spends,
 * it is a correctness bug — which is the whole reason Substreams is in this
 * build rather than a nice-to-have (prd.md §10). This module is the difference:
 * a gRPC subscription that yields one tick per block, each carrying the cursor
 * the stream resumes from.
 *
 * Four properties the rest of the system depends on:
 *
 * 1. LIVE IS A FUNCTION OF CREDENTIALS, never of a flag someone forgets to flip
 *    — same rule as `gateway.isLive()`. `SUBSTREAMS_API_TOKEN` (a JWT from
 *    thegraph.market) is the only switch. Without it `isStreamLive()` is false
 *    and the caller falls back to interval polling *and says so*.
 *
 * 2. EVERY TICK IS IDEMPOTENT. `tick.id` is `<blockNumber>:<blockId>`, which is
 *    what the signal ledger keys dedupe on. Substreams replays from a cursor by
 *    design after a disconnect, so the same block WILL arrive twice and must not
 *    trade twice.
 *
 * 3. AN UNDO IS NOT AN EVENT. A reorg arrives as `blockUndoSignal`. It never
 *    becomes a trigger signal: the correct response to "that block did not
 *    happen" is to stop and rewind, not to act.
 *
 * 4. MODULE OUTPUT IS UNTRUSTED. It is indexed onchain data — a token name, a
 *    memo, a crafted amount. It is flattened to a prototype-less plain object
 *    and only ever *compared* by `evaluateCondition`. It never chooses a target
 *    or an amount; those come from the manifest (see agency/triggers.ts).
 *
 * Node-only: the transport is HTTP/2 via `@connectrpc/connect-node`. Import this
 * from server code (API routes, scripts), never from a client component.
 */
import { createConnectTransport } from "@connectrpc/connect-node";
import {
  createAuthInterceptor,
  createRegistry,
  createRequest,
  streamBlocks,
  unpackMapOutput,
} from "@substreams/core";
import type { Package } from "@substreams/core/proto";
import type { Network } from "@/lib/contracts/manifest";

/* ------------------------------------------------------------------ *
 * Endpoints
 * ------------------------------------------------------------------ */

/**
 * StreamingFast endpoints, verbatim from the Substreams chain-support table
 * (docs.substreams.dev, checked 2026-07-25). These are gRPC hostnames in the
 * docs (`host:443`); the Connect transport wants an https base URL, so the
 * scheme is added here and the port dropped — 443 is the default.
 *
 * Guessing one of these is the same class of error as a dead model id: nothing
 * fails until a real token exists, and then it fails during the demo.
 */
export const SUBSTREAMS_ENDPOINTS: Record<Network, string> = {
  "arbitrum-one": "https://arb-one.streamingfast.io",
  optimism: "https://mainnet.optimism.streamingfast.io",
  base: "https://base-mainnet.streamingfast.io",
  mainnet: "https://mainnet.eth.streamingfast.io",
};

/**
 * Default package: the block-meta explorer from the substreams.dev registry.
 *
 * Deliberately the plainest possible choice. Its output type
 * (`eth.block_meta.v1.BlockMeta`) needs no custom protobuf codegen, and its
 * source is `sf.ethereum.type.v2.Block`, so the same package streams on every
 * EVM endpoint above. A per-block tick is exactly what prd.md §2's worked
 * example describes — "re-evaluates on every block, not every 5 min" — and the
 * position metrics a condition compares against are refreshed per tick by the
 * caller's enrichment step, not carried by the package.
 *
 * A manifest may name any other package in `data.stream`; nothing here is
 * hard-coded past this default.
 */
export const DEFAULT_SPKG = "https://spkg.io/streamingfast/ethereum-explorer-v0.1.2.spkg";
export const DEFAULT_MODULE = "map_block_meta";

/**
 * How long to wait for the first tick before calling a subscription dead.
 *
 * A Substreams connection can accept, send a `session` message, and then deliver
 * nothing — backprocessing on a cold module, a saturated free-tier queue, or an
 * endpoint that took the request and stalled. Without a deadline that is
 * indistinguishable from "no output at all", forever, which is the worst thing to
 * be debugging at 3am with a deadline. Generous, because a legitimate cold start
 * on a heavy package really can take tens of seconds.
 */
export const FIRST_TICK_TIMEOUT_MS = 45_000;

/**
 * Live mode is a function of credentials. The token is a JWT from
 * thegraph.market → Create New Key → API TOKEN.
 */
export function isStreamLive(): boolean {
  return Boolean(process.env.SUBSTREAMS_API_TOKEN);
}

export interface StreamTarget {
  endpoint: string;
  spkg: string;
  module: string;
  network: Network;
}

export interface ResolveStreamTargetOptions {
  network: Network;
  /** The manifest's `data.stream` block, if it has one. */
  stream?: { package: string; module: string } | null;
}

/**
 * Where a manifest's stream actually points. Precedence: the manifest's own
 * `stream` block, then env overrides, then the defaults above.
 */
export function resolveStreamTarget(options: ResolveStreamTargetOptions): StreamTarget {
  const { network, stream } = options;
  return {
    endpoint: process.env.SUBSTREAMS_ENDPOINT ?? SUBSTREAMS_ENDPOINTS[network],
    spkg: stream?.package ?? process.env.SUBSTREAMS_SPKG ?? DEFAULT_SPKG,
    module: stream?.module ?? process.env.SUBSTREAMS_MODULE ?? DEFAULT_MODULE,
    network,
  };
}

/* ------------------------------------------------------------------ *
 * Cursors — the resume memory
 * ------------------------------------------------------------------ */

/**
 * Substreams disconnects routinely, and the contract is that the consumer
 * persists the cursor and resumes from it. A consumer that restarts from head
 * silently drops every block in the gap — for a liquidation guard that is the
 * failure the whole component exists to prevent.
 */
export interface StreamCursorStore {
  get(key: string): Promise<string | null>;
  set(key: string, cursor: string): Promise<void>;
}

export class MemoryCursorStore implements StreamCursorStore {
  private readonly cursors = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.cursors.get(key) ?? null;
  }
  async set(key: string, cursor: string): Promise<void> {
    this.cursors.set(key, cursor);
  }
}

const CURSOR_KEY = "__atlas_stream_cursors__";
type CursorGlobal = typeof globalThis & { [CURSOR_KEY]?: StreamCursorStore };

export function getCursorStore(): StreamCursorStore {
  const g = globalThis as CursorGlobal;
  g[CURSOR_KEY] ??= new MemoryCursorStore();
  return g[CURSOR_KEY];
}

/** Swap in a durable store (0G Storage, Redis) at boot. */
export function setCursorStore(store: StreamCursorStore): void {
  (globalThis as CursorGlobal)[CURSOR_KEY] = store;
}

/** Stable cursor key for one app on one target. */
export function cursorKeyOf(appId: string, target: StreamTarget): string {
  return `${appId}::${target.network}::${target.module}`;
}

/* ------------------------------------------------------------------ *
 * Ticks
 * ------------------------------------------------------------------ */

export interface StreamTick {
  /** Dedupe key: `<blockNumber>:<blockId>`. Handed to `TriggerSignal.id`. */
  id: string;
  blockNumber: number;
  blockId: string;
  /** Block time, not wall time. A replayed block keeps its own timestamp. */
  at: Date;
  /** Opaque resume token. Commit it before acting, not after. */
  cursor: string;
  /** True once the block is past the chain's final-block height. */
  final: boolean;
  /**
   * UNTRUSTED. The map module's decoded output, flattened. Compared, never
   * interpreted.
   */
  data: Record<string, unknown>;
}

/** A reorg. Emitted so the caller can journal it; never a trigger signal. */
export interface StreamUndo {
  kind: "undo";
  /** Everything after this block number is invalid. */
  lastValidBlock: number;
  cursor: string;
}

export type StreamEvent = ({ kind: "tick" } & StreamTick) | StreamUndo;

export interface StreamTicksOptions {
  target: StreamTarget;
  /** Resume from this cursor. Overrides the cursor store. */
  startCursor?: string | null;
  /** Absolute, or negative for "N blocks behind head". Ignored with a cursor. */
  startBlockNum?: number;
  /** `+N` stops N blocks after the start — how the verify harness terminates. */
  stopBlockNum?: number | `+${number}`;
  signal?: AbortSignal;
  /** Override the first-tick deadline. Defaults to `FIRST_TICK_TIMEOUT_MS`. */
  firstTickTimeoutMs?: number;
  /** Injectable for tests; defaults to `@substreams/core`'s fetch-based loader. */
  loadPackage?: (spkg: string) => Promise<Package>;
}

/**
 * Prototype-less flattening of a decoded protobuf message.
 *
 * `bigint` is stringified because block numbers and amounts arrive as bigint and
 * `JSON.stringify` throws on them — a journal write that throws would take the
 * whole trigger path down. Numeric comparison in `evaluateCondition` is
 * `typeof === "number"` only, so a stringified bigint deliberately does NOT
 * satisfy an ordering comparison: better a condition that refuses to fire than
 * one that fires on a coerced string.
 */
function plainify(value: unknown, depth = 0): unknown {
  if (depth > 6) return null;
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) {
    return `0x${Buffer.from(value).toString("hex")}`;
  }
  if (Array.isArray(value)) return value.map((v) => plainify(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      out[k] = plainify(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return Object.create(null) as Record<string, unknown>;
}

/**
 * A disconnect is normal operation, not a bug. Anything transport-shaped is
 * retryable; a bad token or a missing module is not, and retrying it just burns
 * the wait before the demo notices.
 */
export function isRetryableStreamError(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (
    message.includes("unauthenticated") ||
    message.includes("permission_denied") ||
    message.includes("invalid_argument") ||
    message.includes("not found") ||
    message.includes("token")
  ) {
    return false;
  }
  return (
    // A concurrency cap, not a broken request. The Graph Market's FREE tier
    // allows 2 concurrent streams, so two apps subscribing at once is enough to
    // hit this — and it clears on its own as soon as a slot frees. Classifying it
    // fatal meant a second mini app permanently refused to stream.
    message.includes("resource_exhausted") ||
    message.includes("concurrent stream limit") ||
    message.includes("unavailable") ||
    message.includes("internal") ||
    message.includes("deadline") ||
    message.includes("canceled") ||
    message.includes("cancelled") ||
    message.includes("socket") ||
    message.includes("econnreset") ||
    message.includes("stream closed") ||
    message.includes("aborted")
  );
}

/**
 * One subscription, one async iterable of events.
 *
 * Does NOT reconnect on its own — the caller owns that loop, because only the
 * caller knows whether it still wants the stream (an app that got halted should
 * not be silently resubscribed). `isRetryableStreamError` is the classifier for
 * that loop.
 */
export async function* streamEvents(options: StreamTicksOptions): AsyncGenerator<StreamEvent> {
  const token = process.env.SUBSTREAMS_API_TOKEN;
  if (!token) {
    throw new Error(
      "SUBSTREAMS_API_TOKEN is not set — no Substreams subscription is possible. " +
        "Get a JWT from thegraph.market → Create New Key → API TOKEN.",
    );
  }

  const { target } = options;
  const load = options.loadPackage ?? defaultLoadPackage;
  const pkg = await load(target.spkg);
  const registry = createRegistry(pkg);

  // The first-tick deadline is enforced by aborting the CALL, not by racing the
  // iterator: a Promise.race leaves the stream open and the process alive, which
  // is how a "timeout" turns into a hang that also leaks a socket.
  const deadline = new AbortController();
  const onOuterAbort = () => deadline.abort(options.signal?.reason);
  if (options.signal) {
    if (options.signal.aborted) deadline.abort(options.signal.reason);
    else options.signal.addEventListener("abort", onOuterAbort, { once: true });
  }
  const firstTickMs = options.firstTickTimeoutMs ?? FIRST_TICK_TIMEOUT_MS;
  let sawData = false;
  let timedOut = false;
  const firstTickTimer = setTimeout(() => {
    if (sawData) return;
    timedOut = true;
    deadline.abort(new Error("first-tick timeout"));
  }, firstTickMs);

  const transport = createConnectTransport({
    baseUrl: target.endpoint,
    httpVersion: "2",
    interceptors: [createAuthInterceptor(token)],
    useBinaryFormat: true,
    jsonOptions: { typeRegistry: registry },
  });

  const request = createRequest({
    substreamPackage: pkg,
    outputModule: target.module,
    productionMode: true,
    startCursor: options.startCursor ?? undefined,
    // With a cursor the server decides where to resume; startBlockNum is only
    // meaningful on a cold start.
    startBlockNum: options.startCursor ? undefined : options.startBlockNum,
    stopBlockNum: options.stopBlockNum,
  });

  try {
    yield* consume();
  } catch (err) {
    // Translate our own abort into a message that names the cause. Otherwise it
    // surfaces as a bare "canceled", which `isRetryableStreamError` classifies as
    // retryable — and retrying a stalled endpoint forever is the failure mode
    // this deadline exists to prevent.
    if (timedOut) {
      throw new Error(
        `substreams delivered no block within ${Math.round(firstTickMs / 1000)}s ` +
          `(${target.module} @ ${target.endpoint}). The connection was accepted, so the token is ` +
          `valid; the module is either backprocessing or the request is queued. ` +
          `Retry, or start closer to head with a smaller --behind.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(firstTickTimer);
    options.signal?.removeEventListener("abort", onOuterAbort);
  }

  async function* consume(): AsyncGenerator<StreamEvent> {
  for await (const response of streamBlocks(transport, request, { signal: deadline.signal })) {
    const message = response.message;

    if (message.case === "fatalError") {
      // Name the module. A fatal error with no module attribution is the kind of
      // message you burn twenty minutes on at 3am.
      const { module: failedModule, reason, logs } = message.value;
      const tail = logs.length > 0 ? ` — last log: ${logs[logs.length - 1]}` : "";
      throw new Error(
        `substreams fatal error in module "${failedModule || target.module}": ${reason || "(no reason given)"}${tail}`,
      );
    }

    if (message.case === "blockUndoSignal") {
      yield {
        kind: "undo",
        lastValidBlock: Number(message.value.lastValidBlock?.number ?? 0n),
        cursor: message.value.lastValidCursor,
      };
      continue;
    }

    if (message.case !== "blockScopedData") continue; // session, progress, debug

    const data = message.value;
    const clock = data.clock;
    if (!clock) continue; // a data message with no clock has no identity to dedupe on

    // Data is flowing; the first-tick deadline has done its job.
    sawData = true;

    const decoded = unpackMapOutput(response, registry);
    // An empty output is the normal case for most blocks: the module matched
    // nothing. Still a tick — the caller re-reads position per block and the
    // condition decides.
    const payload = decoded ? asRecord(plainify(decoded.toJson({ typeRegistry: registry }))) : {};

    const blockNumber = Number(clock.number);
    const at = clock.timestamp ? clock.timestamp.toDate() : new Date();

    yield {
      kind: "tick",
      id: `${blockNumber}:${clock.id}`,
      blockNumber,
      blockId: clock.id,
      at,
      cursor: data.cursor,
      final: blockNumber <= Number(data.finalBlockHeight),
      data: payload,
    };
  }
  }
}

async function defaultLoadPackage(spkg: string): Promise<Package> {
  // Imported lazily so a test that injects `loadPackage` never touches the net.
  const { fetchSubstream } = await import("@substreams/core");
  return fetchSubstream(spkg);
}

/** Ticks only, for callers that have no reorg handling of their own. */
export async function* streamTicks(options: StreamTicksOptions): AsyncGenerator<StreamTick> {
  for await (const event of streamEvents(options)) {
    // The tick variant is `{ kind: "tick" } & StreamTick`, so it already is one.
    if (event.kind === "tick") yield event;
  }
}
