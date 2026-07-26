# Published names, read off the registry instead of a literal

Date: 2026-07-26
Status: approved, not yet implemented

## The problem

`web/src/components/registry/published-strip.tsx` renders the "Published names"
section of the Registry page. Every value in a row is read live from
`GET /api/resolve/<label>`, but *which* labels appear comes from a constant in
the file:

```ts
const PUBLISHED_LABELS = [
  "atlas-market-guard",
  "durable-market-guard",
  "attested-market-guard",
  "wallet-bound-guard",
  "aave-health-guard",
] as const;
```

The file's own doc comment defends this — "which subnames were issued under
`atlas-apps.eth` is a fact about the parent name, not data." That is wrong in
practice. The list had already drifted from every other record of the same fact:

- `contracts/deployments/ens-sepolia.json` records **8** names issued under the
  parent. The strip shows 5, omitting `rebalance-arbitrum-dex`,
  `aave-guard-fork` and `lineage-fallback-probe`.
- The live `MiniAppRegistry` on 0G Galileo holds **9** entries, two of which
  (`market-risk-watch`, `alert-nft-floor`) appear in neither the strip nor the
  deployments file.
- Three of the five names the strip does show have permanently unfetchable
  manifests, so the product's showcase strip is majority-broken rows.

A hand-maintained list of onchain facts drifts. This one did, in both
directions, and the component that renders it is the one surface whose stated
purpose is that a name is read rather than asserted.

## What the chain actually says

`MiniAppRegistry.totalApps()` / `page(offset, limit)` read on 2026-07-26:

```
totalApps 9
  4 market-risk-watch.graphminis.eth        rev1
  5 aave-health-guard.graphminis.eth        rev1
  6 wallet-bound-guard.graphminis.eth       rev1
  7 attested-market-guard.graphminis.eth    rev1
  8 durable-market-guard.graphminis.eth     rev1
  9 alert-nft-floor.graphminis.eth          rev1
 10 atlas-market-guard.atlas-apps.eth       rev1
 11 rebalance-arbitrum-dex.atlas-apps.eth   rev1
 13 lineage-fallback-probe.atlas-apps.eth   rev1
```

Six of nine name the **retired** parent `graphminis.eth`. During the Atlas
rebrand the ENS records were re-issued under `atlas-apps.eth`
(`web/scripts/ens-reissue-subnames.ts`) but the 0G registry entries were never
re-registered, so they still carry the old name.

This explains a disclosure the strip currently renders imprecisely.
`attested-market-guard.atlas-apps.eth` reads "ens side only" because its ENS
record asserts token 7 while token 7's registry entry says
`attested-market-guard.graphminis.eth`. The strip's `readBinding` attributes
this to "tokens minted before the ENS rename still assert the old parent", which
is true but incomplete — the registry entry is stale too, and that is the leg
that actually fails.

Only three entries are registered under the current parent, and all three have
live pinned manifests: `atlas-market-guard` (10), `rebalance-arbitrum-dex` (11),
`lineage-fallback-probe` (13).

## Decisions

1. **Source of truth: enumerate `MiniAppRegistry` onchain.** The contract was
   written for this — `_keys` carries the comment "so the registry (prd.md §12)
   can be enumerated without an indexer during the demo" — but `totalApps` and
   `page` were never added to `MINI_APP_REGISTRY_ABI`, so nothing could call
   them. A name appears on the strip because it was published, and a new publish
   shows up with no code change.

2. **Scope: filter to the configured parent.** Show entries whose `ensName` ends
   in `.` + the parent reported by the ENS backend config. The filter is
   config-driven, so there is still no list to keep in sync. Rejected: rendering
   all nine, which leads a product page with six rows pointing at a name the
   project no longer uses.

