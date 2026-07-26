# Published Names, Live From The Registry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `PUBLISHED_LABELS` list in the Registry page's "Published names" strip with a live enumeration of `MiniAppRegistry` on 0G, filtered to the currently configured ENS parent.

**Architecture:** A new pure library module (`published.ts`) enumerates the registry through an injectable reader and filters by parent. A thin uncached route (`GET /api/registry/published`) exposes it. The strip fetches that route to learn *which* names exist, then resolves each one through the existing `GET /api/resolve/<name>` — so every value in a row still comes off the wire, unchanged.

**Tech Stack:** Next 16.2 (App Router, Cache Components), React 19, viem 2.55, TypeScript, `tsx` test harness (`@/lib/kit/testing`).

Spec: `docs/superpowers/specs/2026-07-26-published-strip-live-enumeration-design.md`

## Global Constraints

- All commands run from `web/`. The repo root is one level up.
- **Never** `export const dynamic = "force-dynamic"` — Next 16.2 removes it under Cache Components. See `web/src/app/api/publish/route.ts:22`. A handler that takes `request` is dynamic already.
- Tests use `describe` / `it` / `itAsync` / `assert` / `assertEqual` from `@/lib/kit/testing`. There is no Jest, no Vitest, no DOM harness. Every new test file must be imported by `web/src/lib/agency/all.test.ts` or it does not run.
- `pnpm test` runs `tsc --noEmit` **first** and then the suite. Both halves, always — `tsx` strips types and never type-checks.
- No network in unit tests. Use the injected-seam idiom already used by `web/src/lib/coverage/registry.test.ts` (`fetchImpl`).
- The ENS parent is never hardcoded. It comes from `getEnsBackend().parent`.
- No fallback list anywhere. If the registry cannot be read, the UI says so and renders zero rows.
- Reading the registry needs only `ZEROG_REGISTRY_ADDRESS` and `ZEROG_RPC`. It must **not** be gated on `agenticIdConfig().mode`, which is `"mock"` whenever `ZEROG_DEPLOYER_KEY` is absent — a signing concern, irrelevant to a read.
- Live values verified against the deployed contract on 2026-07-26: registry `0x093319DbD3c21b037Cb21199e468D3E15A748dA8`, `totalApps() == 9`, of which 3 end in `.atlas-apps.eth`.

---

### Task 1: Enumerate the registry

**Files:**
- Modify: `web/src/lib/identity/agentic-id.ts:229-336` (add two entries to `MINI_APP_REGISTRY_ABI`)
- Create: `web/src/lib/identity/published.ts`
- Create: `web/src/lib/identity/published.test.ts`
- Modify: `web/src/lib/agency/all.test.ts` (register the new test file)

**Interfaces:**
- Consumes: `MINI_APP_REGISTRY_ABI`, `zeroGPublicClient`, `agenticIdConfig` from `@/lib/identity/agentic-id`.
- Produces:
  - `interface RegisteredApp { ensName: string; manifestCid: string; tokenId: number; author: Address; appVersion: string; ensNode: Hex; forkedFrom: Hex | null; registeredAt: number; updatedAt: number; revision: number }`
  - `interface RegistryReader { totalApps(): Promise<bigint>; page(offset: bigint, limit: bigint): Promise<readonly RawAppRecord[]> }`
  - `async function listRegisteredApps(reader?: RegistryReader): Promise<RegisteredApp[]>`
  - `function selectUnderParent(apps: RegisteredApp[], parent: string): { apps: RegisteredApp[]; total: number; retired: number }`
  - `function registryReaderFromEnv(): RegistryReader | null`

- [ ] **Step 1: Add the two missing ABI entries**

The functions exist on the deployed contract (`contracts/src/MiniAppRegistry.sol:295-313`); only the ABI was missing, which is why nothing could call them.

In `web/src/lib/identity/agentic-id.ts`, inside `MINI_APP_REGISTRY_ABI`, insert immediately after the `nameKey` entry and before the closing `] as const;`:

```ts
  {
    // Present on the deployed contract from the start — `_keys` carries the
    // comment "so the registry (prd.md §12) can be enumerated without an
    // indexer during the demo" — but absent from this ABI until now, so
    // nothing could call it and the Registry page shipped a hardcoded list
    // of names instead. See docs/superpowers/specs/2026-07-26-*.
    type: "function",
    name: "totalApps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "page",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      {
        name: "out",
        type: "tuple[]",
        components: [
          { name: "ensName", type: "string" },
          { name: "manifestCID", type: "string" },
          { name: "attestationHash", type: "bytes32" },
          { name: "ensNode", type: "bytes32" },
          { name: "author", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "forkedFrom", type: "bytes32" },
          { name: "appVersion", type: "string" },
          { name: "registeredAt", type: "uint64" },
          { name: "updatedAt", type: "uint64" },
          { name: "revision", type: "uint32" },
        ],
      },
    ],
  },
```

- [ ] **Step 2: Write the failing test**

Create `web/src/lib/identity/published.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd web && pnpm dlx tsx src/lib/identity/published.test.ts
```

Expected: FAIL — `Cannot find module './published'`.

- [ ] **Step 4: Write the implementation**

Create `web/src/lib/identity/published.ts`:

```ts
/**
 * WHO IS PUBLISHED — read off MiniAppRegistry, never off a list.
 *
 * `MiniAppRegistry` keeps `_keys` "so the registry (prd.md §12) can be
 * enumerated without an indexer during the demo". This module is the caller
 * that comment always assumed. Before it existed, the Registry page carried a
 * literal array of five labels while the contract held nine entries and
 * contracts/deployments/ens-sepolia.json held eight — three records of one
 * onchain fact, none of them agreeing.
 *
 * This module knows about the registry and nothing else. It does not resolve
 * ENS, does not fetch manifests and does not decide what a UI should show. The
 * one interpretive step it takes — `selectUnderParent` — is a pure function
 * over a parent supplied by the caller, so the parent is never baked in here
 * either.
 */
import type { Address, Hex, PublicClient } from "viem";
import { MINI_APP_REGISTRY_ABI, agenticIdConfig, zeroGPublicClient } from "./agentic-id";

/** One `AppRecord` tuple exactly as viem decodes it. */
export interface RawAppRecord {
  ensName: string;
  manifestCID: string;
  attestationHash: Hex;
  ensNode: Hex;
  author: Address;
  tokenId: bigint;
  forkedFrom: Hex;
  appVersion: string;
  registeredAt: bigint;
  updatedAt: bigint;
  revision: number;
}

/** The same record, JSON-safe. */
export interface RegisteredApp {
  ensName: string;
  manifestCid: string;
  tokenId: number;
  author: Address;
  appVersion: string;
  ensNode: Hex;
  /** null for an original. A zero word is "no parent", not a parent named zero. */
  forkedFrom: Hex | null;
  /** Unix seconds. */
  registeredAt: number;
  updatedAt: number;
  revision: number;
}

/**
 * The two reads this module needs. An interface rather than a client so the
 * paging logic is testable without a chain — the same seam
 * `src/lib/coverage/registry.test.ts` uses for `fetch`.
 */
export interface RegistryReader {
  totalApps(): Promise<bigint>;
  page(offset: bigint, limit: bigint): Promise<readonly RawAppRecord[]>;
}

const ZERO_WORD = `0x${"00".repeat(32)}`;

/**
 * Rows per `page()` call. The registry holds single digits today; this exists
 * so a registry that grows does not blow the RPC's response limit and
 * silently return a truncated list.
 */
const PAGE_SIZE = 50n;

/**
 * A reader against the configured 0G deployment, or null when no registry
 * address is set.
 *
 * Deliberately NOT gated on `agenticIdConfig().mode`. That flag is "mock"
 * whenever `ZEROG_DEPLOYER_KEY` is absent, because it describes whether we can
 * *sign*. Enumerating is a read: it needs an address and an RPC, and nothing
 * else.
 */
export function registryReaderFromEnv(client?: PublicClient): RegistryReader | null {
  const address = agenticIdConfig().registryAddress;
  if (!address) return null;
  const rpc = client ?? zeroGPublicClient();
  return {
    totalApps: () =>
      rpc.readContract({
        address,
        abi: MINI_APP_REGISTRY_ABI,
        functionName: "totalApps",
      }) as Promise<bigint>,
    page: (offset, limit) =>
      rpc.readContract({
        address,
        abi: MINI_APP_REGISTRY_ABI,
        functionName: "page",
        args: [offset, limit],
      }) as Promise<readonly RawAppRecord[]>,
  };
}

/**
 * Every record in the registry, in registry order — which is publish order,
 * because `_keys` is append-only.
 */
export async function listRegisteredApps(reader?: RegistryReader): Promise<RegisteredApp[]> {
  const source = reader ?? registryReaderFromEnv();
  if (!source) return [];

  const total = await source.totalApps();
  const out: RegisteredApp[] = [];
  let offset = 0n;

  while (offset < total) {
    const rows = await source.page(offset, PAGE_SIZE);
    // A node that truncates or refuses a page must end the loop rather than
    // spin it. Returning what actually arrived is honest; hanging is not.
    if (rows.length === 0) break;
    for (const row of rows) out.push(normalise(row));
    offset += BigInt(rows.length);
  }

  return out;
}

function normalise(row: RawAppRecord): RegisteredApp {
  return {
    ensName: row.ensName,
    manifestCid: row.manifestCID,
    tokenId: Number(row.tokenId),
    author: row.author,
    appVersion: row.appVersion,
    ensNode: row.ensNode,
    forkedFrom: row.forkedFrom === ZERO_WORD ? null : row.forkedFrom,
    registeredAt: Number(row.registeredAt),
    updatedAt: Number(row.updatedAt),
    revision: row.revision,
  };
}

/**
 * The records issued under one parent, plus the denominator.
 *
 * Six of the nine entries on the deployed registry name `graphminis.eth`, the
 * parent this project used before the Atlas rebrand: the ENS records were
 * re-issued under the new parent but the registry entries were never
 * re-registered, and the token→name binding is immutable by design, so they
 * cannot be. They are history. `retired` reports how many were set aside so a
 * caller can say so out loud — dropping them silently would trade one
 * misleading denominator for another.
 *
 * Matching is on the label boundary (`.` + parent), so `notatlas-apps.eth`
 * does not pass as a subname of `atlas-apps.eth`, and the parent itself is not
 * a mini app. Case is folded because ENS names are case-insensitive while
 * `MiniAppRegistry.nameKey` is a raw keccak of the bytes — the contract's own
 * comment says casing is the caller's problem.
 */
export function selectUnderParent(
  apps: RegisteredApp[],
  parent: string,
): { apps: RegisteredApp[]; total: number; retired: number } {
  const suffix = `.${parent.toLowerCase()}`;
  const under = apps.filter((a) => a.ensName.toLowerCase().endsWith(suffix));
  return { apps: under, total: apps.length, retired: apps.length - under.length };
}
```

