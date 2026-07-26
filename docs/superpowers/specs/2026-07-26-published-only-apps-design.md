# Published is the only state an app has

Date: 2026-07-26
Status: approved, not yet implemented

Depends on `2026-07-26-published-strip-live-enumeration-design.md` (phases 1 and
2). That spec makes the registry readable and the names live; this one makes the
registry the *only* place an app can come from. It also supersedes that spec's
final out-of-scope line — "any change to `RegistryGrid`, which renders
unpublished seed apps and is a different surface." After this change it is not a
different surface. It reads the same enumeration.

## The problem

Atlas has three things it calls a mini app:

1. a **seed app** — one of sixteen literals in `lib/seed.ts`, with
   `identity.ens === null`, on every board, forkable, rateable, runnable
2. a **local app** — created by `publishApp` when the publish POST fails, or by
   `forkApp`, which strips identity by design; lives in `localStorage`
3. a **published app** — pinned, named, minted, registered across IPFS, Sepolia
   and 0G Galileo

Only the third exists in any sense outside the browser holding it. The first two
are why the three `identity` fields are null-checked throughout the render tree,
why `MiniApp` carries
an `isMine` derivation, why `AppPublishPanel` has four branches, why
`registry-grid.tsx` spends eighty lines disclosing that nothing on it is
published, and why `store.ts` merges seeds against `localStorage` on every
restore with a schema version that must be bumped whenever seed content changes.

None of that complexity buys a capability. It exists to describe states that a
product with one kind of app would not have.

The seed corpus was also the subject of a long correction campaign — `seed.ts`
lines 299–347 record the removal of invented authors, invented `running: true`
flags and derived ENS names, each caught separately, each after shipping. The
file's remaining honesty is maintained by comments asking future readers not to
re-add fields. That is a defence that has already failed three times.

## The decision

**An app exists if and only if `MiniAppRegistry` holds a record for it under the
configured parent.** There is no draft app, no local app, no unpublished app.
Publishing is not a step an app goes through; it is the act that creates one.

A pre-publish plan still exists, but it is not an app and never enters the
board:

| | `DraftManifest` | `Manifest` |
|---|---|---|
| lives in | Studio component state | the chain |
| can | preview, Run, edit, discard | run, fork, rate |
| persisted | no — a refresh loses it | by 0G, Sepolia and IPFS |
| appears on the board | never | always |

A draft that is never published leaves no trace anywhere. That is the whole
simplification: there is no third thing to name, migrate, garbage-collect,
disclose or explain.

## Enforcement is a type, not a convention

```ts
// lib/contracts/manifest.ts — today
identity: {
  ens: string | null;
  manifestCid: string | null;
  agenticId: { tokenId: number } | null;
}

// after
export interface PublishedIdentity {
  ens: string;
  manifestCid: string;
  agenticId: { tokenId: number };
}
export type DraftManifest = Omit<Manifest, "identity">;
export type Manifest = DraftManifest & { identity: PublishedIdentity };
```

This is the load-bearing change. Every `?? "not published"`, every
`identity.ens ? … : …`, and every comment explaining why a name might be absent
stops being a runtime branch and becomes unrepresentable. The compiler, not a
doc comment, is what stops a future revision from reintroducing an unpublished
app.

Call sites that collapse to unconditional renders: `app-card-face.tsx:123-125`,
`app-wheel-card.tsx:107-111`, `registry-grid.tsx:359-385`,
`publish-panel.tsx:316-411`, `store.ts:1957`, `app-runtime.tsx:311-314`.

## Architecture

### The board is a read of the chain

```
GET /api/registry
  │
  ├─ 0G Galileo   listRegisteredApps()        ── from the enumeration spec
  │                 → RegisteredApp[], filtered to the configured parent
  │
  ├─ per entry, Sepolia   GET /api/resolve/<ensName>
  │                         → addr, contenthash, agent-registration,
  │                           mutuallyVerified
  │
  └─ per entry, IPFS      fetch(contenthash) → Manifest
                            → assert contenthash === registry.manifestCID

  → MiniApp[], each carrying its own ResolveReport
```

The fully qualified `ensName` from the registry is passed to `/api/resolve`, never
a label plus an assumed parent — the same discipline the enumeration spec
adopts, for the same reason.

`published.ts` answers "what is in the registry". This route answers "what is on
the board", which is the registry joined against ENS and IPFS. Two units, two
questions; the join is the only new logic.

