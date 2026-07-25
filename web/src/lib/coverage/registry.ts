/**
 * SUBSTREAMS.DEV REGISTRY SEARCH.
 *
 * Before this system offers to spend four minutes building an indexing pipeline,
 * it has to be sure one does not already exist. That check is a single public,
 * unauthenticated GET — and getting its parsing wrong is worse than not checking
 * at all, because a mis-parsed response reads as "no coverage" and sends the
 * agent off to rebuild something that was already published.
 *
 * Three parsing rules, all documented upstream, all load-bearing:
 *
 *   1. Zero results is `{}`. Not `{"packages": []}`. A naive `body.packages.length`
 *      throws on the single most common response this module will ever see.
 *   2. `hasMore` is ABSENT when there are no more pages, never `false`.
 *   3. Omitted means absent, not empty. `ethereum-common` ships no `network`
 *      field at all. Defaulting it to `""` would make it look like a package
 *      that declared an empty network.
 *
 * The API is rate-limited per IP and answers 429 with `Retry-After`. That is a
 * typed error here rather than an empty result, because "slow down" and "nothing
 * exists" must never collapse into the same value.
 */

export const REGISTRY_URL = "https://substreams.dev/v1/registry/packages";

/** One published package. Fields the upstream API may omit are nullable. */
export interface RegistryPackage {
  name: string;
  slug: string;
  /** `uniswap-v3@v0.1.0` — the human-quotable form. */
  reference: string;
  /** Fetchable `.spkg` URL. This is what a manifest's `data.stream` needs. */
  spkg: string;
  latestVersion: string | null;
  network: string | null;
  organization: string | null;
  downloads: number;
}

export interface RegistrySearch {
  packages: RegistryPackage[];
  hasMore: boolean;
}

export class RegistryRateLimitError extends Error {
  constructor(readonly retryAfterSec: number) {
    super(`substreams.dev registry rate-limited; retry after ${retryAfterSec}s`);
    this.name = "RegistryRateLimitError";
  }
}

export interface SearchOptions {
  query: string;
  network?: string;
  pageSize?: number;
  /** Injectable for tests. Production uses global fetch. */
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function packageFrom(raw: unknown): RegistryPackage | null {
  if (raw === null || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const name = str(row.name);
  const spkg = str(row.spkg);
  // A package with no name or no fetchable artifact cannot be consumed, so it is
  // not a candidate — dropping it is more honest than surfacing a broken row.
  if (!name || !spkg) return null;

  const org = row.organization;
  const orgSlug =
    org !== null && typeof org === "object" ? str((org as Record<string, unknown>).slug) : null;

  return {
    name,
    slug: str(row.slug) ?? name,
    reference: str(row.reference) ?? name,
    spkg,
    latestVersion: str(row.latestVersion),
    network: str(row.network),
    organization: orgSlug,
    downloads: typeof row.downloads === "number" ? row.downloads : 0,
  };
}

/**
 * Search the registry. Never throws on "nothing found" — that is a legitimate,
 * expected answer and the whole reason this module exists.
 */
export async function searchPackages(options: SearchOptions): Promise<RegistrySearch> {
  const doFetch = options.fetchImpl ?? fetch;
  const url = new URL(REGISTRY_URL);
  url.searchParams.set("query", options.query);
  url.searchParams.set("page_size", String(options.pageSize ?? 24));
  if (options.network) url.searchParams.set("network", options.network);

  const response = await doFetch(url.toString(), { signal: options.signal });

  if (response.status === 429) {
    const header = response.headers.get("retry-after");
    const parsed = Number.parseInt(header ?? "", 10);
    throw new RegistryRateLimitError(Number.isFinite(parsed) ? parsed : 30);
  }
  if (!response.ok) {
    throw new Error(`substreams.dev registry returned ${response.status} ${response.statusText}`);
  }

  const body: unknown = await response.json();
  const root = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rawPackages = Array.isArray(root.packages) ? root.packages : [];

  return {
    packages: rawPackages.map(packageFrom).filter((p): p is RegistryPackage => p !== null),
    // Absent means done. Only an explicit `true` continues.
    hasMore: root.hasMore === true,
  };
}
