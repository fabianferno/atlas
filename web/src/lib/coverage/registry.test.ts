/**
 * The substreams.dev registry is proto3 JSON: default-valued and absent fields
 * do not appear at all. Every trap below is documented upstream and every one
 * of them would otherwise surface as "this protocol has no coverage" — which is
 * the exact claim this module exists to make truthfully.
 */
import { assert, assertEqual, assertRejects, describe, it, itAsync } from "@/lib/kit/testing";
import { RegistryRateLimitError, searchPackages, searchTermFor } from "./registry";

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("registry search", () => {
  itAsync("treats a bare {} as zero results, not a crash", async () => {
    const result = await searchPackages({ query: "nothing", fetchImpl: async () => jsonResponse({}) });
    assertEqual(result.packages.length, 0, "zero results");
    assertEqual(result.hasMore, false, "no more pages");
  });

  itAsync("treats an absent hasMore as done", async () => {
    const result = await searchPackages({
      query: "uniswap",
      fetchImpl: async () =>
        jsonResponse({ packages: [{ name: "uniswap_v3", slug: "uniswap-v3", reference: "uniswap-v3@v0.1.0", spkg: "https://spkg.io/v1/packages/uniswap-v3/v0.1.0" }] }),
    });
    assertEqual(result.hasMore, false, "missing hasMore means done");
    assertEqual(result.packages.length, 1, "one package");
  });

  itAsync("nulls omitted fields rather than inventing empty strings", async () => {
    const result = await searchPackages({
      query: "ethereum-common",
      fetchImpl: async () =>
        jsonResponse({ packages: [{ name: "ethereum_common", slug: "ethereum-common", reference: "ethereum-common@v0.3.3", spkg: "https://spkg.io/v1/packages/ethereum-common/v0.3.3" }] }),
    });
    const pkg = result.packages[0];
    assertEqual(pkg.network, null, "network omitted upstream");
    assertEqual(pkg.organization, null, "organization omitted upstream");
    assertEqual(pkg.downloads, 0, "downloads omitted means zero");
  });

  itAsync("surfaces a 429 as a typed error carrying Retry-After", async () => {
    await assertRejects(
      () =>
        searchPackages({
          query: "aave",
          fetchImpl: async () => jsonResponse({}, { status: 429, headers: { "retry-after": "12" } }),
        }),
      "429 must reject",
    );
    try {
      await searchPackages({
        query: "aave",
        fetchImpl: async () => jsonResponse({}, { status: 429, headers: { "retry-after": "12" } }),
      });
    } catch (err) {
      assert(err instanceof RegistryRateLimitError, "typed rate-limit error");
      assertEqual((err as RegistryRateLimitError).retryAfterSec, 12, "Retry-After honored");
    }
  });

  itAsync("sends the query and page size the API documents", async () => {
    let seen = "";
    await searchPackages({
      query: "hyperliquid",
      pageSize: 5,
      fetchImpl: async (url) => {
        seen = String(url);
        return jsonResponse({});
      },
    });
    assert(seen.includes("query=hyperliquid"), `query param present: ${seen}`);
    assert(seen.includes("page_size=5"), `page_size param present: ${seen}`);
  });

  // Rows that arrive and cannot be read are the failure mode this module exists
  // to prevent: dropped silently, they look exactly like "this protocol has no
  // coverage", and that answer is what pays for building a pipeline.
  itAsync("counts rows that arrived but could not be parsed", async () => {
    const result = await searchPackages({
      query: "aave",
      fetchImpl: async () =>
        jsonResponse({
          packages: [
            { package_name: "aave_v3", artifact: "https://spkg.io/v1/packages/aave-v3/v0.1.0" },
            { name: "aave_v2" },
            { name: "aave_v3", slug: "aave-v3", reference: "aave-v3@v0.1.0", spkg: "https://spkg.io/v1/packages/aave-v3/v0.1.0" },
          ],
        }),
    });
    assertEqual(result.packages.length, 1, "only the well-formed row is usable");
    assertEqual(result.unusable, 2, "the other two are counted, not forgotten");
  });

  itAsync("reports zero unusable rows when everything parsed", async () => {
    const result = await searchPackages({ query: "nothing", fetchImpl: async () => jsonResponse({}) });
    assertEqual(result.unusable, 0, "no rows, nothing unreadable");
  });

  // A hang is not a caught rejection. Without a deadline the caller sits there
  // producing neither a verdict nor a stated failure, which is the one outcome
  // worse than either.
  itAsync("rejects rather than hanging when the registry never answers", async () => {
    const hang: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("This operation was aborted")));
      });
    let message = "";
    try {
      await searchPackages({ query: "aave", fetchImpl: hang, timeoutMs: 20 });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    assert(message.includes("timed out"), `names the deadline rather than a bare abort: ${message}`);
  });

  itAsync("still honors a caller's own abort signal", async () => {
    const controller = new AbortController();
    const hang: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("caller cancelled")));
      });
    const pending = searchPackages({ query: "aave", fetchImpl: hang, timeoutMs: 5_000, signal: controller.signal });
    controller.abort();
    await assertRejects(() => pending, "an outer abort must still cancel the fetch");
  });
});

/**
 * The search ANDs its terms against the package NAME — verified live:
 * `query=uniswap` returns three packages and `query=uniswap+swaps` returns `{}`.
 * So every word of a question that is not the name can only subtract, and the
 * failure it produces is a false absence, which is the answer that costs money
 * later.
 */
describe("registry search term", () => {
  it("drops filler and network names", () => {
    const q = searchTermFor("Hyperliquid vault flows on Arbitrum");
    assertEqual(q.term, "hyperliquid", "the protocol, not the sentence");
    assert(q.dropped.includes("arbitrum"), `drops the chain: ${q.dropped.join(",")}`);
    assert(q.dropped.includes("flows"), `drops what we want to know about it: ${q.dropped.join(",")}`);
  });

  it("sends one word, never a phrase", () => {
    const q = searchTermFor("compare lending borrowing staking restaking yields");
    assert(!q.term.includes(" "), `a phrase matches nothing however much is published: ${q.term}`);
  });

  // A name is what someone capitalized mid-sentence. The first word is
  // capitalized by grammar, and ALL-CAPS is an acronym.
  it("prefers a name the asker capitalized over sentence position", () => {
    assertEqual(searchTermFor("Show me the top Aave markets").term, "aave", "picks the name, not the first survivor");
    assertEqual(searchTermFor("What is the TVL of Uniswap?").term, "uniswap", "an acronym is not a name");
    assertEqual(searchTermFor("vault flows on Hyperliquid").term, "hyperliquid", "wherever in the sentence it sits");
  });

  // A guessed term is weaker evidence in both directions, and the caller has to
  // be able to tell a guess from an identified name.
  it("flags a term picked by position rather than identified", () => {
    assert(searchTermFor("Hyperliquid vault flows on Arbitrum").broad, "sentence-initial caps prove nothing");
    assert(!searchTermFor("flows on Hyperliquid").broad, "a mid-sentence capital does");
  });

  it("falls back to the whole phrase when nothing distinctive survives", () => {
    const q = searchTermFor("how much of it is on base");
    assertEqual(q.term, "how much of it is on base", "sends what it was given rather than nothing");
    assert(q.broad, "and says the result proves little");
  });
});