`PublishedStrip` stops being a separate showcase. Its per-row resolve logic is
what every board card needs, so it moves into this route and the component
becomes one of several renderers over the same data.

### `localStorage` stops holding apps

It keeps only facts about this device that no chain records:

- `localRuns` — fan-outs completed in this browser, which is what
  `Review.ranIt` is derived from
- reviews posted from this browser
- the journal / ledger

`SEED_STATE`, `SEED_NAMES`, the seed-merge in `restore()` (`store.ts:254`) and
the schema-version bump tied to seed content all go. The persisted blob no
longer has a shape that seed changes can invalidate.

### Three board states, visually distinct

| state | rendering |
|---|---|
| reading | skeleton, `LiveDot`, "reading the registry" |
| empty | "no apps registered under `<parent>` yet — describe one" |
| failed | the server's message verbatim in `--loss`, no cards, no fallback |

Collapsing *reading* into *empty* is the same defect `PublishReceipt` exists to
prevent, one level up: a state where nothing is known must never render as a
state where something is known to be absent. No fallback list on failure, for
the reason the enumeration spec gives — it reintroduces the removed bug at the
moment it is least detectable.

## Flows

### Publish — the only creation path

```
Studio: DraftManifest ──> preview ──> Run (live gateway)
                                   │
                              Publish… ──> confirm (unchanged)
                                   │
                          POST /api/publish
                    ┌──────────────┴──────────────┐
                  2xx                          fail
                    │                             │
        revalidate /api/registry       stay in Studio, draft intact,
        push /a/<name>                 error shown, nothing created
```

The two-step confirm in `AppPublishPanel` moves to the Studio unchanged. Its
justification is untouched: the press issues a real subname, mints a real token,
spends real gas, and the name↔token binding is immutable by design.

`PublishOutcome.offline` changes meaning — from "kept local" to "no app exists".
`publishApp` no longer constructs a `MiniApp` on the failure path, because there
is nothing to construct. `PublishReceipt` keeps its three branches; the sentence
under **Not published** becomes *"nothing was created — your draft is still in
the Studio"*.

`publishLines()` in `store.ts:582` loses its two-case comment about
`publishApp` vs `publishExisting`: there is one case now.

### Fork — into the Studio, not onto the board

```ts
// was: forkApp(parentName, newName) -> MiniApp on the board, identity stripped
// now: forkToDraft(parentName, newName) -> DraftManifest, opens the Studio
```

`ForkDialog` navigates to the Studio pre-loaded with the parent's plan,
`identity` absent by type, `forkedFrom` set to the parent's `nameKey`.
Publishing calls `registerFork(…, parentKey)` — already implemented in
`agentic-id.ts:246-945`, including its documented fallback when the parent is
not registered.

The dialog's own header argument survives unchanged: forking still publishes
nothing, because folding a two-chain write into "copy this plan" would make gas
a side effect of copying. It now lands in the Studio rather than on the board.

`stats.forks` becomes a chain read (`MiniAppRegistry.forksOf`) rather than a
seeded integer.

### `AppPublishPanel` is deleted in full

Each of its four branches described a state that can no longer occur:

| branch | why it goes |
|---|---|
| the publish form | a board app is already published |
| "already published — refused" | now the only possible state |
| "not yours to name" | you cannot publish a board app at all |
| the receipt | belongs to the Studio |

## The community layer

Chain supplies what it can prove: `author`, `registeredAt`, `updatedAt`,
`revision`, `appVersion`, `forkedFrom`, fork count.

Ratings, reviews and the `RAN_IT_WEIGHT` rule survive as working code with no
seeded content. A newly published app reads "no reviews yet", which is true and
requires no disclosure.

Deleted outright:

- `SEEDED_REVIEW_IDS`, `isSeededReview`, and the per-row `seeded` tag — with no
  seeded reviews there is nothing to label
- `MiniAppStats.valueTransactedUsd` and `.earnedUsd` — no facilitator settles
  x402 in this build, so neither has ever had a defensible value
- `stats.thumbsUp` / `.thumbsDown` as seedable fields; they become derived
  counts over posted reviews

`stats.runs` and `.costPerRunUsd` stay, written only by `runApp` from a measured
round trip.

## What is deleted

