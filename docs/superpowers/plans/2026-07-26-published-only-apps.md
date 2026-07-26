# Published-Only Apps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an app exist if and only if `MiniAppRegistry` holds a record for it under the configured ENS parent — deleting the seed corpus, the local/unpublished app, and every branch that describes them.

**Architecture:** A new `assembleBoard()` joins the already-implemented `listRegisteredApps()` against `resolveWithReport()` and IPFS to produce `BoardEntry[]`. `GET /api/registry` serves that. The store stops seeding from `lib/seed.ts` and starts fetching, overlaying only device-local facts (runs, posted reviews, journal). Finally `Manifest.identity` becomes non-nullable, which makes the unpublished app unrepresentable and forces the remaining cleanup at the type level.

**Tech Stack:** Next 16.2 (App Router, Cache Components — no `export const dynamic`), React 19.2, viem 2.55, zod, TypeScript. Tests use the repo's own harness at `@/lib/kit/testing` (`describe`/`it`/`itAsync`/`assert`/`assertEqual`), run via `tsx`, registered in `src/lib/agency/all.test.ts`. There is no vitest/jest.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-26-published-only-apps-design.md`. Read it before Task 1.
- **Next 16:** never add `export const dynamic = "force-dynamic"` — removed under Cache Components. A handler taking `request: NextRequest` is already dynamic. See `src/app/api/publish/route.ts:22`.
- **Test command:** `cd web && pnpm test` (runs `tsc --noEmit` first, then the suite). A new test file must be imported in `src/lib/agency/all.test.ts` or it does not run.
- **Path aliases:** `@/lib/kit/*` → `packages/atlas-kit/src/kit/*`, `@/lib/contracts/*` → `packages/atlas-kit/src/contracts/*`, `@/*` → `src/*`. `lib/kit` and `lib/contracts` do **not** exist under `src/`.
- **No fabricated values.** A record that is absent renders as absent. Never substitute a derived, computed or plausible value for one that was not obtained. This rule is why most of the deleted code exists.
- **No fallback lists.** If a chain read fails, say so and render nothing. Falling back to a constant reintroduces the bug being deleted.
- **Commit after every task.** Message style: imperative mood, lowercase after the colon-free subject, explaining *why* — match `git log`.

---

## File Structure

**Created:**
- `web/src/lib/identity/board.ts` — joins a registry record to its resolved name and manifest. Knows nothing about React or the store.
- `web/src/lib/identity/board.test.ts` — the join's failure modes.
- `web/src/lib/identity/local-registry.ts` — the process-local registry used when a backend is mocked.
- `web/src/app/api/registry/route.ts` — `GET`, serves `BoardEntry[]`.
- `web/src/lib/app-types.ts` — types lifted out of `seed.ts`.
- `web/src/lib/draft.ts` — the draft path lifted out of `seed.ts`.

**Deleted:**
- `web/src/lib/seed.ts` (contents split between the two files above; the 16 app literals and all seeded content dropped)
- `web/src/components/board/publish-panel.tsx` → `AppPublishPanel` only

**Heavily modified:**
- `web/src/lib/store.ts` — board becomes fetched, not seeded
- `web/packages/atlas-kit/src/contracts/manifest.ts` — `identity` becomes non-nullable
- `web/src/components/registry/published-strip.tsx` — becomes a renderer over board data

---

## Task 1: The registry→board join

**Files:**
- Create: `web/src/lib/identity/board.ts`
- Create: `web/src/lib/identity/board.test.ts`
- Modify: `web/src/lib/agency/all.test.ts` (add one import)

**Interfaces:**
- Consumes: `RegisteredApp` from `@/lib/identity/published`; `ResolveReport`, `resolveWithReport` from `@/lib/identity/publish`.
- Produces: `interface BoardEntry`, `type ResolveFn`, `async function assembleBoard(apps: RegisteredApp[], resolveFn?: ResolveFn): Promise<BoardEntry[]>`.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/identity/board.test.ts`:

```ts
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
```

- [ ] **Step 2: Register the test file so it runs**

In `web/src/lib/agency/all.test.ts`, after the line `import "../identity/published.test";`, add:

```ts
import "../identity/board.test";
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd web && pnpm dlx tsx src/lib/agency/all.test.ts`
Expected: FAIL — `Cannot find module '@/lib/identity/board'`.

- [ ] **Step 4: Write the implementation**

Create `web/src/lib/identity/board.ts`:

```ts
/**
 * A registry record joined to what its name actually resolves to.
 *
 * `published.ts` answers "what is in the registry". This answers "what is on
 * the board", which is that record joined against ENS and IPFS. It is the only
 * place a chain record becomes something renderable, and therefore the only
 * place that could quietly invent one — so every branch below that fails to
 * obtain a manifest returns `manifest: null` with a sentence saying why, and
 * none of them substitutes a value.
 *
 * The contenthash/registry disagreement is the subtle one. When the name's
 * contenthash points at a different CID from the registry entry, the bytes may
 * fetch perfectly well — and must still not be rendered. Two records disagree
 * about what this app IS, and picking one is picking a side in a conflict the
 * reader is entitled to see. prd.md §8 makes agreement between the name and the
 * registry the thing a human verifies before funding; rendering through a
 * disagreement would spend that guarantee to avoid an empty card.
 */
import type { Address } from "viem";
import type { Manifest } from "@/lib/contracts/manifest";
import type { RegisteredApp } from "@/lib/identity/published";
import { resolveWithReport, type ResolveReport } from "@/lib/identity/publish";

