/**
 * The registry is the source of truth for which names are published.
 *
 * This file exists because the Registry page previously carried a literal list
 * of five labels while the contract held nine entries and the deployments file
 * held eight. Three records of one onchain fact, all different. The paging and
 * parent-filter logic below is the replacement, so it is tested rather than
 * trusted.
 */
import { assert, assertEqual, describe, it, itAsync } from "@/lib/kit/testing";
import {
  listRegisteredApps,
  selectUnderParent,
  type RawAppRecord,
  type RegisteredApp,
  type RegistryReader,
} from "./published";

/** One raw tuple as viem decodes it, with every field a plausible value. */
function raw(ensName: string, tokenId: bigint, over: Partial<RawAppRecord> = {}): RawAppRecord {
  return {
    ensName,
    manifestCID: "bafkreiagp25njrnk42kixxjo4tctw6v2go23dmo6lzwihg7sfcsiv4opxu",
    attestationHash: `0x${"00".repeat(32)}`,
    ensNode: `0x${"11".repeat(32)}`,
    author: "0x5a09e3eC3EFDD91205Cbb097142a4f4dCEFc7f02",
    tokenId,
    forkedFrom: `0x${"00".repeat(32)}`,
    appVersion: "1.0.0",
    registeredAt: 1753500000n,
    updatedAt: 1753500000n,
    revision: 1,
    ...over,
  } as RawAppRecord;
}

/** A reader over a fixed array, recording how it was paged. */
function readerOver(rows: RawAppRecord[]) {
  const calls: Array<{ offset: bigint; limit: bigint }> = [];
  const reader: RegistryReader = {
    totalApps: async () => BigInt(rows.length),
    page: async (offset, limit) => {
      calls.push({ offset, limit });
      return rows.slice(Number(offset), Number(offset) + Number(limit));
    },
  };
  return { reader, calls };
}

describe("listRegisteredApps", () => {
  itAsync("returns every entry for a registry smaller than one page", async () => {
    const { reader, calls } = readerOver([raw("a.atlas-apps.eth", 1n), raw("b.atlas-apps.eth", 2n)]);
    const apps = await listRegisteredApps(reader);
    assertEqual(apps.length, 2, "both rows");
    assertEqual(apps[0].ensName, "a.atlas-apps.eth", "registry order preserved");
    assertEqual(calls.length, 1, "one page call");
  });

  itAsync("pages through a registry larger than the page size", async () => {
    const rows = Array.from({ length: 120 }, (_, i) => raw(`app${i}.atlas-apps.eth`, BigInt(i)));
    const { reader, calls } = readerOver(rows);
    const apps = await listRegisteredApps(reader);
    assertEqual(apps.length, 120, "every row");
    assertEqual(calls.length, 3, "50 + 50 + 20");
    assertEqual(apps[119].ensName, "app119.atlas-apps.eth", "last row is the last row");
  });

  itAsync("returns an empty list for an empty registry without paging", async () => {
    const { reader, calls } = readerOver([]);
    const apps = await listRegisteredApps(reader);
    assertEqual(apps.length, 0, "no rows");
    assertEqual(calls.length, 0, "nothing to ask for");
  });

  itAsync("stops when a page comes back short rather than looping forever", async () => {
    // A node that truncates a response must not spin this into an infinite
    // loop: `totalApps` says 10, the page returns 2 and then nothing.
    let served = 0;
    const reader: RegistryReader = {
      totalApps: async () => 10n,
      page: async () => {
        served += 1;
        return served === 1 ? [raw("a.atlas-apps.eth", 1n), raw("b.atlas-apps.eth", 2n)] : [];
      },
    };
    const apps = await listRegisteredApps(reader);
    assertEqual(apps.length, 2, "what the node actually served");
    assertEqual(served, 2, "one more call, then it gives up");
  });

  itAsync("normalises bigints and the zero forkedFrom", async () => {
    const zero = `0x${"00".repeat(32)}`;
    const parent = `0x${"ab".repeat(32)}`;
    const { reader } = readerOver([
      raw("original.atlas-apps.eth", 10n),
      raw("fork.atlas-apps.eth", 11n, { forkedFrom: parent as `0x${string}` }),
    ]);
    const apps = await listRegisteredApps(reader);
    assertEqual(apps[0].tokenId, 10, "tokenId is a number");
    assertEqual(apps[0].registeredAt, 1753500000, "timestamp is a number");
    assertEqual(apps[0].forkedFrom, null, "a zero parent is an original, not a hash");
    assertEqual(apps[1].forkedFrom, parent, "a real parent survives");
    assert(zero !== apps[1].forkedFrom, "and is not the zero word");
  });
});

describe("selectUnderParent", () => {
  it("keeps only names under the given parent and counts the rest", () => {
    const list = [
      raw("aave-health-guard.graphminis.eth", 5n),
      raw("atlas-market-guard.atlas-apps.eth", 10n),
      raw("rebalance-arbitrum-dex.atlas-apps.eth", 11n),
    ].map(toApp);
    const out = selectUnderParent(list, "atlas-apps.eth");
    assertEqual(out.apps.length, 2, "two under the current parent");
    assertEqual(out.total, 3, "the denominator is the whole registry");
    assertEqual(out.retired, 1, "and the difference is reported, not hidden");
  });

  it("matches on the label boundary, not on a bare suffix", () => {
    // "notatlas-apps.eth" ends with "atlas-apps.eth" as a string. It is a
    // different name and must not be counted as ours.
    const list = [raw("evil.notatlas-apps.eth", 1n), raw("good.atlas-apps.eth", 2n)].map(toApp);
    const out = selectUnderParent(list, "atlas-apps.eth");
    assertEqual(out.apps.length, 1, "only the real subname");
    assertEqual(out.apps[0].ensName, "good.atlas-apps.eth", "the right one");
  });

  it("excludes the parent itself", () => {
    const list = [raw("atlas-apps.eth", 1n)].map(toApp);
    assertEqual(selectUnderParent(list, "atlas-apps.eth").apps.length, 0, "the parent is not a mini app");
  });

  it("compares case-insensitively", () => {
    const list = [raw("Atlas-Market-Guard.ATLAS-APPS.eth", 10n)].map(toApp);
    assertEqual(selectUnderParent(list, "atlas-apps.eth").apps.length, 1, "casing is not identity");
  });

  it("reports every entry as retired when the parent matches nothing", () => {
    const list = [raw("a.graphminis.eth", 1n), raw("b.graphminis.eth", 2n)].map(toApp);
    const out = selectUnderParent(list, "atlas-apps.eth");
    assertEqual(out.apps.length, 0, "nothing under this parent");
    assertEqual(out.retired, 2, "both counted as elsewhere");
  });
});

/** Raw tuple → the normalised shape, so the filter tests read like the route. */
function toApp(r: RawAppRecord): RegisteredApp {
  return {
    ensName: r.ensName,
    manifestCid: r.manifestCID,
    tokenId: Number(r.tokenId),
    author: r.author,
    appVersion: r.appVersion,
    ensNode: r.ensNode,
    forkedFrom: null,
    registeredAt: Number(r.registeredAt),
    updatedAt: Number(r.updatedAt),
    revision: r.revision,
  };
}
