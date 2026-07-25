/**
 * The substreams.dev registry is proto3 JSON: default-valued and absent fields
 * do not appear at all. Every trap below is documented upstream and every one
 * of them would otherwise surface as "this protocol has no coverage" — which is
 * the exact claim this module exists to make truthfully.
 */
import { assert, assertEqual, assertRejects, describe, itAsync } from "../agency/harness.test";
import { RegistryRateLimitError, searchPackages } from "./registry";

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
});
