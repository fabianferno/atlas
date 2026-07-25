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
 * exists" must never collapse into the same value. For the same reason the call
 * is time-bounded: a hung endpoint is not a caught rejection, so without a
 * deadline it would hold an MCP request open until the platform killed it and
 * produce no verdict at all — neither a proven absence nor a stated failure.
 */

export const REGISTRY_URL = "https://substreams.dev/v1/registry/packages";

/** Long enough for a cold public endpoint, short enough that a hang is still an
 *  answer ("lookup failed") rather than a dead request. */
export const DEFAULT_REGISTRY_TIMEOUT_MS = 8_000;

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
  /**
   * Rows that arrived and could not be parsed into a usable package. Exposed
   * rather than swallowed because the two ways to end up with zero packages are
   * not the same fact: "the API said there are none" is a proven absence, while
   * "every row it sent was unreadable" means our parser and the API disagree
   * about the shape and we know nothing. Only the first may be reported as
   * absence.
   */
  unusable: number;
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
  /** Defaults to `DEFAULT_REGISTRY_TIMEOUT_MS`. Zero or negative disables it. */
  timeoutMs?: number;
}

/* ── query narrowing ─────────────────────────────────────────────────────── */

/**
 * `query` is effectively a package-name search. Handing it a whole sentence —
 * `Hyperliquid vault flows on Arbitrum` — can only ever return fewer matches
 * than the protocol name alone, and a false absence is what sends a later phase
 * off to build an indexing pipeline nobody needed. So the sentence is narrowed
 * before it is sent.
 *
 * The lists below are deliberately dumb and closed: question filler and chain
 * names. Anything cleverer (stemming, entity extraction, an LLM) would make the
 * term unpredictable, and an unpredictable query is one nobody can reproduce
 * when the verdict is disputed. The words removed are reported, not discarded,
 * for the same reason.
 */
const FILLER = new Set([
  "about", "across", "all", "and", "any", "are", "been", "best", "between", "biggest",
  "both", "but", "can", "compare", "could", "current", "currently", "day", "days", "does",
  "doing", "during", "each", "find", "for", "from", "get", "give", "has", "have", "her",
  "here", "high", "highest", "hour", "hours", "how", "its", "largest", "last", "latest",
  "list", "long", "low", "lowest", "many", "month", "months", "most", "much", "new", "now",
  "old", "only", "our", "out", "over", "past", "per", "please", "recent", "recently",
  "right", "same", "show", "since", "small", "smallest", "some", "than", "that", "the",
  "their", "them", "then", "there", "these", "they", "this", "those", "time", "today",
  "top", "use", "using", "versus", "via", "want", "was", "week", "weeks", "were", "what",
  "when", "where", "which", "who", "why", "will", "with", "within", "worst", "would",
  "year", "years", "yesterday", "you", "your",
]);

/**
 * Chain names, not schema words. Kept as a literal list rather than derived from
 * `contracts/manifest` on purpose: this module is a standalone client for a
 * public API and importing the app's type graph into it would make a search-term
 * change a manifest change. The aliases matter more than the canonical ids —
 * people write "arb", not "arbitrum-one".
 */
const NETWORK_WORDS = new Set([
  "arbitrum", "avalanche", "avax", "base", "binance", "blast", "bnb", "bsc", "celo",
  "chain", "chains", "ethereum", "fantom", "gnosis", "goerli", "layer", "linea",
  "mainnet", "matic", "network", "networks", "one", "optimism", "polygon", "scroll",
  "sepolia", "testnet", "zksync",
]);

export interface RegistryQuery {
  /** The single word actually sent to the API. */
  term: string;
  /** Words not sent, in the order they appeared. Makes the narrowing auditable. */
  dropped: string[];
  /**
   * True when `term` was picked positionally rather than identified — no word in
   * the question announced itself as a name. A zero result for a term like that
   * is weaker evidence of absence than it looks, and a hit is weaker evidence of
   * a match, so the caller has to be able to say which it got.
   */
  broad: boolean;
}

/**
 * One word, verified against the live API: `query=uniswap` returns three
 * packages, `query=uniswap+swaps` returns `{}` — the terms are ANDed against the
 * package NAME, and published packages are named `uniswap-database-changes-…`,
 * not after what you want to know about them. So every extra word can only
 * subtract, and two words is already enough to make a covered protocol look
 * uncovered.
 *
 * Which word: a protocol name is usually the one the asker capitalized
 * mid-sentence — "vault flows on Hyperliquid". The first word of a question is
 * capitalized by grammar rather than by meaning, so its case says nothing and is
 * ignored; ALL-CAPS is an acronym (TVL, APR, USD), not a name. When no word
 * announces itself that way we take the first surviving one, which is right far
 * more often than not ("Hyperliquid vault flows…", "aave lending markets") — and
 * flag that we guessed.
 */