- [ ] **Step 5: Register the test file in the suite**

In `web/src/lib/agency/all.test.ts`, add after the `import "../coverage/gap.test";` line:

```ts
import "../identity/published.test";
```

- [ ] **Step 6: Run the tests and typecheck**

```bash
cd web && pnpm test
```

Expected: `tsc --noEmit` clean, then the suite reports every `published.test` case passing and exits 0.

- [ ] **Step 7: Verify against the real chain**

The unit tests use a fake reader, so confirm the ABI and paging work against the deployment:

```bash
cd web && pnpm dlx tsx --env-file=.env.local -e '
import { listRegisteredApps, selectUnderParent } from "@/lib/identity/published";
import { getEnsBackend } from "@/lib/identity/ens";
const apps = await listRegisteredApps();
const sel = selectUnderParent(apps, getEnsBackend().parent);
console.log("total", sel.total, "under parent", sel.apps.length, "retired", sel.retired);
for (const a of sel.apps) console.log(" ", a.tokenId, a.ensName, a.manifestCid);
'
```

Expected, as of 2026-07-26:

```
total 9 under parent 3 retired 6
  10 atlas-market-guard.atlas-apps.eth bafkreiagp25njrnk42kixxjo4tctw6v2go23dmo6lzwihg7sfcsiv4opxu
  11 rebalance-arbitrum-dex.atlas-apps.eth bafkreidplmme6wspbpsnfq2rz3l27zej3iv65mi3t7wejov3cphxjwdgru
  13 lineage-fallback-probe.atlas-apps.eth bafkreihjc5hp7t2gozbianry7bzloazq7j75umllzpafq7pwebpjny2oj4
```

If `total` is larger than 9, the registry has grown since this plan was written — that is expected and fine. If `under parent` is 0 while `total` is 9, the ENS parent env var is wrong; stop and check `ENS_PARENT_DOMAIN`.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/identity/published.ts web/src/lib/identity/published.test.ts \
        web/src/lib/identity/agentic-id.ts web/src/lib/agency/all.test.ts
git commit -m "Enumerate MiniAppRegistry instead of trusting a list

totalApps/page were on the deployed contract from the start and missing
from the ABI, so nothing could call them."
```

---

### Task 2: The route

**Files:**
- Create: `web/src/app/api/registry/published/route.ts`
- Test: covered by Task 1's unit tests plus the live check in Step 4 below — this repo has no route-level harness, and the route is deliberately thin enough that all the logic worth testing lives in `published.ts`.

**Interfaces:**
- Consumes: `listRegisteredApps`, `selectUnderParent`, `RegisteredApp` from `@/lib/identity/published`; `getEnsBackend` from `@/lib/identity/ens`; `agenticIdConfig` from `@/lib/identity/agentic-id`.
- Produces: `GET /api/registry/published` →
  ```ts
  {
    parent: string;
    registry: Address | null;
    chainId: number;
    total: number;
    retired: number;
    apps: RegisteredApp[];
  }
  ```
  or, on failure, HTTP 502 `{ error: string }`.

- [ ] **Step 1: Write the route**

Create `web/src/app/api/registry/published/route.ts`:

```ts
/**
 * GET /api/registry/published — which names are actually published.
 *
 * Reads `MiniAppRegistry` on 0G and returns the entries issued under the
 * currently configured ENS parent. This is the list the Registry page's
 * "Published names" strip renders; it used to be a constant in the component,
 * which had drifted from both the contract and
 * contracts/deployments/ens-sepolia.json.
 *
 * `total` is the WHOLE registry and `retired` is how many entries name a
 * different parent — six, at time of writing, all under `graphminis.eth` from
 * before the Atlas rebrand. They are reported rather than dropped silently: a
 * filtered list presented as the whole is the same class of error this route
 * exists to fix.
 *
 * There is deliberately no fallback. If the chain does not answer, this returns
 * 502 and the caller renders nothing — a hardcoded list served during an
 * outage is a lie told at exactly the moment nobody can check it.
 */
import type { NextRequest } from "next/server";
import { agenticIdConfig } from "@/lib/identity/agentic-id";
import { getEnsBackend } from "@/lib/identity/ens";
import { listRegisteredApps, selectUnderParent } from "@/lib/identity/published";

// viem over node http; not edge-safe for the same reasons as /api/publish.
export const runtime = "nodejs";
// Deliberately NOT `export const dynamic = "force-dynamic"`: Next 16 removes
// that option when Cache Components is enabled. Taking `request` opts this
// handler out of static evaluation under either configuration.