| file | what goes |
|---|---|
| `lib/seed.ts` | the 16 app literals, `SEED_APPS`, `SEED_APPS_ALL`, `SEED_LEDGER`, `SEED_DROPPED`, `SEED_DECLARED_COUNT`, `SEEDED_REVIEW_IDS`, `isSeededReview`, the `LIVE_SNAPSHOT` overlay and `LIVE_SEED_*`, `SEED_EPOCH`, `SEED_NOW` — roughly 1400 of 1962 lines |
| `lib/store.ts` | `publishExisting`, `SEED_STATE`, `SEED_NAMES`, the app half of `persist`/`restore`, `isArmed`'s now-tautological `identity.ens` check |
| `components/board/publish-panel.tsx` | `AppPublishPanel` (~235 lines). `PublishForecast`, `PublishReceipt`, `Row` and `PriceField` stay, single-caller |
| `components/registry/registry-grid.tsx` | the "Not 'Published'" disclosure and `RegistryLegend` (~80 lines) |
| `components/registry/published-strip.tsx` | `PUBLISHED_LABELS` (already scheduled by the enumeration spec) and the standalone strip framing |
| `app-card-face.tsx`, `app-wheel-card.tsx` | the not-published branches |
| `app/a/[name]/page.tsx` | the `SEED_APPS` import in `generateMetadata` — title comes from the registry read |

`seed.ts` survives as types plus the draft path — `MiniApp`, `Review`,
`MiniAppStats`, `LedgerLine`, `PlanStep`, `Draft`, `draftFromIntent`,
`slugify`, `resetOwnedValues`, `TIER_LABEL`, `TIER_BLURB`, `tierRank`. Split
into `lib/app-types.ts` and `lib/draft.ts`; "seed" stops describing anything the
file does.

## Local development without keys

**The one genuine regression.** When `identityStatus()` reports a mocked ENS or
0G backend, a publish writes no chain record — so a board that reads the chain
stays empty, where today the same publish yields a working local app.

Mitigation: when either backend is mocked, `/api/registry` serves a
process-local registry that `POST /api/publish` writes to, and the board renders
a persistent banner naming which backends are mocked. This is not a fallback in
the sense the enumeration spec rejects — it is not a hardcoded list standing in
for a failed read; it is a different, disclosed source selected by configuration
the forecast panel already reports.

Consequence, accepted: `PublishForecast`'s risk rows get sharper. "ENS backend
is mock" now means the app will exist only in this process, and the copy should
say so.

## Testing

- **Registry assembler**: a chain record plus a resolve plus a fetched manifest
  produces a `MiniApp`; each failure mode (RPC down, name unresolvable,
  contenthash absent, gateway 504, contenthash ≠ registry CID) produces a
  disclosed row and never a synthesised value.
- **Type-level**: a fixture asserting `DraftManifest` is not assignable to
  `Manifest`. This is the guard on the whole design.
- **`forkToDraft`**: returns a draft with no `identity` key, `forkedFrom` set,
  `agency.policy.wallet` and `provenance` stripped — the §5 rule `forkApp`
  already enforces.
- **Publish failure**: a non-2xx leaves the board unchanged and the Studio draft
  intact. Today's equivalent test asserts a local app is created; it inverts.
- **Board states**: reading, empty and failed render distinctly; `SEED_APPS`
  appears nowhere in `src`.
- **Rewritten fixtures**: `seed-to-a2ui-shape.test.ts` and `ratings.test.ts`
  both import `SEED_APPS` and need purpose-built fixtures. Real work, not a
  rename.

## Risks

1. **First paint is a network waterfall** — one 0G call, then N ENS resolves,
   then N gateway fetches. The server-side cache with revalidate-on-publish must
   land in the same pass, not after.
2. **The corpus is small.** Three names under the current parent today; six
   after phase 2 of the enumeration spec. Smaller than sixteen seeds, and every
   one of them real. Forking is the only thing that grows it.
3. **Deletion scale.** Around 1800 lines removed across a dozen files, including
   two test files that must be rewritten rather than adjusted. Sequence behind
   the enumeration spec so the replacement data path exists before the old one
   is removed.

## Out of scope

- `MiniAppRegistry.update()` as a product surface — "publish a revision" of an
  app you own. The contract supports it and phase 2 of the enumeration spec uses
  it operationally, but it is gated on token ownership, which the server holds
  rather than the user. Fork covers the need. Revisit when apps are transferable
  in-product.
- Re-registering the six `graphminis.eth` entries. They are history; the tokens
  cannot be re-pointed.
- Pagination of the board. Single digits under one parent; revisit past ~25.
- Any change to the publish pipeline itself — `publishWithReport`, the ENS
  backends, the 0G client. This spec changes what consumes a publish, not what a
  publish does.