3. **Report the denominator.** The route returns the unfiltered total alongside
   the filtered set so the strip can state that N of M registry entries name a
   retired parent. Hiding the six would trade one dishonest denominator for
   another.

   One consequence, accepted: `aave-guard-fork.atlas-apps.eth` has ENS records
   and Agentic ID token 12 but **no registry entry** — `registerFork` reverted
   `ParentUnknown` and the revert was swallowed, which is the bug the
   `registryGap` note in the deployments file preserves as evidence. Enumerating
   the registry therefore drops it from the strip. That is correct: the strip
   becomes "what is published", and a name whose registration never landed is
   not published. The deployments file remains the record of the incident.

4. **No fallback list.** If the 0G RPC does not answer, the strip says so and
   renders no rows. Falling back to a constant would reintroduce exactly the bug
   being removed, at the moment it is least detectable.

5. **Re-publish the three broken names, which requires new tokens.**
   `MiniAppRegistry.register` reverts `TokenAlreadyBound` when
   `nameKeyOf[tokenId]` is already set, and the contract comment states the
   intent: "a token that already answers to a name cannot be re-pointed, because
   that would silently change what a funded name means." Tokens 5, 6 and 7 are
   bound to their `*.graphminis.eth` keys and cannot be moved. Re-publishing
   therefore mints fresh Agentic IDs and repoints each name's ENSIP-25 record —
   the normal publish path, not a workaround. Tokens 5/6/7 become orphaned
   history and are recorded as such.

## Architecture

Three units, each with one job.

### `web/src/lib/identity/published.ts` (new)

```ts
export interface RegisteredApp {
  ensName: string;
  manifestCid: string;
  tokenId: number;
  author: Address;
  appVersion: string;
  ensNode: Hex;
  forkedFrom: Hex | null;   // null when zero — an original, not a fork
  registeredAt: number;     // unix seconds
  updatedAt: number;
  revision: number;
}

export async function listRegisteredApps(): Promise<RegisteredApp[]>;
```

Reads `totalApps()`, then pages `page(offset, 50)` through
`zeroGPublicClient()` until the total is covered. Normalises `bigint` to
`number` and the zero `forkedFrom` to `null` so the result is JSON-safe.

Knows nothing about ENS, parents or filtering — it answers "what is in the
registry" and nothing else. A new file rather than a 15th export on
`agentic-id.ts`, which is already 1063 lines.

Depends on `MINI_APP_REGISTRY_ABI` and `zeroGPublicClient` from `agentic-id.ts`.

### `web/src/lib/identity/agentic-id.ts` (edit)

Add `totalApps` and `page` entries to `MINI_APP_REGISTRY_ABI`, matching the
deployed contract. The `page` output tuple is the same `AppRecord` shape already
spelled out for `get` and `getByName`. No other change to this file.

### `web/src/app/api/registry/published/route.ts` (new)

`GET`, `runtime = "nodejs"`, uncached.

Deliberately **not** `export const dynamic = "force-dynamic"` — Next 16.2
removes that option under Cache Components, as
`web/src/app/api/publish/route.ts:22` already records. The handler takes
`request: NextRequest`, which opts it out of static evaluation under either
configuration, and responds with `cache-control: no-store` because the strip
claims the list is read live.

```json
{
  "parent": "atlas-apps.eth",
  "registry": "0x093319DbD3c21b037Cb21199e468D3E15A748dA8",
  "chainId": 16602,
  "total": 9,
  "retired": 6,
  "apps": [ /* RegisteredApp[], current parent only, registry order */ ]
}
```

- `parent` from `getEnsBackend().parent`.
- `apps` filtered to `ensName.endsWith("." + parent)`, order preserved from the
  registry so it stays publish order.
- `total` is the unfiltered count; `retired` is `total - apps.length`.
- On RPC failure: HTTP 502, `{ "error": "<the client's own message>" }`.
- When the registry is reachable but holds nothing under the parent: HTTP 200
  with `apps: []`. Empty is a real answer, not an error.

### `web/src/components/registry/published-strip.tsx` (rewrite of the top half)

Delete `PUBLISHED_LABELS` and the `labels` prop — the sole caller
(`web/src/app/registry/page.tsx:34`) passes nothing, and a prop that exists only
to reinstate a hardcoded list is the bug with an interface.

