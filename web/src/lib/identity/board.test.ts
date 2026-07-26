/**
 * The join, and the four ways it can fail to produce a runnable app.
 *
 * `assembleBoard` is the only place a registry record becomes something the
 * board renders, so it is the only place that can quietly invent one. Each
 * test below pins a condition under which it must refuse to.
 */
import { assert, assertEqual, describe, itAsync } from "@/lib/kit/testing";
import { assembleBoard, type ResolveFn } from "@/lib/identity/board";
import type { RegisteredApp } from "@/lib/identity/published";
import type { ResolveReport } from "@/lib/identity/publish";
import type { Manifest } from "@/lib/contracts/manifest";

const RECORD: RegisteredApp = {
  ensName: "atlas-market-guard.atlas-apps.eth",
  manifestCid: "bafkreiaaa",
  tokenId: 10,
  author: "0x1111111111111111111111111111111111111111",
  appVersion: "1.0.0",
  ensNode: "0xabc",
  forkedFrom: null,
  registeredAt: 1_753_000_000,
  updatedAt: 1_753_000_000,
  revision: 1,
};

const MANIFEST = { name: "atlas-market-guard", title: "Guard" } as unknown as Manifest;

function report(over: Partial<ResolveReport>): ResolveReport {
  return {
    name: RECORD.ensName,
    manifest: MANIFEST,
    manifestCid: RECORD.manifestCid,
    address: "0x2222222222222222222222222222222222222222",
    agentContext: null,
    endpoints: { web: null, mcp: null, a2a: null },
    agenticId: [],
    verification: {
      ensAssertsToken: true,
      registryAssertsName: true,
      tokenAssertsName: true,
      mutuallyVerified: true,
      owner: "0x1111111111111111111111111111111111111111",
      checked: true,
    },
    texts: {},
    source: "contenthash",
    ...over,
  };
}

const resolving = (r: ResolveReport): ResolveFn => async () => r;

describe("assembleBoard", () => {
  itAsync("returns a runnable entry when the name resolves and the CIDs agree", async () => {
    const [entry] = await assembleBoard([RECORD], resolving(report({})));
    assertEqual(entry.unavailable, null, "a fully resolved entry is available");
    assert(entry.manifest !== null, "the manifest is carried through");
    assertEqual(entry.mutuallyVerified, true, "verification is read off the report");
    assertEqual(entry.registered.ensName, RECORD.ensName, "the record is preserved verbatim");
  });

  itAsync("refuses the entry when the resolve throws", async () => {
    const fn: ResolveFn = async () => {
      throw new Error("RPC down");
    };
    const [entry] = await assembleBoard([RECORD], fn);
    assertEqual(entry.manifest, null, "no manifest survives a failed resolve");
    assert(
      entry.unavailable !== null && entry.unavailable.includes("RPC down"),
      "the resolver's own message is carried, not a paraphrase",
    );
  });

  itAsync("refuses the entry when the manifest could not be fetched", async () => {
    const [entry] = await assembleBoard([RECORD], resolving(report({ manifest: null })));
    assertEqual(entry.manifest, null, "a null manifest stays null");
    assert(
      entry.unavailable !== null && entry.unavailable.includes(RECORD.manifestCid),
      "the unfetchable CID is named",
    );
  });

  itAsync("refuses the entry when contenthash disagrees with the registry", async () => {
    const [entry] = await assembleBoard(
      [RECORD],
      resolving(report({ manifestCid: "bafkreiZZZ_different" })),
    );
    assertEqual(
      entry.manifest,
      null,
      "a manifest the registry does not vouch for is not rendered, even though it fetched",
    );
    assert(
      entry.unavailable !== null &&
        entry.unavailable.includes("bafkreiZZZ_different") &&
        entry.unavailable.includes(RECORD.manifestCid),
      "both CIDs are named so the disagreement is legible",
    );
  });

  itAsync("never drops a record — an unavailable app is still on the board", async () => {
    const entries = await assembleBoard(
      [RECORD, { ...RECORD, ensName: "b.atlas-apps.eth", tokenId: 11 }],
      resolving(report({ manifest: null })),
    );
    assertEqual(entries.length, 2, "both records come back, both disclosed");
  });
});