export interface BoardEntry {
  /** The chain record, verbatim. Never edited, never defaulted. */
  registered: RegisteredApp;
  /** The plan this app runs, or null when it could not be obtained. */
  manifest: Manifest | null;
  /** The `addr` record — the address this name points at. Not proof of custody. */
  address: Address | null;
  mutuallyVerified: boolean;
  /**
   * Null when the app is runnable. Otherwise one sentence naming what is
   * missing or contradictory, in the resolver's own words where there are any.
   */
  unavailable: string | null;
}

export type ResolveFn = (ensName: string) => Promise<ResolveReport>;

/**
 * One entry per record, always. A record that cannot be resolved stays on the
 * board carrying its reason — dropping it would make `totalApps()` and the
 * board disagree, which is the class of defect this whole change removes.
 */
export async function assembleBoard(
  apps: RegisteredApp[],
  resolveFn: ResolveFn = resolveWithReport,
): Promise<BoardEntry[]> {
  return Promise.all(apps.map((record) => one(record, resolveFn)));
}

async function one(record: RegisteredApp, resolveFn: ResolveFn): Promise<BoardEntry> {
  let report: ResolveReport;
  try {
    report = await resolveFn(record.ensName);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      registered: record,
      manifest: null,
      address: null,
      mutuallyVerified: false,
      unavailable: `${record.ensName} did not resolve: ${detail}`,
    };
  }

  const base = {
    registered: record,
    address: report.address,
    mutuallyVerified: report.verification?.mutuallyVerified ?? false,
  };

  if (report.manifestCid !== null && report.manifestCid !== record.manifestCid) {
    return {
      ...base,
      manifest: null,
      unavailable:
        `the name's contenthash (${report.manifestCid}) disagrees with the registry ` +
        `(${record.manifestCid}), so what this app is cannot be established from either alone`,
    };
  }

  if (report.manifest === null) {
    return {
      ...base,
      manifest: null,
      unavailable: `the manifest at ${record.manifestCid} could not be fetched, so the plan behind this name is unavailable`,
    };
  }

  return { ...base, manifest: report.manifest, unavailable: null };
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd web && pnpm test`
Expected: PASS — all five `assembleBoard` tests green, `tsc --noEmit` clean.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/identity/board.ts web/src/lib/identity/board.test.ts web/src/lib/agency/all.test.ts
git commit -m "Join a registry record to what its name actually resolves to"
```

---

## Task 2: The board route

**Files:**
- Create: `web/src/app/api/registry/route.ts`

**Interfaces:**
- Consumes: `listRegisteredApps`, `selectUnderParent` from `@/lib/identity/published`; `assembleBoard`, `BoardEntry` from `@/lib/identity/board`; `identityStatus` from `@/lib/identity/publish`.
- Produces: `GET /api/registry` → `{ parent, registry, chainId, total, retired, entries: BoardEntry[] }`, or 502 `{ error }`.