The component gains a catalog phase in front of the per-name resolution it
already does:

```
mount
  ├─ GET /api/publish            → chain ref for explorer links (unchanged)
  └─ GET /api/registry/published → { apps, total, retired, parent }
        └─ for each app: GET /api/resolve/<label>   (unchanged, N in parallel)
```

The registry supplies *which* names. Every value rendered in a row still comes
from the resolve call, so the file's existing discipline is untouched — the
registry's own `manifestCid` is deliberately **not** rendered, because the strip
exists to show what the name resolves to, not what a second record claims.

The resolve call passes the **fully qualified** `ensName` from the registry, not
a split-off label. `GET /api/resolve/<name>` accepts either form
(`web/src/app/api/resolve/[name]/route.ts:3`), and passing the whole name means
the strip never reassembles a name from a label plus an assumed parent — the
step where the old code could have been wrong and would not have known.

Catalog states, all rendered:

| state | rendering |
|---|---|
| loading | head note "reading the registry", `LiveDot`, no rows |
| failed | the server's message verbatim in `--loss`, no rows, no fallback |
| ready, empty | one line: no apps registered under `<parent>` yet |
| ready, N apps | N rows, exactly as today |

Head note becomes `${resolved} of ${apps.length} resolved · read live on mount`.
When `retired > 0`, a second line states that `retired` of `total` registry
entries name a different parent and are not shown.

The doc comment is rewritten. Its current text hardcodes arithmetic — "the five
subnames that actually exist", "of the five names below, only TWO" — that is
wrong the moment the list is live, and a fixed denominator in a comment is the
same class of error the comment already spends a paragraph correcting.

`readBinding`'s "ens side only" note is amended to name the real cause: the
token's registry entry carries the pre-rebrand parent, so
`MiniAppRegistry.verify` rejects the pair. Same condition, accurate attribution.

## Phase 2 — re-publish the three lost manifests

Separate step. Spends Sepolia and 0G gas and abandons three tokens, so it lands
after phase 1 and is confirmed before anything is broadcast.

`web/scripts/republish-lost-manifests.ts`, over `attested-market-guard`,
`wallet-bound-guard` and `aave-health-guard`. Per name:

1. Rebuild the manifest and pin it (`IPFS_MODE=pinata`) → new CID.
2. Mint a fresh Agentic ID on 0G. Required: the old token is immovably bound.
3. `MiniAppRegistry.register(<name>.atlas-apps.eth, cid, …, newTokenId)`.
4. `setRecords` on Sepolia: new `contenthash`, `agent-registration` repointed at
   the new token, and `addr` — which `aave-health-guard` has never had.
5. Read back through `GET /api/resolve/<label>` and require
   `mutuallyVerified === true` and a fetched manifest before moving on.

Then update `contracts/deployments/ens-sepolia.json`: record the new tokens and
CIDs, mark tokens 5/6/7 orphaned, and correct `manifestAvailability`.

Result: six names under the current parent, every one with all three
verification legs true and a manifest that fetches from a public gateway.

## Testing

- `listRegisteredApps` against the live registry: asserts 9 entries and that
  paging at `limit < total` returns the same set as one full page.
- Route: parent filter keeps exactly the `.atlas-apps.eth` entries;
  `retired === total - apps.length`; RPC failure produces 502 with a message and
  never a list.
- Component: the four catalog states render as tabled above; a failed catalog
  renders zero rows; `PUBLISHED_LABELS` no longer appears anywhere in `src`.
- Manual: load `/registry` and confirm the row count matches the contract read.

## Out of scope

- Pagination or virtualisation of the strip. The registry holds single digits;
  revisit past ~25 under one parent.
- Re-registering the six `graphminis.eth` entries. They are history and the
  tokens cannot be re-pointed.
- Any change to `RegistryGrid`, which renders unpublished seed apps and is a
  different surface.