export function searchTermFor(question: string): RegistryQuery {
  const words = question.match(/[A-Za-z0-9][A-Za-z0-9-]*/g) ?? [];
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const [index, word] of words.entries()) {
    const lower = word.toLowerCase();
    // Two letters or fewer, or a bare number, cannot narrow a name search — and
    // "5" or "of" as a query term is how you get an empty result for a protocol
    // that is right there in the registry.
    const useless = lower.length <= 2 || /^[0-9]+$/.test(lower);
    if (useless || FILLER.has(lower) || NETWORK_WORDS.has(lower)) dropped.push(lower);
    // Position is carried so the grammar-capitalized first word can be told from
    // a name someone capitalized on purpose.
    else kept.push(index === 0 ? lower : word);
  }

  if (kept.length === 0) {
    // Nothing distinctive survived. Sending the original phrase is the least-bad
    // option — it is what we would have sent anyway — but it is flagged, because
    // "no package matches this whole sentence" proves nothing at all.
    return { term: question.trim(), dropped, broad: true };
  }

  const named = kept.findIndex((word) => /^[A-Z]/.test(word) && word !== word.toUpperCase());
  const chosen = named >= 0 ? named : 0;
  return {
    term: kept[chosen].toLowerCase(),
    dropped: [...dropped, ...kept.filter((_, i) => i !== chosen).map((w) => w.toLowerCase())],
    broad: named < 0,
  };
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
  // The caller still counts what was dropped (`RegistrySearch.unusable`): a row
  // that failed to parse is silence, not absence.
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
 * expected answer and the whole reason this module exists. It does throw when
 * the lookup itself did not complete, including on timeout, so a caller can
 * tell "there is no package" from "we never found out".
 */
export async function searchPackages(options: SearchOptions): Promise<RegistrySearch> {
  const doFetch = options.fetchImpl ?? fetch;
  const url = new URL(REGISTRY_URL);
  url.searchParams.set("query", options.query);
  url.searchParams.set("page_size", String(options.pageSize ?? 24));
  if (options.network) url.searchParams.set("network", options.network);

  const timeoutMs = options.timeoutMs ?? DEFAULT_REGISTRY_TIMEOUT_MS;
  // Composed by hand rather than with `AbortSignal.timeout` because the caller
  // may already have its own signal (an MCP request being torn down), and both
  // have to be able to cancel the same fetch. `AbortSignal.any` is newer than
  // some of our runtime targets; a controller and two listeners are not.
  const controller = new AbortController();
  let timedOut = false;
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort(new Error(`substreams.dev registry timed out after ${timeoutMs}ms`));
        }, timeoutMs)
      : undefined;
  const outer = options.signal;
  const onOuterAbort = () => controller.abort(outer?.reason);
  if (outer) {
    if (outer.aborted) controller.abort(outer.reason);
    else outer.addEventListener("abort", onOuterAbort, { once: true });
  }

  try {
    const response = await doFetch(url.toString(), { signal: controller.signal });

    if (response.status === 429) {
      const header = response.headers.get("retry-after");
      const parsed = Number.parseInt(header ?? "", 10);
      throw new RegistryRateLimitError(Number.isFinite(parsed) ? parsed : 30);
    }
    if (!response.ok) {
      throw new Error(`substreams.dev registry returned ${response.status} ${response.statusText}`);
    }

    // Reading the body is inside the deadline too: a response whose headers
    // arrive and whose body never does hangs exactly as hard as no response.
    const body: unknown = await response.json();
    const root = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const rawPackages = Array.isArray(root.packages) ? root.packages : [];
    const parsedRows = rawPackages.map(packageFrom);
    const packages = parsedRows.filter((p): p is RegistryPackage => p !== null);

    return {
      packages,
      // Absent means done. Only an explicit `true` continues.
      hasMore: root.hasMore === true,
      unusable: parsedRows.length - packages.length,
    };
  } catch (err) {
    // An abort surfaces as a bare "This operation was aborted", which reads like
    // the caller cancelled. Name the deadline instead, so the failure the caller
    // reports is the failure that happened.
    if (timedOut) throw new Error(`substreams.dev registry timed out after ${timeoutMs}ms`);
    throw err;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    outer?.removeEventListener("abort", onOuterAbort);
  }
}