> **Note on the sibling route.** `web/src/app/api/registry/published/route.ts` was committed in `0ff5c0e` (the enumeration plan's Task 2) and already does the `listRegisteredApps` + `selectUnderParent` half of this. It is deliberately left alone here and **deleted in Task 10**, once the strip stops being the only consumer of it. Two routes performing the same chain read is exactly the drift this change removes, so they must not both survive. Model this route's error handling, the `no-store` header and the `dynamic` comment on that file — it is the house style for this now.

- [ ] **Step 1: Write the route**

Create `web/src/app/api/registry/route.ts`:

```ts
/**
 * GET /api/registry — every app that exists.
 *
 * "Exists" is not a figure of speech here. After the published-only change an
 * app IS a `MiniAppRegistry` record under the configured parent, so this route
 * is not a view onto the board — it is the board, and the client renders what
 * it returns rather than merging it with anything local.
 *
 * `total` and `retired` are reported rather than quietly filtered away. Six of
 * the nine entries on the deployed registry name `graphminis.eth`, the parent
 * used before the Atlas rebrand; their tokens are immutably bound and cannot be
 * re-pointed, so they are history. Hiding them would trade one misleading
 * denominator for another — see `selectUnderParent` in published.ts.
 */
import type { NextRequest } from "next/server";
import { assembleBoard } from "@/lib/identity/board";
import { identityStatus } from "@/lib/identity/publish";
import { listRegisteredApps, selectUnderParent } from "@/lib/identity/published";

// Resolution reads ENS over viem and fetches manifests from a gateway; neither
// can run on the edge.
export const runtime = "nodejs";
// One 0G call, then N ENS resolutions, then N gateway fetches, all per request.
export const maxDuration = 60;
// Deliberately NOT `export const dynamic = "force-dynamic"` — Next 16 removes
// that option under Cache Components. Taking `request` keeps this handler
// dynamic under either configuration. See app/api/publish/route.ts:22.

export async function GET(request: NextRequest) {
  void request;
  const status = identityStatus();
  const parent = status.ens.parent;

  try {
    const all = await listRegisteredApps();
    const { apps, total, retired } = selectUnderParent(all, parent);
    const entries = await assembleBoard(apps);

    return Response.json(
      {
        parent,
        registry: status.zeroG.registry,
        chainId: status.zeroG.chainId,
        total,
        retired,
        entries,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    // No fallback list. A registry that cannot be read is not an empty
    // registry, and the client must be able to tell those apart.
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 502 });
  }
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd web && pnpm run typecheck && pnpm run lint`
Expected: both clean.

- [ ] **Step 3: Verify against the live chain**

Run:
```bash
cd web && pnpm dev
# in another shell:
curl -s localhost:3000/api/registry | jq '{parent, total, retired, entries: [.entries[] | {name: .registered.ensName, ok: (.manifest != null), why: .unavailable}]}'
```

Expected: `parent` is `atlas-apps.eth`, `total` is 9, `retired` is 6, and three entries are listed. Record which have `ok: true` — the spec expects all three under the current parent to have live manifests. If any is `false`, note the `why` string and report it before continuing; it changes the corpus size but not the design.

- [ ] **Step 4: Verify the failure path returns no list**

Run:
```bash
cd web && ZEROG_RPC_URL=http://127.0.0.1:1 pnpm dev
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/registry
curl -s localhost:3000/api/registry | jq
```
Expected: `502`, and a body with `error` and **no** `entries` key.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/api/registry/route.ts
git commit -m "Serve the board off the registry, with the denominator it filtered"
```

---

## Task 3: The local registry for mocked backends

This is the regression named in the spec's "Local development without keys". Without it, a developer with no keys publishes and sees nothing.

**Files:**
- Create: `web/src/lib/identity/local-registry.ts`
- Modify: `web/src/app/api/registry/route.ts`
- Modify: `web/src/app/api/publish/route.ts`

**Interfaces:**
- Produces: `function isMocked(): boolean`, `function recordLocally(app: RegisteredApp): void`, `function localRegistry(): RegisteredApp[]`.

- [ ] **Step 1: Write the module**

Create `web/src/lib/identity/local-registry.ts`:

```ts
/**
 * The registry, when there is no registry.
 *
 * With a mocked ENS or 0G backend a publish writes nothing to any chain, so a
 * board that reads the chain stays empty however many times you press Publish.
 * Before the published-only change that same publish still produced a working
 * local app, so this is the one capability that change removes — and this
 * module gives it back without giving back the ambiguity.
 *
 * WHY THIS IS NOT THE FALLBACK LIST THE DESIGN FORBIDS. That rule is about a
 * constant standing in for a read that FAILED — a hardcoded list rendering as
 * though it came off the chain, at the moment nobody can tell. This is a
 * different source selected by configuration that `identityStatus()` already
 * reports on screen, chosen before any read is attempted, and never consulted
 * when a real read fails. When it is in use the board says so.
 *
 * It is process memory and nothing more. A server restart empties it, which is
 * correct: nothing was ever published.
 */
import { identityStatus } from "@/lib/identity/publish";
import type { RegisteredApp } from "@/lib/identity/published";

const entries: RegisteredApp[] = [];

/** True when a publish cannot reach a chain, so the board cannot read one. */
export function isMocked(): boolean {
  const status = identityStatus();
  return status.ens.mode !== "onchain" || status.zeroG.mode !== "live";
}

export function recordLocally(app: RegisteredApp): void {
  entries.push(app);
}

export function localRegistry(): RegisteredApp[] {
  return [...entries];
}
```

- [ ] **Step 2: Select the source in the route**

In `web/src/app/api/registry/route.ts`, replace the line:

```ts
    const all = await listRegisteredApps();
```

with:

```ts
    // Chosen before any read, off configuration the forecast panel already
    // shows — never as a rescue for a read that failed.
    const mocked = isMocked();
    const all = mocked ? localRegistry() : await listRegisteredApps();
```

Add to the imports:

```ts
import { isMocked, localRegistry } from "@/lib/identity/local-registry";
```

And add `mocked` to the response body, immediately after `parent`:

```ts
        parent,
        mocked,
```

- [ ] **Step 3: Record a mocked publish**

In `web/src/app/api/publish/route.ts`, inside `POST`, replace:

```ts
    const report = await publishWithReport(parsed.data.manifest, parsed.data.options);
    return Response.json(report, { status: 200 });
```

with:

```ts
    const report = await publishWithReport(parsed.data.manifest, parsed.data.options);
    // On a mocked deployment nothing reached a chain, so nothing will come back
    // off one. Keep it in process so the board can show what this session did.
    if (isMocked() && report.manifest) {
      recordLocally({
        ensName: report.manifest.identity.ens ?? `${report.manifest.name}.${getEnsBackend().parent}`,
        manifestCid: report.manifest.identity.manifestCid ?? "",
        tokenId: report.manifest.identity.agenticId?.tokenId ?? 0,
        author: (report.manifest.author ?? "0x") as `0x${string}`,
        appVersion: report.manifest.appVersion,
        ensNode: "0x",
        forkedFrom: null,
        registeredAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
        revision: 1,
      });
    }
    return Response.json(report, { status: 200 });
```

Add to that file's imports:

```ts
import { isMocked, recordLocally } from "@/lib/identity/local-registry";
```

> Note for the implementer: `report.manifest.identity.*` is still nullable at this point in the plan. Task 7 makes it non-nullable, after which the `??` fallbacks above become dead and must be simplified — Task 7 Step 4 covers this explicitly.

- [ ] **Step 4: Typecheck**

Run: `cd web && pnpm run typecheck`
Expected: clean.

- [ ] **Step 5: Verify without keys**

Run:
```bash
cd web && ENS_MODE=mock pnpm dev
curl -s localhost:3000/api/registry | jq '{mocked, total}'
```
Expected: `{"mocked": true, "total": 0}`. Then publish once through the Studio in the browser and re-run the curl. Expected: `total` is 1.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/identity/local-registry.ts web/src/app/api/registry/route.ts web/src/app/api/publish/route.ts
git commit -m "Keep a mocked publish visible without pretending it reached a chain"
```

---

## Task 4: Split `seed.ts` into types and the draft path

Mechanical, and worth doing before the store change so the store's new imports have somewhere to point. No behaviour changes in this task.

**Files:**
- Create: `web/src/lib/app-types.ts`
- Create: `web/src/lib/draft.ts`
- Modify: `web/src/lib/seed.ts` (becomes a re-export shim, deleted in Task 6)

**Interfaces:**
- Produces: `app-types.ts` exports `MiniAppStats`, `Review`, `MiniApp`, `LedgerLine`, and re-exports `Accent`, `UiBlock`, `UiDoc`. `draft.ts` exports `PlanStep`, `Draft`, `slugify`, `draftFromIntent`, `resetOwnedValues`, `tierRank`, `TIER_LABEL`, `TIER_BLURB`.

- [ ] **Step 1: Move the type block**

Create `web/src/lib/app-types.ts` and move into it, verbatim including doc comments, from `web/src/lib/seed.ts`: the `export type { Accent, UiBlock, UiDoc }` line (76), `MiniAppStats` (80-93), `Review` (95-145), `MiniApp` (146-205) and `LedgerLine` (206-215). Carry across whichever imports those blocks need — check the top of `seed.ts` for the `Accent`/`UiBlock`/`UiDoc` and `JournalEntry` sources.

- [ ] **Step 2: Move the draft block**

Create `web/src/lib/draft.ts` and move into it, verbatim: `resetOwnedValues` (1474), `tierRank` (1608), `TIER_LABEL` (1612), `TIER_BLURB` (1618), `PlanStep` (1634), `Draft` (1660), `slugify` (1687) and `draftFromIntent` (1701) through the end of the file.

- [ ] **Step 3: Make `seed.ts` a shim**

Replace the moved blocks in `seed.ts` with re-exports so no import site breaks yet:

```ts
export * from "./app-types";
export * from "./draft";
```

Leave the 16 app literals, `SEED_APPS`, `SEED_LEDGER` and the rest in place — Task 6 deletes them.

- [ ] **Step 4: Typecheck and test**

Run: `cd web && pnpm test`
Expected: PASS with no changes to any test. This task moved code; it changed nothing.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/app-types.ts web/src/lib/draft.ts web/src/lib/seed.ts
git commit -m "Separate the app types and the draft path from the seed corpus"
```

---

## Task 5: The store fetches the board

**Files:**
- Modify: `web/src/lib/store.ts`

**Interfaces:**
- Consumes: `GET /api/registry` from Task 2, `BoardEntry` from Task 1.
- Produces: `BoardState.apps` populated from the route; `BoardState.boardStatus: "reading" | "ready" | "failed"`; `BoardState.boardError: string | null`; `BoardState.mocked: boolean`; `async function loadBoard(): Promise<void>`.

- [ ] **Step 1: Add the three board states**

In `web/src/lib/store.ts`, extend `BoardState` (line 122) with:

```ts
  /**
   * Reading, ready or failed — three states, never two. An empty board and a
   * board that has not answered yet look identical if this is a boolean, and
   * that is the same defect `PublishReceipt` exists to prevent one level up:
   * a state where nothing is known must not render as one where something is
   * known to be absent.
   */
  boardStatus: "reading" | "ready" | "failed";
  /** The server's own message on failure. Never paraphrased, never a list. */
  boardError: string | null;
  /** True when the route served the process-local registry. Rendered, not hidden. */
  mocked: boolean;
  /** The ENS parent the board is scoped to, from the route. Named in the empty state. */
  parent: string;
```

and add `parent: ""` to the `EMPTY_STATE` literal in Step 2, and `parent: body.parent` to the success `set()` in Step 3.

- [ ] **Step 2: Replace the seed state**

Replace `SEED_STATE` (line 159) and the `SEED_NAMES` constant (line 120) with:

```ts
const EMPTY_STATE: BoardState = {
  apps: [],
  ledger: [],
  halted: false,
  wallet: null,
  hydrated: false,
  localRuns: {},
  boardStatus: "reading",
  boardError: null,
  mocked: false,
  // Carry across any remaining fields from the old SEED_STATE literal unchanged.
};
```

Update `let state: BoardState = SEED_STATE;` (line 171) and `getServerSnapshot()` (line 177) to use `EMPTY_STATE`.

- [ ] **Step 3: Write `loadBoard`**

Add to `store.ts`:

```ts
/**
 * Fill the board from the registry.
 *
 * The board is not local state with a remote backup — it IS the registry, so
 * this replaces `apps` wholesale rather than merging. There is nothing local to
 * merge: an app that is not registered does not exist, and the device-local
 * facts (`localRuns`, posted reviews, the journal) are kept in their own keys
 * precisely so this can be a replacement.
 */
export async function loadBoard(): Promise<void> {
  set({ boardStatus: "reading", boardError: null });
  try {
    const res = await fetch("/api/registry", { cache: "no-store" });
    const body = (await res.json()) as
      | { error: string }
      | { entries: BoardEntry[]; mocked: boolean };

    if (!res.ok || "error" in body) {
      const message = "error" in body ? body.error : `the registry route answered ${res.status}`;
      set({ boardStatus: "failed", boardError: message, apps: [] });
      return;
    }

    set({
      apps: body.entries.map(toMiniApp),
      mocked: body.mocked,
      boardStatus: "ready",
      boardError: null,
    });
  } catch (err) {
    set({
      boardStatus: "failed",
      boardError: err instanceof Error ? err.message : String(err),
      apps: [],
    });
  }
}

/**
 * A chain entry plus this device's own record of it.
 *
 * `stats.runs` and `costPerRunUsd` are written only by `runApp` from a measured
 * round trip; `forks` comes off the chain. Nothing here opens at an invented
 * figure, which is what the deleted seed corpus did on every one of these
 * fields.
 */
function toMiniApp(entry: BoardEntry): MiniApp {
  return {
    manifest: entry.manifest,
    entry,
    running: entry.manifest !== null && entry.manifest.agency.tier !== "readonly",
    lastRunAt: null,
    journal: [],
    reviews: [],
    stats: {
      runs: 0,
      forks: 0,
      spentUsd: 0,
      thumbsUp: 0,
      thumbsDown: 0,
      sourcesQueried: entry.manifest?.data.sources.length ?? 0,
      sourcesHealthy: entry.manifest?.data.sources.filter((s) => s.healthy).length ?? 0,
      costPerRunUsd: 0,
    },
  };
}
```

Add `import type { BoardEntry } from "@/lib/identity/board";` to the imports.

> `MiniApp` gains an `entry: BoardEntry` field and `manifest` becomes `Manifest | null`; add both to the interface in `app-types.ts`. `MiniAppStats` loses `valueTransactedUsd` and `earnedUsd` — delete those two fields from the interface too, and fix the resulting type errors at their call sites by deleting the lines that read them.

- [ ] **Step 4: Drop apps from persistence**

In `persist()` (line 191) remove `apps` from the persisted object. In `restore()` (line 243) delete the seed-merge at line 254 entirely — the whole `[...SEED_APPS, ...parsed.apps.filter(...)]` expression and the `apps` key it feeds. Keep `ledger`, `localRuns` and `halted`.

Bump the schema version constant near line 60 by one, and replace its comment with: `Bump whenever the persisted SHAPE changes. Apps are no longer persisted — they come from the registry — so seed content can no longer invalidate this.`

- [ ] **Step 5: Call it on hydrate**

Find the `useEffect` that sets `hydrated` (near the `useBoard` export, line 281) and add a `void loadBoard();` call after hydration completes.

- [ ] **Step 6: Typecheck**

Run: `cd web && pnpm run typecheck`
Expected: **many** errors, all of the form "Property 'valueTransactedUsd' does not exist" or "'manifest' is possibly 'null'". This is the compiler enumerating Task 8's work. Record the list — do not fix it here beyond what `store.ts` itself needs to compile.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/store.ts web/src/lib/app-types.ts
git commit -m "Read the board off the registry instead of seeding it"
```

---

## Task 6: Delete the seed corpus

**Files:**
- Modify: `web/src/lib/seed.ts` → delete
- Modify: `web/src/app/a/[name]/page.tsx`
- Modify: every file importing from `@/lib/seed`

- [ ] **Step 1: Repoint the imports**

For each file in this list, change `from "@/lib/seed"` to `from "@/lib/app-types"` (for `MiniApp`, `Review`, `LedgerLine`, `Accent`, `UiBlock`, `UiDoc`) or `from "@/lib/draft"` (for `TIER_LABEL`, `TIER_BLURB`, `tierRank`, `PlanStep`, `slugify`, `draftFromIntent`, `resetOwnedValues`):

`app/a/[name]/page.tsx`, `components/board/app-card-face.tsx`, `components/board/app-policy-strip.tsx`, `components/board/studio-input.tsx`, `components/board/chrome.tsx`, `components/board/app-runtime.tsx`, `components/board/app-wheel-card.tsx`, `components/board/app-body.tsx`, `components/board/app-grid.tsx`, `components/board/ledger.tsx`, `components/board/panels/usage.tsx`, `components/board/publish-panel.tsx`, `components/board/panels/data-plan.tsx`, `components/board/panels/permissions.tsx`, `components/registry/registry-grid.tsx`, `components/registry/ratings.tsx`, `components/registry/fork-dialog.tsx`, `lib/store.ts`, `lib/schema-coverage.ts`.

- [ ] **Step 2: Fix the one remaining consumer of `SEED_APPS` outside tests**

In `web/src/app/a/[name]/page.tsx`, delete the `SEED_APPS` import and replace `generateMetadata` with:

```ts
export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const { name } = await params;
  // No seed lookup: titles come from the registry at render time, and a build
  // has no registry. The name is the one thing known statically.
  return { title: `${name} — Atlas` };
}
```

- [ ] **Step 3: Delete the file**

```bash
git rm web/src/lib/seed.ts
```

- [ ] **Step 4: Delete `SEED_EPOCH`'s last consumer**

`components/board/app-runtime.tsx:54` imports `SEED_EPOCH`. Find its use and replace the seeded timestamp with the real one available at that call site; if none exists, delete the line and whatever it was formatting. A relative time computed from a constant epoch is invented texture of the same kind as the rest of this task.

- [ ] **Step 5: Typecheck**

Run: `cd web && pnpm run typecheck`
Expected: errors only in `lib/ratings.test.ts` and `lib/seed-to-a2ui-shape.test.ts`, which Task 9 rewrites, plus the `manifest` nullability errors from Task 5.

- [ ] **Step 6: Commit**

```bash
git add -A web/src
git commit -m "Delete the seed corpus — an app that was never published is not an app"
```

---

## Task 7: Make `identity` non-nullable

The guard on the whole design. Do this after Task 6, when the only remaining producers of a null identity are the ones being deleted.

**Files:**
- Modify: `web/packages/atlas-kit/src/contracts/manifest.ts:125-132, 184`
- Create: `web/src/lib/contracts/identity.test.ts`
- Modify: `web/src/lib/agency/all.test.ts`

**Interfaces:**
- Produces: `PublishedIdentity`, `DraftManifest`, `Manifest` (identity non-nullable), `zDraftManifest`.

- [ ] **Step 1: Write the type-level guard test**

Create `web/src/lib/contracts/identity.test.ts`:

```ts
/**
 * The guard on the published-only design.
 *
 * The invariant is "an app has an identity", and it is worth having only if it
 * cannot be reintroduced by a later edit. A runtime assertion cannot express
 * that. This file does: it fails to COMPILE if `DraftManifest` ever becomes
 * assignable to `Manifest`, and `pnpm test` runs `tsc --noEmit` before the
 * suite precisely so a type-level failure stops the run.
 */
import { describe, it, assert } from "@/lib/kit/testing";
import type { DraftManifest, Manifest } from "@/lib/contracts/manifest";

// @ts-expect-error a draft has no identity, so it is not a Manifest. If this
// line stops erroring, the invariant is gone and the error is the alarm.
const _never: Manifest = {} as DraftManifest;
void _never;

describe("manifest identity", () => {
  it("is required on a published manifest", () => {
    const published: Manifest = {
      identity: {
        ens: "a.atlas-apps.eth",
        manifestCid: "bafk",
        agenticId: { chain: "0g", contract: "0x0", tokenId: 1 },
      },
    } as Manifest;
    assert(published.identity.ens.length > 0, "ens is a string, never null");
  });
});
```

Register it in `all.test.ts` next to the other imports:

```ts
import "../contracts/identity.test";
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && pnpm run typecheck`
Expected: FAIL — `@ts-expect-error` reports it is unused, because `DraftManifest` does not exist yet and today's `Manifest` accepts a null identity.

- [ ] **Step 3: Change the schema**

In `web/packages/atlas-kit/src/contracts/manifest.ts`, replace lines 125-132:

```ts
/**
 * What a published app is bound to. Every field is required, and that is the
 * whole point rather than strictness for its own sake: before this, `identity`
 * was three nullable fields and the product carried a second kind of app —
 * unpublished, local, unnamed — whose only definition was that these were null.
 * Making them required deletes that state at the type level, so it cannot come
 * back by an edit that forgets a comment.
 *
 * A plan that has not been published yet is a `DraftManifest`, which has no
 * `identity` key at all. Not a null one — no key.
 */
export const zPublishedIdentity = z.object({
  ens: z.string(),
  agenticId: z.object({ chain: z.literal("0g"), contract: z.string(), tokenId: z.number() }),
  manifestCid: z.string(),
});
export type PublishedIdentity = z.infer<typeof zPublishedIdentity>;
```

Change line 157 from `identity: zIdentity,` to `identity: zPublishedIdentity,`.

After the `zManifest` definition, add:

```ts
export type Manifest = z.infer<typeof zManifest>;
/** A plan the Studio holds. Becomes a `Manifest` only by being published. */
export const zDraftManifest = zManifest.omit({ identity: true });
export type DraftManifest = z.infer<typeof zDraftManifest>;
```

- [ ] **Step 4: Fix `forkManifest` and the publish route**

At `manifest.ts:184`, `forkManifest` sets `identity: { ens: null, agenticId: null, manifestCid: null }`. Change it to return a `DraftManifest` by omitting the key entirely:

```ts
  const { identity: _dropped, ...rest } = parent;
  void _dropped;
  return { ...rest, /* keep the existing wallet/provenance stripping unchanged */ };
```

In `web/src/app/api/publish/route.ts`, the `recordLocally` block from Task 3 Step 3 now has dead `??` fallbacks. Simplify:

```ts
        ensName: report.manifest.identity.ens,
        manifestCid: report.manifest.identity.manifestCid,
        tokenId: report.manifest.identity.agenticId.tokenId,
```

Also change the route's request body schema from `zManifest` to `zDraftManifest` — the Studio posts a plan, not a published app.

- [ ] **Step 5: Fix the fallout**

Run `cd web && pnpm run typecheck` and work the list. Every error is one of three shapes, and each has one correct fix:

| error | fix |
|---|---|
| `'identity.ens' is possibly 'null'` | delete the null branch and its copy — the state cannot occur |
| `Property 'identity' is missing` on a draft | the value is a `DraftManifest`; change the annotation, do not add a null identity |
| `'manifest' is possibly 'null'` (from Task 5) | branch on `entry.unavailable` and render the reason; never substitute a value |

Named sites: `app-card-face.tsx:123-125`, `app-wheel-card.tsx:107-111`, `registry-grid.tsx:359-385`, `publish-panel.tsx:316-411`, `app-runtime.tsx:311-314`, `store.ts:592, 741, 794, 1214, 1957`.

- [ ] **Step 6: Typecheck and test**

Run: `cd web && pnpm test`
Expected: PASS, including `identity.test.ts`. The `@ts-expect-error` now suppresses a real error.

- [ ] **Step 7: Commit**

```bash
git add -A web
git commit -m "Make identity required, so an unpublished app cannot be expressed"
```

---

## Task 8: Delete the branches that described the deleted states

**Files:**
- Modify: `web/src/components/board/publish-panel.tsx`
- Modify: `web/src/components/registry/registry-grid.tsx`
- Modify: `web/src/app/registry/page.tsx`
- Modify: `web/src/components/registry/fork-dialog.tsx`
- Modify: `web/src/lib/store.ts`

- [ ] **Step 1: Delete `AppPublishPanel`**

In `publish-panel.tsx`, delete `type Stage` and the whole `AppPublishPanel` function (lines 483-720) plus the section banner comment above it (455-482). Keep `Row`, `PriceField`, `PublishForecast` and `PublishReceipt`. Update the file's header comment: it currently explains why the module is shared between two publish surfaces, and there is one now — say that the Studio is the only publish surface because publishing is the only way an app is created.

- [ ] **Step 2: Delete `publishExisting`**

In `store.ts`, delete `publishExisting` (line 776 through its close) and change `forkApp` to `forkToDraft` returning a `DraftManifest` with no board write — delete the `set({ apps: ... })` call inside it and return the manifest instead. Update `publishLines` (line 582) to drop its two-case comment about `publishApp` vs `publishExisting`.

- [ ] **Step 3: Change what a failed publish means**

`publishApp` currently builds a `MiniApp` on the offline path so the app survives locally. It must not: nothing was created.

In `store.ts`, in `publishApp`, before the `const app: MiniApp = {...}` construction (line ~677), add:

```ts
  // Nothing was created. Before the published-only change this path kept a
  // local, unnamed app; there is no such thing now, so the draft stays in the
  // Studio and the board is untouched.
  if (offline) {
    push(...publishLines(name, wire, "publish failed — nothing was created"));
    return { app: null, warnings, ens, manifestCid, agenticIdTokenId, offline, refused: null };
  }
```

Change `PublishOutcome.app` to `MiniApp | null` and update its doc comment (line ~495) to say the app is null whenever `offline` or `refused` is set, because in both cases no app exists.

In `publish-panel.tsx`, in `PublishReceipt`, change the offline `Fig` text (line ~349) from `"kept local — the publish request failed"` to:

```tsx
              : "nothing was created — your draft is still in the Studio"
```

- [ ] **Step 4: Point the fork dialog at the Studio**

In `fork-dialog.tsx`, replace the `forkApp` call with `forkToDraft`, and on success `router.push("/registry?draft=" + encodeURIComponent(name))` so the Studio opens holding the draft. Rewrite the header comment's last paragraph: forking still publishes nothing, and now lands in the Studio rather than on the board.

- [ ] **Step 5: Delete the unpublished disclosure**

In `registry-grid.tsx`, delete the `RegistryLegend` export and the disclosure blocks at lines ~192-273 and the comment at 359-362. Remove `RegistryLegend` from `app/registry/page.tsx`'s import and JSX.

- [ ] **Step 6: Render the three board states**

In `registry-grid.tsx`, read `boardStatus`, `boardError` and `mocked` from `useBoard()` and render, before the grid:

```tsx
{board.boardStatus === "reading" ? (
  <p className="mono text-[0.625rem] text-[var(--muted-ink)]">reading the registry…</p>
) : board.boardStatus === "failed" ? (
  <p className="mono text-[0.625rem]" style={{ color: "var(--loss)" }}>
    the registry could not be read — {board.boardError}
  </p>
) : board.apps.length === 0 ? (
  <p className="mono text-[0.625rem] text-[var(--muted-ink)]">
    no apps registered under {board.parent} yet — describe one above
  </p>
) : null}
{board.mocked ? (
  <p className="mono text-[0.625rem]" style={{ color: "var(--risk)" }}>
    a backend is mocked, so this board is this process&apos;s memory and not a chain
  </p>
) : null}
```

- [ ] **Step 7: Write the two behaviour tests this task's changes need**

Add to `web/src/lib/identity/board.test.ts` (it already runs in the suite):

```ts
describe("forkToDraft", () => {
  it("produces a plan with no identity key at all", () => {
    const parent = {
      name: "parent-app",
      identity: { ens: "p.atlas-apps.eth", manifestCid: "bafk", agenticId: { chain: "0g", contract: "0x0", tokenId: 3 } },
      agency: { tier: "autonomous", policy: { wallet: "0xabc" } },
      provenance: { model: "gpt-5" },
    } as unknown as Manifest;

    const draft = forkToDraft(parent, "child-app");

    assert(!("identity" in draft), "not a null identity — no identity key");
    assertEqual(draft.forkedFrom, "parent-app", "attribution survives the fork");
    assertEqual(
      (draft as { agency: { policy: { wallet: string | null } } }).agency.policy.wallet,
      null,
      "a fork never inherits the parent's wallet (prd §5)",
    );
  });
});

describe("publishApp on a failed POST", () => {
  itAsync("creates no app", async () => {
    const before = boardSnapshot().apps.length;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    try {
      const out = await publishApp({ name: "ghost" } as unknown as DraftManifest);
      assertEqual(out.app, null, "a failed publish creates nothing");
      assertEqual(out.offline, true, "and says so");
      assertEqual(boardSnapshot().apps.length, before, "the board is untouched");
    } finally {
      globalThis.fetch = original;
    }
  });
});
```

Add the imports these need: `forkToDraft`, `publishApp`, `boardSnapshot` from `@/lib/store`, and `DraftManifest` from `@/lib/contracts/manifest`.

- [ ] **Step 8: Typecheck, lint, test**

Run: `cd web && pnpm test && pnpm run lint`
Expected: PASS, including both new tests.

- [ ] **Step 9: Commit**

```bash
git add -A web/src
git commit -m "Delete the panels and copy that described states an app can no longer be in"
```

---

## Task 9: Rewrite the two tests that imported the corpus

**Files:**
- Modify: `web/src/lib/ratings.test.ts`
- Modify: `web/src/lib/seed-to-a2ui-shape.test.ts`

- [ ] **Step 1: Give `ratings.test.ts` its own fixtures**

The file's whole point (its header, lines 1-35) is that a *display total* must never answer "did YOU run it". That distinction survives the seed deletion and gets sharper — `stats.runs` now opens at 0 for every app, so build a fixture that sets `stats.runs` to a non-zero value explicitly and assert it still grants no weight.

Replace the `SEED_APPS` and `isSeededReview` import with a local fixture:

```ts
const APP: MiniApp = {
  manifest: { name: "fixture-app", agency: { tier: "readonly" } } as unknown as Manifest,
  entry: { registered: {}, manifest: null, address: null, mutuallyVerified: false, unavailable: null } as unknown as BoardEntry,
  running: false,
  lastRunAt: null,
  journal: [],
  reviews: [],
  stats: {
    runs: 1204, // deliberately non-zero: the whole point is that this grants nothing
    forks: 0,
    spentUsd: 0,
    thumbsUp: 0,
    thumbsDown: 0,
    sourcesQueried: 0,
    sourcesHealthy: 0,
    costPerRunUsd: 0,
  },
};
```

Delete any test that asserted on `isSeededReview` — there are no seeded reviews.

- [ ] **Step 2: Give `seed-to-a2ui-shape.test.ts` its own fixtures**

Rename the file to `web/src/lib/a2ui-shape.test.ts` (`git mv`), delete the `SEED_APPS` and `SEED_EPOCH` imports, and drive the shape assertions off two or three hand-written `UiDoc` fixtures covering the block kinds the original iterated over. Update the import in `all.test.ts`.

- [ ] **Step 3: Run the suite**

Run: `cd web && pnpm test`
Expected: PASS. Confirm the run reports a test count close to the previous one — a large drop means tests were deleted rather than rehomed.

- [ ] **Step 4: Verify the corpus is gone**

Run: `cd web && grep -rn "SEED_APPS\|SEEDED_REVIEW_IDS\|isSeededReview\|valueTransactedUsd\|earnedUsd\|publishExisting\|AppPublishPanel" src packages/atlas-kit/src`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add -A web/src
git commit -m "Rebuild the two suites that ran against the seed corpus"
```

---

## Task 10: Fold the published strip into the board

**Files:**
- Modify: `web/src/components/registry/published-strip.tsx`
- Modify: `web/src/app/registry/page.tsx`

- Delete: `web/src/app/api/registry/published/route.ts`

Task 2 of `docs/superpowers/plans/2026-07-26-published-strip-live-enumeration.md` shipped as `0ff5c0e` before this plan was written; its Task 3 is superseded by this one. Mark Task 3 superseded in that file with a line pointing here, and tick Task 2 as done.

- [ ] **Step 1: Delete the constant, the separate fetch, and the sibling route**

The strip now reads `useBoard()` — the same `BoardEntry[]` the grid renders — so `/api/registry/published` has no consumer left:

```bash
git rm web/src/app/api/registry/published/route.ts
```

Confirm nothing else called it before committing:

```bash
cd web && grep -rn "registry/published" src
```
Expected: no output.

In `published-strip.tsx`, delete `PUBLISHED_LABELS`, the catalog fetch and the per-row `GET /api/resolve` effect, and read the entries from `useBoard()` instead. Two components resolving the same names twice is the drift this whole change removes.

- [ ] **Step 2: Rewrite the doc comment**

The current comment hardcodes arithmetic — "the five subnames that actually exist", "only TWO have bytes any public gateway can serve". Both are wrong the moment the list is live, and a fixed denominator in a comment is the same error the comment already spends a paragraph correcting. Replace the whole header with:

```tsx
/**
 * THE RESOLUTION DETAIL for the apps on the board.
 *
 * This used to be the one honest surface on the Registry page — a hand-written
 * list of five labels, resolved live, sitting above a grid of sixteen seed apps
 * that were published nowhere. The grid is gone and the board is the registry
 * now, so there is no longer a distinction for this component to draw: it
 * renders the per-record resolution detail (addr, contenthash, the ENSIP-25
 * binding, whether the two directions agree) for entries the board already
 * holds, and it resolves nothing itself.
 *
 * Every count here is computed from what came back. No number in this file is
 * written down, because the last three that were had all drifted from the chain
 * by the time anyone checked.
 *
 * Reading the colour (prd §6 rule 2 — semantic only, never decorative):
 *
 *   --gain   both directions verified · manifest bytes fetched
 *   --risk   degraded, but a disclosed and expected condition
 *   --loss   a resolve that failed, or a binding that contradicts itself
 *   muted    a record that is simply ABSENT
 *
 * That last discipline is the load-bearing one: a missing record is not a
 * failure, must never be coloured like one, and must never be back-filled with
 * a plausible-looking value.
 */
```

- [ ] **Step 3: Verify in the browser**

Run: `cd web && pnpm dev`, open `/registry`.
Expected: the strip and the grid show the **same** set of names, and the count in the strip's head note equals the number of cards.

- [ ] **Step 4: Run everything**

Run: `cd web && pnpm test && pnpm run lint && pnpm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add -A web/src docs/superpowers/plans
git commit -m "Render the strip and the grid off one registry read"
```

---

## Deferred, and why

- **Repairing the six `graphminis.eth` entries** — phase 2 of the enumeration spec. Spends Sepolia and 0G gas and abandons three tokens, so it is confirmed separately before anything is broadcast. The board works without it; the corpus is three apps instead of six.
- **`MiniAppRegistry.update()` as a product surface** — "publish a revision". Gated on token ownership, which the server holds rather than the user. Fork covers the need.
- **Server-side caching of `/api/registry`** — the route is `no-store` today, so every board load is a full waterfall. Correct before it is fast; measure the real latency in Task 2 Step 3 and open a follow-up if it is bad enough to matter.
