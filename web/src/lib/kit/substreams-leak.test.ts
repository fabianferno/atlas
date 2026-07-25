/**
 * A verify run that finishes must release its session.
 *
 * The FREE tier allows two concurrent Substreams sessions. A run that holds its
 * session after the consumer has stopped reading does not fail loudly — it
 * silently spends one of the two slots until the process is killed, and the
 * failure lands on whoever streams next. That is why this is a test and not a
 * comment.
 */
import { Binary, Module, Modules, Package } from "@substreams/core/proto";
import { assert, describe, itAsync } from "../agency/harness.test";
import { streamEvents, type StreamTarget } from "./substreams";

const TARGET: StreamTarget = {
  endpoint: "https://arb-one.streamingfast.io",
  spkg: "https://spkg.io/streamingfast/ethereum-explorer-v0.1.2.spkg",
  module: "map_block_meta",
  network: "arbitrum-one",
};

/**
 * The smallest package `createRegistry` and `createRequest` both accept.
 * `protoFiles: []` matters — `topoSort` iterates it and throws on undefined —
 * and the module needs a binary index that resolves, because `createRequest`
 * walks the real module graph. Verified against @substreams/core 0.17.
 */
function fakePackage(): Package {
  return new Package({
    protoFiles: [],
    modules: new Modules({
      binaries: [new Binary({ type: "wasm/rust-v1", content: new Uint8Array() })],
      modules: [
        new Module({
          name: "map_block_meta",
          binaryIndex: 0,
          binaryEntrypoint: "map_block_meta",
          initialBlock: 0n,
          kind: { case: "kindMap", value: { outputType: "proto:test.v1.Out" } },
          inputs: [{ input: { case: "source", value: { type: "sf.ethereum.type.v2.Block" } } }],
          output: { type: "proto:test.v1.Out" },
        }),
      ],
    }),
  });
}

/** A response sequence shaped like the real one: a session, then data forever. */
function fakeResponses() {
  let n = 0;
  return {
    async *[Symbol.asyncIterator]() {
      while (true) {
        n += 1;
        yield {
          message: {
            case: "blockScopedData" as const,
            value: {
              clock: { number: BigInt(1000 + n), id: `hash${n}`, timestamp: undefined },
              cursor: `cursor${n}`,
              finalBlockHeight: BigInt(900),
            },
          },
        };
      }
    },
  };
}

describe("substreams session lifetime", () => {
  itAsync("aborts the call when the consumer stops reading", async () => {
    process.env.SUBSTREAMS_API_TOKEN ??= "test-token";
    let captured: AbortSignal | undefined;

    const events = streamEvents({
      target: TARGET,
      loadPackage: async () => fakePackage(),
      streamBlocksImpl: (_transport, _request, opts) => {
        captured = opts?.signal;
        return fakeResponses() as never;
      },
    });

    // Consume exactly one event, then walk away — the maxTicks case.
    for await (const _event of events) break;

    assert(captured !== undefined, "the call received a signal");
    assert(captured!.aborted, "the session is aborted once the consumer stops reading");
  });
});