export async function GET(request: NextRequest) {
  void request;

  const parent = getEnsBackend().parent;
  const { registryAddress, chainId } = agenticIdConfig();

  try {
    const all = await listRegisteredApps();
    const { apps, total, retired } = selectUnderParent(all, parent);
    return Response.json(
      { parent, registry: registryAddress, chainId, total, retired, apps },
      // The point of this strip is that the list is read, not remembered.
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err), parent },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
```

Note on the no-registry case: `listRegisteredApps` returns `[]` when
`ZEROG_REGISTRY_ADDRESS` is unset, so the route answers 200 with
`apps: [], total: 0` and `registry: null`. That is the honest answer — there is
no registry to enumerate, which is different from one that failed to answer —
and the strip renders it as the empty state in Task 3.

- [ ] **Step 2: Typecheck and lint**

```bash
cd web && pnpm run typecheck && pnpm lint
```

Expected: both clean.

- [ ] **Step 3: Run the dev server**

```bash
cd web && pnpm dev
```

Leave it running for the next step.

- [ ] **Step 4: Verify the route against the live chain**

```bash
curl -s localhost:3000/api/registry/published | python3 -m json.tool
```

Expected: `parent` is `atlas-apps.eth`, `total` is 9, `retired` is 6, and `apps`
has 3 entries — tokens 10, 11 and 13. Confirm `cache-control: no-store` is on
the response:

```bash
curl -sI localhost:3000/api/registry/published | grep -i cache-control
```

- [ ] **Step 5: Verify the failure path returns no list**

Point the RPC at a dead endpoint and confirm the route 502s rather than serving
anything:

```bash
cd web && ZEROG_RPC=http://127.0.0.1:1 pnpm dev
# in another shell:
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/registry/published
```

Expected: `502`. Restore the normal `pnpm dev` afterwards.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/api/registry/published/route.ts
git commit -m "Serve the published set from the registry, filtered to the parent

Reports the unfiltered total alongside it so the six retired-parent
entries are disclosed rather than quietly dropped."
```

---

### Task 3: The strip reads the route

**Files:**
- Modify: `web/src/components/registry/published-strip.tsx` (doc comment 3-70; delete `PUBLISHED_LABELS` and its comment 78-90; props and state 143-165; the resolve effect 186-229; the derived counts and render 231-270; the `readBinding` note at 539)
- Create: `web/src/components/registry/published-strip.guard.test.ts`
- Modify: `web/src/lib/agency/all.test.ts`
- Modify: `web/src/app/registry/page.tsx:27-33` (the comment above `<PublishedStrip />`)

**Interfaces:**
- Consumes: `GET /api/registry/published` from Task 2; `RegisteredApp` from `@/lib/identity/published`.
- Produces: nothing other tasks depend on. `PublishedStrip` keeps its zero-prop call signature.

- [ ] **Step 1: Write the failing guard test**

There is no DOM harness in this repo, so the component's rendering is verified
by hand in Step 8. What *can* be tested — and is the actual regression worth
preventing — is that the list never comes back. Create
`web/src/components/registry/published-strip.guard.test.ts`:

```ts
/**
 * The Published names strip must not carry a list of names.
 *
 * This is a test and not a comment because the thing it prevents already
 * happened: the component shipped with a literal array of five labels while
 * the contract held nine entries and contracts/deployments/ens-sepolia.json
 * held eight. The list is easy to reintroduce — a "temporary" fallback during
 * an RPC outage is the obvious way — and impossible to notice once it is
 * there, because a stale list renders exactly like a fresh one.
 *
 * Path is relative to `web/`, which is where the suite runs from —
 * `pnpm dlx tsx src/lib/agency/all.test.ts`.
 *
 * `aave-guard-fork` is deliberately absent from the list below: the component's
 * doc comment names it while explaining why a name with no registry entry does
 * not appear on the strip. Prose about an incident is not a list of what to
 * render, and this guard is about the latter.
 */
import { readFileSync } from "node:fs";
import { assert, describe, it } from "@/lib/kit/testing";

const SOURCE = readFileSync("src/components/registry/published-strip.tsx", "utf8");

describe("published-strip has no baked-in names", () => {
  it("does not name any of the labels it used to hardcode", () => {
    for (const label of [
      "atlas-market-guard",
      "durable-market-guard",
      "attested-market-guard",
      "wallet-bound-guard",
      "aave-health-guard",
      "rebalance-arbitrum-dex",
      "lineage-fallback-probe",
    ]) {
      assert(!SOURCE.includes(label), `${label} must not appear in the component`);
    }
  });

  it("does not mention the parent domain", () => {
    // The parent comes from the server, which reads it from config. A literal
    // here would survive a rebrand the way the last one did.
    assert(!SOURCE.includes("atlas-apps.eth"), "no parent literal");
    assert(!SOURCE.includes("graphminis.eth"), "no retired parent literal");
  });

  it("reads its list from the registry route", () => {
    assert(SOURCE.includes("/api/registry/published"), "the strip must call the enumeration route");
  });
});
```

- [ ] **Step 2: Register it and run it to verify it fails**

Add to `web/src/lib/agency/all.test.ts`, after the `published.test` import:

```ts
import "@/components/registry/published-strip.guard.test";
```

Then:

```bash
cd web && pnpm dlx tsx src/lib/agency/all.test.ts
```

Expected: FAIL — `atlas-market-guard must not appear in the component` (and the
other labels), because `PUBLISHED_LABELS` is still there.

- [ ] **Step 3: Replace the doc comment**

In `web/src/components/registry/published-strip.tsx`, replace the entire block
comment at lines 3-70 with:

```tsx
/**
 * THE PUBLISHED STRIP — the subnames that actually exist.
 *
 * The list of names is read from `GET /api/registry/published`, which
 * enumerates `MiniAppRegistry` on 0G and filters to the configured ENS parent.
 * Each name is then resolved through `GET /api/resolve/<name>` on mount.
 * Nothing about the set is stored in this file, and there is no fallback: if
 * either call fails the strip says so and renders no rows.
 *
 * That is a correction, not a preference. This file used to carry a literal
 * array of five labels, defended in this comment as "a fact about the parent
 * name, not data". It had drifted from every other record of the same fact —
 * the contract held nine entries, contracts/deployments/ens-sepolia.json held
 * eight — and three of the five it did show had manifests that no longer
 * fetch. See docs/superpowers/specs/2026-07-26-published-strip-live-
 * enumeration-design.md.
 *
 * ## What it proves (prd.md §5, §8, §14 #8 and #9)
 *
 * That an ENS name here is not a label but an executable, fundable artifact.
 * One lookup returns `addr` — the address the name points at, which is what §8
 * says you verify *before* funding rather than the proof that you should — plus
 * `contenthash` → the manifest CID, the ENSIP-25 `agent-registration` binding
 * to an Agentic ID token on 0G, and the two-directional check that says
 * whether the name and the token agree about each other. The manifest at that
 * CID is a *plan*, so a resolved name re-runs against live subgraph data; that
 * is the difference between a resolved mini app and a cached screenshot.
 *
 * ## What it does NOT prove, and does not claim
 *
 * - It is not a health check of the app behind the name. Nothing here runs a
 *   query, composes a surface or reads a subgraph. Resolution only.
 * - "manifest fetched" means *this server* reached the bytes at that CID on
 *   this request. It is not a claim that a public gateway holds them. Some
 *   names were published while `IPFS_MODE=local`, whose store was the sole
 *   provider of their bytes; those bytes are gone and `ipfs.io` returns 504 for
 *   their CIDs permanently, because a CID is the hash of its bytes and
 *   regenerating the manifest yields a different one that no longer matches the
 *   chain. `IPFS_MODE` is now `pinata` so it cannot recur. Which names are
 *   affected is not asserted here — the row says whether the fetch worked on
 *   this request, and that is the only honest count.
 * - A row says nothing about whether the wallet at `addr` is funded, or what
 *   the app is allowed to spend. Policy lives with the running app.
 * - **It does not prove anyone holds the key for `addr`.** A resolver returns
 *   whatever address the record names; custody is not a property of a record.
 *   That is not pedantry here — these names were issued across more than one
 *   signer regime, and `POST /api/agency/register` now returns a single
 *   process-wide session key for every app, which matches only one of these
 *   records. So `addr` is "the address this name points at", and the stronger
 *   reading — "the address you should fund" — is exactly the one §8 says a
 *   human must verify rather than assume. `app-runtime.tsx` can make that
 *   comparison for an app on the board, because it knows the server's signer;
 *   this strip resolves arbitrary names and cannot.
 * - It does not show every name ever issued under the parent. It shows what is
 *   in the registry. A name whose ENS records landed but whose registry write
 *   did not — `aave-guard-fork`, whose `registerFork` reverted `ParentUnknown`
 *   — is absent, and correctly so: it was never published. The incident is
 *   recorded in contracts/deployments/ens-sepolia.json.
 *
 * ## Reading the colour (prd §6 rule 2 — semantic only, never decorative)
 *
 *   --gain   both directions verified · manifest bytes fetched
 *   --risk   degraded, but a disclosed and expected condition
 *   --loss   a resolve that failed, or a binding that contradicts itself
 *   muted    a record that is simply ABSENT
 *
 * The last one is the important discipline: a missing record is not a failure
 * and must never be coloured like one, and must never be back-filled with a
 * plausible-looking value. A name with no `addr` reads "no addr record" — it
 * does not read as an address.
 *
 * Depth (prd §6 rule 1, as shipped): this strip cannot act on anything, so it
 * sits flush in the readonly groove. Depth is reserved for agency, and reading
 * records is not agency.
 */
```

- [ ] **Step 4: Delete the constant and swap the imports**

Delete lines 78-90 entirely (the `PUBLISHED_LABELS` doc comment and the array).

Change the `useEffect, useMemo, useState` import on line 72 to drop `useMemo`:

```tsx
import { useEffect, useState } from "react";
```

Add the catalog type import beside the existing type import on line 73:

```tsx
import type { IdentityStatus, ResolveReport } from "@/lib/identity/publish";
import type { RegisteredApp } from "@/lib/identity/published";
```

- [ ] **Step 5: Add the catalog state and effect**

Add this type beside `RowState` (after line 105):

```tsx
/**
 * The name list itself is a network call, so it has the same three states the
 * rows do. `failed` carries the route's own message: a registry that will not
 * answer is information, and substituting a remembered list for it is the
 * exact bug this component was rewritten to remove.
 */
type CatalogState =
  | { phase: "loading" }
  | { phase: "failed"; reason: string }
  | { phase: "ready"; parent: string; apps: RegisteredApp[]; total: number; retired: number };
```

Replace the component's signature and the `labelKey` / `list` / `rows` block
(lines 143-164) with:

```tsx
export function PublishedStrip({ className }: { className?: string }) {
  /* The set of names, read from the registry. There is no prop to override it
     and no default to fall back to — either the chain answers or the strip
     says it did not. */
  const [catalog, setCatalog] = useState<CatalogState>({ phase: "loading" });

  /* Results are keyed by name, so a row that has not landed yet needs no
     stored placeholder — absence IS the loading state. */
  const [rows, setRows] = useState<ReadonlyMap<string, RowState>>(new Map());
  const [chain, setChain] = useState<ChainRef | null>(null);
```

Add this effect immediately after the existing `/api/publish` effect (after
line 184):

```tsx
  /* Which names exist. Read once per mount from the registry rather than
     compiled into this file. */
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/registry/published", {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        const body: unknown = await res.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!res.ok) {
          const message =
            body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
              ? (body as { error: string }).error
              : `registry returned HTTP ${res.status}`;
          setCatalog({ phase: "failed", reason: message });
          return;
        }
        const parsed = body as {
          parent?: unknown;
          apps?: unknown;
          total?: unknown;
          retired?: unknown;
        } | null;
        if (!parsed || !Array.isArray(parsed.apps) || typeof parsed.parent !== "string") {
          setCatalog({ phase: "failed", reason: "the registry route returned an unexpected body" });
          return;
        }
        setCatalog({
          phase: "ready",
          parent: parsed.parent,
          apps: parsed.apps as RegisteredApp[],
          total: typeof parsed.total === "number" ? parsed.total : parsed.apps.length,
          retired: typeof parsed.retired === "number" ? parsed.retired : 0,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setCatalog({ phase: "failed", reason: reasonOf(err) });
      }
    })();
    return () => controller.abort();
  }, []);
```

- [ ] **Step 6: Rewrite the resolve effect and the render**

Replace the existing resolve effect (lines 186-229) with one keyed off the
catalog. Note it resolves the **fully qualified** `ensName` — `/api/resolve`
accepts either form (`src/app/api/resolve/[name]/route.ts:3`), and passing the
whole name means the strip never rebuilds a name from a label plus an assumed
parent:

```tsx
  const names = catalog.phase === "ready" ? catalog.apps.map((a) => a.ensName) : [];
  const nameKey = names.join(",");

  useEffect(() => {
    if (nameKey === "") {
      setRows(new Map());
      return;
    }
    const controller = new AbortController();
    setRows(new Map());

    /* Independent lookups, each landing on its own. One slow name must not
       hold the others back, and one dead name must not blank the strip. */
    for (const name of nameKey.split(",")) {
      void (async () => {
        const settle = (state: RowState) => {
          if (controller.signal.aborted) return;
          setRows((prev) => new Map(prev).set(name, state));
        };
        try {
          const res = await fetch(`/api/resolve/${encodeURIComponent(name)}`, {
            signal: controller.signal,
            headers: { accept: "application/json" },
          });
          const body: unknown = await res.json().catch(() => null);
          if (!res.ok) {
            const message =
              body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
                ? (body as { error: string }).error
                : `resolver returned HTTP ${res.status}`;
            settle({ phase: "failed", reason: message, status: res.status });
            return;
          }
          if (!body || typeof body !== "object") {
            settle({ phase: "failed", reason: "resolver returned a body that is not JSON", status: res.status });
            return;
          }
          settle({ phase: "resolved", report: body as ResolveReport });
        } catch (err) {
          if (controller.signal.aborted) return;
          settle({ phase: "failed", reason: reasonOf(err), status: null });
        }
      })();
    }

    return () => controller.abort();
  }, [nameKey]);
```

Replace the whole `return (...)` block (lines 236-270) with:

```tsx
  const states = names.map((name) => rows.get(name) ?? { phase: "loading" as const });
  const pending = states.filter((s) => s.phase === "loading").length;
  const resolved = states.filter((s) => s.phase === "resolved").length;

  const note =
    catalog.phase === "loading"
      ? "reading the registry"
      : catalog.phase === "failed"
        ? "registry did not answer"
        : names.length === 0
          ? "nothing registered under this parent"
          : pending > 0
            ? `${names.length} names · reading`
            : `${resolved} of ${names.length} resolved · read live on mount`;

  const busy = catalog.phase === "loading" || pending > 0;

  return (
    <section className={cn(panelClass("readonly", "mt-4"), className)}>
      <div className="px-3 pt-3 sm:px-4">
        <SectionHead
          title="Published names"
          note={note}
          right={busy ? <LiveDot label="resolving" /> : undefined}
        />
      </div>

      {catalog.phase === "failed" ? (
        /* The route's own words. No list is rendered — a remembered set served
           during an outage is a claim nobody can check at the moment they most
           need to. */
        <p className="px-3 pt-2 pb-3 text-[0.6875rem] leading-snug sm:px-4">
          <Fig accent="loss" className="text-[0.6875rem] uppercase tracking-[0.06em]">
            registry unreadable
          </Fig>{" "}
          <span className="text-[var(--muted-ink)]">{catalog.reason}</span>
        </p>
      ) : catalog.phase === "ready" && names.length === 0 ? (
        <p className="px-3 pt-2 pb-3 text-[0.6875rem] leading-snug text-[var(--muted-ink)] sm:px-4">
          No apps are registered under <span className="mono">{catalog.parent}</span> yet. Publishing one from
          the Studio adds it here — this list is read from the registry, not maintained by hand.
        </p>
      ) : (
        <ul className="px-3 sm:px-4">
          {names.map((name, i) => (
            <NameRow key={name} label={name} state={states[i]} chain={chain} first={i === 0} />
          ))}
        </ul>
      )}

      <p className="border-t border-hairline px-3 pt-2 pb-3 text-[0.6875rem] leading-snug text-[var(--muted-ink)] sm:px-4">
        The set of names comes from <span className="mono">GET /api/registry/published</span>, which enumerates
        MiniAppRegistry on 0G; each one is then read live from{" "}
        <span className="mono">GET /api/resolve/&lt;name&gt;</span> on mount. Nothing here is stored, and a record
        that is absent from the name renders as absent.
        {catalog.phase === "ready" && catalog.retired > 0 ? (
          <>
            {" "}
            {catalog.retired} of {catalog.total} registry entries name a different parent — they were registered
            before the rename and the token↔name binding is immutable by design, so they cannot be re-pointed.
            They are not shown.
          </>
        ) : null}{" "}
        The CID and the wallet are shown rather than linked: <span className="mono">GET /api/publish</span> reports
        the IPFS mode but no public gateway base, and an <span className="mono">addr</span> record carries no chain
        id, so either link would have to be guessed.
      </p>
    </section>
  );
}
```

- [ ] **Step 7: Correct the `readBinding` note**

The "ens side only" disclosure currently blames the token alone. The registry
entry is stale too, and that is the leg that actually fails. In
`readBinding`, replace the `note` string in the
`ensAssertsToken && !tokenAssertsName && !registryAssertsName` branch (line 539)
with:

```tsx
      note: `The name asserts token ${tokenId ?? "?"}, but that token's registry entry carries the parent it was minted under, not this one, so MiniAppRegistry.verify() rejects the pair. Both bindings are immutable by design — prd §14 #13 discloses this, it is not a break.`,
```

- [ ] **Step 8: Update the call site comment**

In `web/src/app/registry/page.tsx`, replace the comment at lines 27-33 with:

```tsx
        {/* The names that are actually registered under the current ENS
            parent, enumerated from MiniAppRegistry on every mount rather than
            listed in the component. This sits above the grid on purpose: the
            grid's apps are unpublished, so the only names on this page that
            resolve should be the ones a judge can verify. It is also the app's
            only caller of `GET /api/resolve` — prd.md §5 argues a resolved name
            is a live plan and not a screenshot, and until this mounted, nothing
            in the product exercised that claim. */}
```

- [ ] **Step 9: Run the guard test, the suite and the linter**

```bash
cd web && pnpm test && pnpm lint
```

Expected: typecheck clean, every guard case passes, lint clean.

- [ ] **Step 10: Verify in the browser**

```bash
cd web && pnpm dev
```

Load `http://localhost:3000/registry` and confirm:

1. The strip renders exactly the rows the route returned in Task 2 Step 4 — three today, tokens 10, 11 and 13.
2. The head note settles on `3 of 3 resolved · read live on mount`.
3. The footer states that 6 of 9 registry entries name a different parent.
4. No row shows a name that is not in the `curl` output.

Then confirm the failure path renders nothing rather than something:

```bash
cd web && ZEROG_RPC=http://127.0.0.1:1 pnpm dev
```

Reload `/registry`. Expected: the head note reads `registry did not answer`, the
body shows `registry unreadable` with the RPC's error text, and **no name rows
appear at all**. Restore the normal `pnpm dev`.

- [ ] **Step 11: Commit**

```bash
git add web/src/components/registry/published-strip.tsx \
        web/src/components/registry/published-strip.guard.test.ts \
        web/src/app/registry/page.tsx web/src/lib/agency/all.test.ts
git commit -m "Read the published names off the registry, not out of this file

Deletes PUBLISHED_LABELS and the labels prop. Adds a guard test, because
the list is easy to reintroduce as an outage fallback and impossible to
notice once it is back: a stale list renders exactly like a fresh one."
```

---

### Task 4: Re-publish the three lost manifests

**This task spends real gas on Sepolia and 0G Galileo and abandons three Agentic
ID tokens. Get explicit confirmation before running anything without
`--dry-run`.**

**Files:**
- Run: `web/scripts/publish-under-parent.ts` (exists; no new script needed)
- Modify: `contracts/deployments/ens-sepolia.json`

**Interfaces:**
- Consumes: `GET /api/resolve/<label>` for read-back; the strip from Task 3 for visual confirmation.
- Produces: three new registry entries under `atlas-apps.eth`, which Task 3's strip picks up with no code change — that is the point.

**Why new tokens.** `MiniAppRegistry.register` reverts `TokenAlreadyBound` when
`nameKeyOf[tokenId]` is set (`contracts/src/MiniAppRegistry.sol:176`), and
`AgenticId._bindEnsName` reverts `EnsNameAlreadyBound`. Tokens 5, 6 and 7 are
bound to their `*.graphminis.eth` keys and cannot be moved — the contract
comment states the intent: "a token that already answers to a name cannot be
re-pointed, because that would silently change what a funded name means."

**What is lost.** The original manifests for these three are unrecoverable —
their bytes were only ever in the gitignored local store, and a CID is the hash
of its bytes. `publish-under-parent.ts` regenerates a manifest from an intent
through the real planner, so these come back as *fresh plans for the same
intent*, not restorations. Say so in the deployments note.

- [ ] **Step 1: Dry-run the first name**

```bash
cd web && pnpm dlx tsx --env-file=.env.local scripts/publish-under-parent.ts \
  --name=attested-market-guard --dry-run \
  --intent="Watch lending market health and liquidation risk across Aave and Compound on Arbitrum, and alert me when a position approaches its threshold."
```

Expected: the script prints the assembled manifest and the records it would
write, and exits without broadcasting. If it errors because the subname already
exists, stop and report — that is a real finding about the publish path and it
changes this task.

- [ ] **Step 2: Publish it for real**

Drop `--dry-run`:

```bash
cd web && pnpm dlx tsx --env-file=.env.local scripts/publish-under-parent.ts \
  --name=attested-market-guard \
  --intent="Watch lending market health and liquidation risk across Aave and Compound on Arbitrum, and alert me when a position approaches its threshold."
```

Record the new token id, the new CID and every transaction hash from the output.

- [ ] **Step 3: Read it back before touching the next one**

```bash
curl -s localhost:3000/api/resolve/attested-market-guard | python3 -c '
import json,sys
r=json.load(sys.stdin)
print("name        ", r["name"])
print("addr        ", r["address"])
print("cid         ", r["manifestCid"])
print("manifest    ", "fetched" if r["manifest"] else "NOT FETCHED")
print("verification", r["verification"])
'
```

Required before continuing: `manifest` is `fetched`, `address` is not null, and
`verification.mutuallyVerified` is `true`. If any of those fail, stop and report
— do not publish the other two on top of a broken first one.

- [ ] **Step 4: Repeat for `wallet-bound-guard`**

```bash
cd web && pnpm dlx tsx --env-file=.env.local scripts/publish-under-parent.ts \
  --name=wallet-bound-guard --dry-run \
  --intent="Track the wallet's own positions across Arbitrum and Optimism and alert me when its exposure to any one protocol crosses a threshold."
```

Then without `--dry-run`, then the Step 3 read-back with
`wallet-bound-guard`. Same gate: all three checks pass before moving on.

- [ ] **Step 5: Repeat for `aave-health-guard`**

```bash
cd web && pnpm dlx tsx --env-file=.env.local scripts/publish-under-parent.ts \
  --name=aave-health-guard --dry-run \
  --intent="Watch my Aave health factor on Arbitrum and alert me before it approaches liquidation."
```

Then without `--dry-run`, then the read-back. This is the name that has never
had an `addr` record, so check `address` is non-null with particular care.

- [ ] **Step 6: Confirm the strip picked them up with no code change**

Reload `http://localhost:3000/registry`.

Expected: six rows, all six with `both directions` in `--gain`, all six showing
`manifest fetched`. The footer's retired count is still 6 of 12 — the three old
`graphminis.eth` entries remain in the registry and remain filtered out, which
is correct.

If the strip needed a code change to show them, Task 3 has a bug — that is the
whole test of this design.

- [ ] **Step 7: Update the deployments record**

In `contracts/deployments/ens-sepolia.json`:

1. Add the three new entries to `issuedSubnames` with their new token ids, CIDs and tx hashes.
2. Add a note recording that tokens 5, 6 and 7 are orphaned: still minted, still bound to their `*.graphminis.eth` keys, no longer asserted by any live ENS name.
3. Rewrite `manifestAvailability`: move the three names from `contenthashSetButBytesLost` to `resolves`, and note that the restored manifests are fresh plans for the same intent, not the original bytes, which are unrecoverable.
4. Correct `issuedSubnamesNote` to say the file is a record of *what happened*, and that the live list is now enumerated from MiniAppRegistry by `GET /api/registry/published` — so this file is no longer anything's source of truth.

- [ ] **Step 8: Commit**

```bash
git add contracts/deployments/ens-sepolia.json
git commit -m "Re-publish the three names whose manifest bytes were lost

New tokens, because the old ones are immovably bound to *.graphminis.eth.
Fresh plans for the same intents — the original bytes are unrecoverable,
and a CID is the hash of its bytes."
```

---

## Verification checklist

- [ ] `cd web && pnpm test` passes (typecheck + suite).
- [ ] `cd web && pnpm lint` clean.
- [ ] `grep -rn "PUBLISHED_LABELS" web/src` returns nothing.
- [ ] `curl -s localhost:3000/api/registry/published` row count equals what the strip renders.
- [ ] With a dead `ZEROG_RPC`, the strip renders zero name rows and an explicit failure line.
- [ ] After Task 4, every row on `/registry` reads `both directions` and `manifest fetched`.
