# App Drawer Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the agent-composed part of a mini app visually identifiable, by putting the hand-written panels behind tabs, giving every duplicated fact exactly one owner, and labelling the composed body.

**Architecture:** A persistent spine (policy strip, header, receipts) renders above a tab strip; five tab bodies hold what used to be seven stacked panels. `REQUIRED_FOR_AUTONOMOUS` is re-read as "on screen" rather than "in the document" via a new `providedByHost` prop, which lets `policy_badge`, `trade_log` and `kill_switch` leave the composed document without the renderer re-appending them. The sections are lifted out of the 1155-line `app-runtime.tsx` and passed to one of two layout components as ready-built elements.

**Tech Stack:** Next.js 16 (React 19), TypeScript, Tailwind v4. Tests are a dependency-free harness (`@/lib/kit/testing`) run under `tsx`.

## Global Constraints

- Working directory for every command is `web/`.
- Full verification is `pnpm test` — which is `pnpm run typecheck && pnpm dlx tsx src/lib/agency/all.test.ts`. There is no watch mode and no single-test filter; the suite runs whole and prints `N/M passing`.
- There is **no DOM, no jsdom and no testing-library** in this repo, and this plan does not add any. Only pure functions get tests. Anything requiring a rendered tree is verified by `tsc --noEmit` plus manual check.
- Every new test file must be imported by `src/lib/agency/all.test.ts` or it never runs.
- Path aliases: `@/lib/kit/*` → `packages/atlas-kit/src/kit/*`, `@/lib/contracts/*` → `packages/atlas-kit/src/contracts/*`, `@/*` → `src/*`. Order matters in `tsconfig.json`; do not reorder.
- Layering: `src/` may import from `packages/atlas-kit`. The reverse is forbidden — do not add an import of `@/lib/seed` inside `packages/atlas-kit`.
- `AGENTS.md`: this is Next.js 16 with breaking changes from older versions. Read `node_modules/next/dist/docs/` before writing any Next-specific code. This plan touches no routing or server code, so that should not arise.
- Do not add dependencies. Do not modify `package.json` or the lockfile.
- Comment style in this codebase is unusually dense and explains *why a wrong version was wrong*. Match it in files you touch; do not strip existing comments when moving code — move them with the code.

**Deviation from the spec, deliberate:** the spec's file table put `tabsFor()` in `board/app-sections.tsx`. Pure logic cannot live in a `.tsx` file here, because the test harness runs under `tsx` with no DOM and importing React components into a test would pull in the renderer. So all pure logic goes in a new **`src/lib/app-view.ts`** (no JSX, no React import) and `board/app-sections.tsx` holds only the two layout components. Same decomposition, one extra file.

---

### Task 1: `app-view.ts` — the pure logic, with tests

Creates the module three later tasks import from. Nothing changes on screen: `missingRequired` reproduces the existing inline computation exactly, and no caller passes `providedByHost` yet.

**Files:**
- Create: `src/lib/app-view.ts`
- Create: `src/lib/app-view.test.ts`
- Modify: `src/lib/agency/all.test.ts` (add one import)

**Interfaces:**
- Consumes: `REQUIRED_FOR_AUTONOMOUS`, `ComponentName` from `@/lib/contracts/catalog`; `AgencyTier` from `@/lib/contracts/manifest`.
- Produces: `HOST_PROVIDED: readonly ComponentName[]`, `missingRequired(tier, present, providedByHost?) => ComponentName[]`, `TabKey`, `TabDef`, `tabsFor(tier) => TabDef[]`, `SeamFacts`, `seamLine(facts) => string`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/app-view.test.ts`:

```ts
/**
 * The three pure decisions behind the drawer's tabs.
 *
 * `missingRequired` is the one that carries weight: it is the render-time half
 * of REQUIRED_FOR_AUTONOMOUS, and the whole duplication fix rests on it
 * answering "on screen" rather than "in the document". The Studio case below is
 * not a formality — `studio-input.tsx` renders a bare draft with no policy strip
 * around it, so if the default ever stops being "provide nothing", a draft
 * autonomous app silently loses its kill switch.
 */
import { describe, it, assert, assertEqual } from "@/lib/kit/testing";
import { HOST_PROVIDED, missingRequired, tabsFor, seamLine } from "@/lib/app-view";
import type { ComponentName } from "@/lib/contracts/catalog";

const none = new Set<ComponentName>();

describe("missingRequired", () => {
  it("asks nothing of a read-only app", () => {
    assertEqual(missingRequired("readonly", none).length, 0, "readonly requires none");
  });

  it("asks nothing of a monitor", () => {
    assertEqual(missingRequired("monitor", none).length, 0, "monitor requires none");
  });

  it("names all three when an autonomous document omits them and no host provides them", () => {
    const missing = missingRequired("autonomous", none, []);
    assertEqual(missing.length, 3, "Studio's bare draft must re-append all three");
    assert(missing.includes("policy_badge"), "policy_badge missing");
    assert(missing.includes("trade_log"), "trade_log missing");
    assert(missing.includes("kill_switch"), "kill_switch missing");
  });

  it("defaults to providing nothing, so an unaware caller keeps the old behaviour", () => {
    assertEqual(missingRequired("autonomous", none).length, 3, "default must be []");
  });

  it("names none when the host guarantees all three", () => {
    assertEqual(
      missingRequired("autonomous", none, HOST_PROVIDED).length,
      0,
      "AppRuntime's strip and Activity tab cover the trio",
    );
  });

  it("still names one the host does not cover", () => {
    const missing = missingRequired("autonomous", none, ["policy_badge", "trade_log"]);
    assertEqual(missing.length, 1, "one uncovered");
    assertEqual(missing[0], "kill_switch", "the uncovered one");
  });

  it("names none when the document itself carries them", () => {
    const present = new Set<ComponentName>(["policy_badge", "trade_log", "kill_switch"]);
    assertEqual(missingRequired("autonomous", present).length, 0, "document satisfies it");
  });
});

describe("tabsFor", () => {
  it("gives a read-only app four tabs and no Safety", () => {
    const keys = tabsFor("readonly").map((t) => t.key);
    assertEqual(keys.join(","), "app,data,activity,about", "readonly tab set");
  });

  it("gives a monitor four tabs and no Safety", () => {
    const keys = tabsFor("monitor").map((t) => t.key);
    assertEqual(keys.join(","), "app,data,activity,about", "monitor tab set");
  });

  it("gives an autonomous app all five, with Safety after Data", () => {
    const keys = tabsFor("autonomous").map((t) => t.key);
    assertEqual(keys.join(","), "app,data,safety,activity,about", "autonomous tab set");
  });

  it("always opens on the composed body", () => {
    for (const tier of ["readonly", "monitor", "autonomous"] as const) {
      assertEqual(tabsFor(tier)[0].key, "app", `${tier} opens on app`);
    }
  });
});

describe("seamLine", () => {
  it("claims only the deployments when no run has happened", () => {
    assertEqual(
      seamLine({ rows: null, sourcesHealthy: 3, sourcesQueried: 4, live: null }),
      "Composed by the agent · 3 of 4 deployments live",
      "no run, no row count",
    );
  });

  it("counts rows after a live run", () => {
    assertEqual(
      seamLine({ rows: 412, sourcesHealthy: 3, sourcesQueried: 4, live: true }),
      "Composed by the agent from 412 rows · 3 of 4 deployments live",
      "live run",
    );
  });

  it("says fixtures when the run was not live, rather than letting the count imply a query", () => {
    assertEqual(
      seamLine({ rows: 12, sourcesHealthy: 0, sourcesQueried: 4, live: false }),
      "Composed by the agent from 12 rows · 0 of 4 deployments live · fixtures, not a live query",
      "fixture run must say so",
    );
  });

  it("does not pluralise a single row", () => {
    assertEqual(
      seamLine({ rows: 1, sourcesHealthy: 1, sourcesQueried: 1, live: true }),
      "Composed by the agent from 1 row · 1 of 1 deployments live",
      "singular row",
    );
  });
});
```

- [ ] **Step 2: Register the test file**

In `src/lib/agency/all.test.ts`, add after the `import "../coverage/gap.test";` line:

```ts
import "../app-view.test";
```

- [ ] **Step 3: Run the suite to verify it fails**

```bash
cd web && pnpm test
```

Expected: typecheck FAILS with `Cannot find module '@/lib/app-view'`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/app-view.ts`:

```ts
/**
 * The drawer's pure decisions, kept out of the components that render them.
 *
 * This file has no React import and no JSX, and that is load-bearing rather
 * than tidy: the suite runs under `tsx` with no DOM, so anything that pulls in
 * a component cannot be tested here at all. Every rule below is one the product
 * would otherwise be asserting without a check.
 */
import { REQUIRED_FOR_AUTONOMOUS, type ComponentName } from "@/lib/contracts/catalog";
import type { AgencyTier } from "@/lib/contracts/manifest";

/**
 * What `AppRuntime` guarantees is on screen no matter which tab is open.
 *
 * The policy strip renders the policy summary and the kill switch above the tab
 * strip, and the Activity tab holds the journal. Passing this to the renderer is
 * how the composed document is allowed to stop carrying its own copies of the
 * three — see `missingRequired`.
 */
export const HOST_PROVIDED: readonly ComponentName[] = ["policy_badge", "trade_log", "kill_switch"];

/**
 * Which of the autonomous trio the client must append itself.
 *
 * THE REINTERPRETATION THIS FILE EXISTS FOR. `REQUIRED_FOR_AUTONOMOUS` was
 * enforced as "these three must be in the DOCUMENT", which is why the runtime
 * rendering its own trade log next to the document's trade log was invisible to
 * the check — both were satisfying it, twice. The rule it was always standing in
 * for is "these three must be ON SCREEN", so a host that renders them in its own
 * chrome now says so and the renderer stops re-appending them.
 *
 * `providedByHost` defaults to empty, and that default is the safety property:
 * a caller that does not know about this parameter — `studio-input.tsx` renders
 * a bare draft with no chrome around it — keeps the old behaviour exactly.
 */
export function missingRequired(
  tier: AgencyTier,
  present: ReadonlySet<ComponentName>,
  providedByHost: readonly ComponentName[] = [],
): ComponentName[] {
  if (tier !== "autonomous") return [];
  return REQUIRED_FOR_AUTONOMOUS.filter((n) => !present.has(n) && !providedByHost.includes(n));
}

export type TabKey = "app" | "data" | "safety" | "activity" | "about";

export interface TabDef {
  key: TabKey;
  label: string;
}

/**
 * The tab set, derived from the tier rather than fixed.
 *
 * Safety is autonomous-only because it is the panel about a wallet, a signer and
 * per-constraint enforcement, and a read-only app has none of those — an empty
 * Safety tab would read as "nothing is enforced" rather than "there is nothing
 * to enforce". App is always first: the composed body is what the drawer is for.
 */
export function tabsFor(tier: AgencyTier): TabDef[] {
  const tabs: TabDef[] = [
    { key: "app", label: "App" },
    { key: "data", label: "Data" },
  ];
  if (tier === "autonomous") tabs.push({ key: "safety", label: "Safety" });
  tabs.push({ key: "activity", label: "Activity" });
  tabs.push({ key: "about", label: "About" });
  return tabs;
}

export interface SeamFacts {
  /** Rows the last run returned, or null when nothing has been run this session. */
  rows: number | null;
  sourcesHealthy: number;
  sourcesQueried: number;
  /** `RunOutcome.live`, or null when nothing has been run. */
  live: boolean | null;
}

/**
 * The line under the tab strip that names the composed body as composed.
 *
 * It must not imply a query that did not happen. `rows: null` means no run this
 * session, so the row count is simply absent rather than zero — and `live:
 * false` appends the fixture disclosure, because a row count sitting next to
 * "composed by the agent" otherwise reads as a measurement of live data. The
 * receipts above already shout FIXTURES; this line may not quietly disagree.
 */
export function seamLine(f: SeamFacts): string {
  const head =
    f.rows === null
      ? "Composed by the agent"
      : `Composed by the agent from ${f.rows} row${f.rows === 1 ? "" : "s"}`;
  const fixtures = f.live === false ? " · fixtures, not a live query" : "";
  return `${head} · ${f.sourcesHealthy} of ${f.sourcesQueried} deployments live${fixtures}`;
}
```

- [ ] **Step 5: Run the suite to verify it passes**

```bash
cd web && pnpm test
```

Expected: PASS, with 17 more passing tests than before.

- [ ] **Step 6: Commit**

```bash
git add src/lib/app-view.ts src/lib/app-view.test.ts src/lib/agency/all.test.ts
git commit -m "Ask REQUIRED_FOR_AUTONOMOUS whether the trio is on screen, not in the document"
```

---

### Task 2: Thread `providedByHost` through the renderer

Replaces the inline computation at `renderer.tsx:217-218` with the tested function and adds the prop. Still no visible change — no caller passes the prop yet.

**Files:**
- Modify: `src/components/renderer/renderer.tsx:63-81` (props), `:217-218` (computation)
- Modify: `src/components/board/app-body.tsx:31-65`

**Interfaces:**
- Consumes: `missingRequired` from `@/lib/app-view` (Task 1).
- Produces: `A2uiRendererProps.providedByHost?: readonly ComponentName[]`; `AppBody` prop `providedByHost?: readonly ComponentName[]`, forwarded verbatim.

- [ ] **Step 1: Add the prop to `A2uiRendererProps`**

In `src/components/renderer/renderer.tsx`, inside `interface A2uiRendererProps` (ends at line 81), add before `className?: string;`:

```ts
  /**
   * Components the surrounding chrome guarantees are on screen, so this renderer
   * must not re-append them. `AppRuntime` passes the autonomous trio because its
   * policy strip and Activity tab hold them; a caller that renders a bare
   * document — the Studio preview — passes nothing and keeps the old behaviour.
   */
  providedByHost?: readonly ComponentName[];
```

- [ ] **Step 2: Accept it in the signature**

Change the destructuring at `renderer.tsx:102-111` so `providedByHost` is accepted with an empty default. The new parameter list:

```tsx
export function A2uiRenderer({
  document: input,
  tier: tierOverride,
  policy = null,
  spentUsd = 0,
  journal,
  onAction,
  localFunctions,
  providedByHost = [],
  className,
}: A2uiRendererProps) {
```

- [ ] **Step 3: Replace the inline computation**

Replace lines 217-218:

```tsx
  const missing =
    tier === "autonomous" ? REQUIRED_FOR_AUTONOMOUS.filter((n) => !present.has(n)) : [];
```

with:

```tsx
  const missing = missingRequired(tier, present, providedByHost);
```

- [ ] **Step 4: Fix the imports**

At `renderer.tsx:43` the import is:

```ts
import { REQUIRED_FOR_AUTONOMOUS, type ComponentName } from "@/lib/contracts/catalog";
```

`REQUIRED_FOR_AUTONOMOUS` now has no other use in this file — confirm with `grep -n REQUIRED_FOR_AUTONOMOUS src/components/renderer/renderer.tsx` and if line 218 was its only use, change the import to keep only the type and add the new one:

```ts
import type { ComponentName } from "@/lib/contracts/catalog";
import { missingRequired } from "@/lib/app-view";
```

Leave the file-header comment at `renderer.tsx:33` accurate by updating it to read:

```
 * REQUIRED_FOR_AUTONOMOUS (policy_badge, trade_log, kill_switch) is applied
 * here as an ON-SCREEN rule rather than an in-document one: a host that renders
 * them in its own chrome declares so via `providedByHost` and this renderer
 * appends nothing. See `lib/app-view.ts`.
```

- [ ] **Step 5: Forward it from `AppBody`**

In `src/components/board/app-body.tsx`, add to the props destructuring and type (lines 31-51), after `journal`:

```tsx
  providedByHost,
```

and in the type block, after the `journal?: JournalEntry[];` entry:

```tsx
  /** Passed straight to the renderer. See `lib/app-view.ts` HOST_PROVIDED. */
  providedByHost?: readonly ComponentName[];
```

Add the type import at the top of the file, beside the other type imports:

```ts
import type { ComponentName } from "@/lib/contracts/catalog";
```

And pass it in the `<A2uiRenderer>` call at line 57-65:

```tsx
      <A2uiRenderer
        document={doc}
        policy={policy}
        spentUsd={spentUsd}
        journal={journal}
        providedByHost={providedByHost}
        onAction={onAction}
      />
```

- [ ] **Step 6: Verify**

```bash
cd web && pnpm test
```

Expected: PASS, same count as end of Task 1. The behaviour is unchanged — `providedByHost` defaults to `[]` at both hops, which reproduces the old computation exactly.

- [ ] **Step 7: Commit**

```bash
git add src/components/renderer/renderer.tsx src/components/board/app-body.tsx
git commit -m "Let a host declare it already shows the autonomous trio"
```

---

### Task 3: Stop the composer's autonomous branch emitting the trio

The duplication fix. After this, an autonomous app's composed body carries the action surface only, and the runtime's strip and `TradeLog` panel are the sole renderers of policy, kill switch and journal.

**Files:**
- Modify: `web/packages/atlas-kit/src/kit/seed-to-a2ui.ts:252-377`
- Modify: `src/components/board/app-runtime.tsx` (pass `HOST_PROVIDED`, rescue the caption)
- Create: `src/lib/seed-to-a2ui-shape.test.ts`
- Modify: `src/lib/agency/all.test.ts`

**Interfaces:**
- Consumes: `HOST_PROVIDED` from `@/lib/app-view` (Task 1); `AppBody`'s `providedByHost` (Task 2).
- Produces: no new exports. `seedToA2ui(manifest, opts)` keeps its signature; only its output changes.

- [ ] **Step 1: Write the failing test**

Create `src/lib/seed-to-a2ui-shape.test.ts`:

```ts
/**
 * What the autonomous branch of `seedToA2ui` is allowed to put in the document.
 *
 * This test is the duplication rule made checkable. `policy_badge`, `trade_log`
 * and `kill_switch` are rendered by `AppRuntime`'s own chrome — the policy strip
 * above the tabs and the Activity tab's TradeLog — so a composed document that
 * also carries them renders the same fact twice, in two hands, which is exactly
 * why a reader could not tell which part of the drawer the agent wrote.
 *
 * The action surface must survive: removing the trio must not remove the app.
 *
 * Lives in `src/` rather than in the package because it reads a real seed
 * manifest, and `packages/atlas-kit` may not import from `@/lib/seed`.
 */
import { describe, it, assert } from "@/lib/kit/testing";
import { seedToA2ui } from "@/lib/kit/seed-to-a2ui";
import { SEED_APPS } from "@/lib/seed";

/** Every component name present in a composed document, in order. */
function componentsOf(doc: unknown): string[] {
  const names: string[] = [];
  for (const msg of Array.isArray(doc) ? doc : []) {
    const m = msg as { createSurface?: { components?: { component?: string }[] } };
    for (const c of m.createSurface?.components ?? []) {
      if (typeof c.component === "string") names.push(c.component);
    }
  }
  return names;
}

const autonomous = SEED_APPS.filter((a) => a.manifest.agency.tier === "autonomous");

describe("seedToA2ui autonomous branch", () => {
  it("has autonomous seed apps to test", () => {
    assert(autonomous.length > 0, "no autonomous seed app found — this test proves nothing");
  });

  for (const app of autonomous) {
    const name = app.manifest.name;
    const names = componentsOf(seedToA2ui(app.manifest, { journal: [], epoch: 0 }));

    it(`${name}: emits no policy_badge — the strip owns it`, () => {
      assert(!names.includes("policy_badge"), `${name} still emits policy_badge`);
    });

    it(`${name}: emits no trade_log — the Activity tab owns it`, () => {
      assert(!names.includes("trade_log"), `${name} still emits trade_log`);
    });

    it(`${name}: emits no kill_switch — the strip owns it`, () => {
      assert(!names.includes("kill_switch"), `${name} still emits kill_switch`);
    });

    it(`${name}: keeps its action surface`, () => {
      assert(names.includes("action_button"), `${name} lost its action_button`);
      assert(names.includes("amount_input"), `${name} lost its amount_input`);
      assert(names.includes("allowlist_picker"), `${name} lost its allowlist_picker`);
    });

    it(`${name}: still renders something`, () => {
      assert(names.length > 3, `${name} composed down to ${names.length} components`);
    });
  }
});
```

Note on `epoch`: `seedToA2ui` takes `{ journal, epoch }` — check the call at `app-runtime.tsx:308` (`seedToA2ui(mm, { journal, epoch: SEED_EPOCH })`) and match the option names exactly. If `epoch` has a different type than `number`, import `SEED_EPOCH` from `@/lib/seed` and pass that instead of `0`.

- [ ] **Step 2: Register the test file**

In `src/lib/agency/all.test.ts`, after the `import "../app-view.test";` line added in Task 1:

```ts
import "../seed-to-a2ui-shape.test";
```

- [ ] **Step 3: Run to verify it fails**

```bash
cd web && pnpm test
```

Expected: FAIL, three failures per autonomous seed app — `still emits policy_badge`, `still emits trade_log`, `still emits kill_switch`.

- [ ] **Step 4: Delete the three pushes**

In `web/packages/atlas-kit/src/kit/seed-to-a2ui.ts`, inside `appendAutonomous`, delete the `push("policy-badge", ...)` call (lines 290-300), the `push("trade-log", ...)` call (lines 365-369) and the `push("kill-switch", ...)` call (lines 371-376).

Keep `push("amount-input", ...)`, `push("allowlist-picker", ...)`, `push("action-" + key, ...)` and the conditional `push("confirm-dialog", ...)`.

Replace the block comment at lines 252-260 with:

```ts
/* ────────────────────────────────────────────────────────────────────────
 * Autonomous action chrome
 *
 * Mirrors the composer's autonomous branch (lib/kit/composer.ts), sourced from
 * the manifest instead of a plan.
 *
 * WHAT IS DELIBERATELY NOT HERE. `policy_badge`, `trade_log` and `kill_switch`
 * are the REQUIRED_FOR_AUTONOMOUS trio and this function used to push all three.
 * `AppRuntime` renders each of them in its own chrome — the policy strip above
 * the tab strip carries the policy summary and the kill switch, the Activity tab
 * carries the journal — so emitting them here rendered the same three facts
 * twice, in two different hands. That is the reason a reader could not tell
 * which part of the drawer the agent had actually composed.
 *
 * The invariant is not weakened, it is relocated: `AppRuntime` passes
 * `HOST_PROVIDED` to the renderer, which is how the renderer knows not to
 * re-append them. A caller that renders this document with no chrome around it
 * — the Studio preview — passes nothing and gets all three appended, as before.
 * See `lib/app-view.ts` and `renderer.tsx`.
 * ──────────────────────────────────────────────────────────────────────── */
```

- [ ] **Step 5: Run to verify the test passes**

```bash
cd web && pnpm test
```

Expected: PASS. If `blocked`, `action` or `key` are now flagged as unused by the typecheck, they are not — `action_button` still uses all three.

- [ ] **Step 6: Pass `HOST_PROVIDED` from `AppRuntime`**

In `src/components/board/app-runtime.tsx`, add to the imports:

```ts
import { HOST_PROVIDED } from "@/lib/app-view";
```

and at the `<AppBody>` call (line 528), add the prop:

```tsx
          <AppBody
            doc={bodyDoc ?? m.ui}
            animate
            providedByHost={HOST_PROVIDED}
            policy={policy}
```

- [ ] **Step 7: Rescue the caption onto the policy strip**

Deleting `policy_badge` loses its caption, *"Enforced at the signer, not suggested to the model."* — a line worth keeping. In `app-runtime.tsx`, on the policy strip's opening `<span>policy</span>` (line 393), add a `title`:

```tsx
            <span title="Enforced at the signer, not suggested to the model.">policy</span>
```

- [ ] **Step 8: Verify and commit**

```bash
cd web && pnpm test
git add packages/atlas-kit/src/kit/seed-to-a2ui.ts src/components/board/app-runtime.tsx src/lib/seed-to-a2ui-shape.test.ts src/lib/agency/all.test.ts
git commit -m "Give the policy, the kill switch and the journal one owner each"
```

---

### Task 4: Extract the hooks, `KV` and the receipts

Pure mechanical extraction, no behaviour change. Splits the first third of `app-runtime.tsx` out so Task 5 can move the panels.

**Files:**
- Create: `src/components/board/app-facts.ts`
- Create: `src/components/board/app-receipts.tsx`
- Modify: `src/components/board/chrome.tsx` (gains `KV`)
- Modify: `src/components/board/app-runtime.tsx`

**Interfaces:**
- Produces:
  - `app-facts.ts`: `interface SignerFacts`, `useSigner(manifest: Manifest | null): SignerFacts | null`, `useStreamMode(): { mode: "substreams" | "interval"; reason: string } | null`, `useZeroGExplorer(): string | null`
  - `app-receipts.tsx`: `Receipt({ tone, text })`, `runReceipt(out: RunOutcome)`, `watchReceipt(out: WatchOutcome)`
  - `chrome.tsx`: `KV({ k, v, mono?, accent?, href? })`

- [ ] **Step 1: Move `KV` into `chrome.tsx`**

Cut `function KV(...)` from `app-runtime.tsx:1012-1053` — the whole function including its comment block — and paste it into `src/components/board/chrome.tsx` at the end of the file, adding `export`:

```tsx
export function KV({
```

`chrome.tsx` already imports `cn` and defines `Fig`, so the body needs no import changes. Delete the now-unused `Fig` import from `app-runtime.tsx`'s chrome import if nothing else there uses it — check with `grep -n "<Fig" src/components/board/app-runtime.tsx` first; if there are no hits, remove `Fig` from the import list and add `KV`:

```ts
import { ArmedLamp, KV, Label, LiveDot, SectionHead, TierTag, panelClass } from "@/components/board/chrome";
```

- [ ] **Step 2: Move the receipts**

Create `src/components/board/app-receipts.tsx` beginning with `"use client";`, and move `Receipt` (`app-runtime.tsx:1074-1083`), `runReceipt` (`:1095-1108`) and `watchReceipt` (`:1132-1154`) into it verbatim — **including every comment block above them**, which is where the three-failures-three-sentences argument lives. Export all three. Its imports:

```ts
import type { RunOutcome, WatchOutcome } from "@/lib/store";
```

- [ ] **Step 3: Move the hooks**

Create `src/components/board/app-facts.ts` beginning with `"use client";`, and move `useStreamMode` (`app-runtime.tsx:97-121`), `SignerFacts` (`:97-188`, the interface plus its long header comment), `useSigner` (`:190-237`) and `useZeroGExplorer` (`:239-263`) into it verbatim with all comments. Export `SignerFacts`, `useSigner`, `useStreamMode`, `useZeroGExplorer`. Its imports:

```ts
import { useEffect, useRef, useState } from "react";
import type { Manifest } from "@/lib/contracts/manifest";
import type {
  EnforcementReport,
  PlanDivergence,
  RegistryScope,
  WalletKind,
} from "@/lib/agency/wallet";
```

Note this is a `.ts` file with no JSX — correct, it contains only hooks.

- [ ] **Step 4: Import them back into `app-runtime.tsx`**

```ts
import { useSigner, useStreamMode, useZeroGExplorer, type SignerFacts } from "@/components/board/app-facts";
import { Receipt, runReceipt, watchReceipt } from "@/components/board/app-receipts";
```

Then remove from `app-runtime.tsx` any import that is now unused — likely `useRef`, and the `EnforcementReport` / `PlanDivergence` / `RegistryScope` / `WalletKind` type imports. `EnforcementSite` is still used by `EnforcementRow`, which stays for now. Let `tsc --noEmit` tell you which ones; do not guess.

- [ ] **Step 5: Verify**

```bash
cd web && pnpm test
```

Expected: PASS, same test count as Task 3. Nothing was renamed and nothing changed behaviour; a failure here means something was dropped in the move.

- [ ] **Step 6: Commit**

```bash
git add src/components/board/app-facts.ts src/components/board/app-receipts.tsx src/components/board/chrome.tsx src/components/board/app-runtime.tsx
git commit -m "Lift the fetch hooks, KV and the receipts out of app-runtime"
```

---

### Task 5: Extract the five panels and the policy strip

Also mechanical. Ends with `app-runtime.tsx` holding orchestration and nothing else.

**Files:**
- Create: `src/components/board/app-policy-strip.tsx`
- Create: `src/components/board/panels/data-plan.tsx`
- Create: `src/components/board/panels/permissions.tsx`
- Create: `src/components/board/panels/provenance.tsx`
- Create: `src/components/board/panels/usage.tsx`
- Modify: `src/components/board/app-runtime.tsx`

**Interfaces:**
- Consumes: `SignerFacts` from `@/components/board/app-facts` (Task 4); `KV` from `@/components/board/chrome` (Task 4). Every panel below takes `app: MiniApp`, imported as `import type { MiniApp } from "@/lib/seed";`.
- Produces:
  - `AppPolicyStrip({ app, signer })` — derives `manifest` and `policy` from `app` internally
  - `DataPlanPanel({ app, signer, stream, noLiveSource })` where `noLiveSource: ReadonlySet<string>`
  - `PermissionsPanel({ app, signer })` — also holds `EnforcementRow`, which stays private to this file
  - `ProvenancePanel({ m, explorerBase })` where `m: Manifest`, `explorerBase: string | null`
  - `UsagePanel({ app })`

- [ ] **Step 1: Extract `AppPolicyStrip`**

Create `src/components/board/app-policy-strip.tsx` with `"use client";`. Cut the `<div className="policy-strip">…</div>` element from `app-runtime.tsx:392-447` — the inner element only, not the `{autonomous ? … : null}` ternary wrapping it — and paste it, every comment included, as this component's return value:

```tsx
export function AppPolicyStrip({
  app,
  signer,
}: {
  app: MiniApp;
  signer: SignerFacts | null;
}) {
  const m = app.manifest;
  const policy = m.agency.policy;
  return (
    // the pasted <div className="policy-strip"> element, unchanged
  );
}
```

Derive `policy` and `m` inside rather than taking them as props — fewer props to keep in sync, and `app.manifest` is the single source. Imports: `MiniApp` type from `@/lib/seed`, `SignerFacts` type from `@/components/board/app-facts`, `{ fmtDate, fmtUsd, haltRemote, isArmed, shortHash }` from `@/lib/store`, `cn` from `@/lib/utils`.

The `autonomous` ternary stays at the **call site** in `app-runtime.tsx`, not inside this component — see Task 6 step 4 for why the strip's placement is deliberate.

- [ ] **Step 2: Extract `DataPlanPanel`**

Create `src/components/board/panels/data-plan.tsx` with `"use client";`. Move `app-runtime.tsx:591-744` — the whole `<section className="panel p-3">` for Data plan, including the four long comment blocks (the divergence argument, the DECLARED-NOT-RESOLVED note, the transport note and the latency note).

```tsx
export function DataPlanPanel({
  app,
  signer,
  stream,
  noLiveSource,
}: {
  app: MiniApp;
  signer: SignerFacts | null;
  stream: { mode: "substreams" | "interval"; reason: string } | null;
  noLiveSource: ReadonlySet<string>;
}) {
```

Inside, `const m = app.manifest;`. Imports needed: `KV`, `Label`, `SectionHead` from chrome; `fmtDate` from store; `NO_LIVE_SOURCE` from `@/lib/schema-coverage`.

- [ ] **Step 3: Extract `PermissionsPanel`**

Create `src/components/board/panels/permissions.tsx` with `"use client";`. Move `app-runtime.tsx:747-918` — the `<section className="panel panel--autonomous p-3">` block — plus the `EnforcementRow` function from `:1062-1071` with its comment. Keep `EnforcementRow` unexported; it has one caller.

```tsx
export function PermissionsPanel({
  app,
  signer,
}: {
  app: MiniApp;
  signer: SignerFacts | null;
}) {
  const m = app.manifest;
  const policy = m.agency.policy;
  const tier = m.agency.tier;
```

`walletClaimConflict` (currently computed at `app-runtime.tsx:354-357`) moves **into this component** — it is used only here. Imports: `KV`, `Label`, `SectionHead` from chrome; `fmtDate`, `fmtNum`, `fmtUsd`, `shortHash` from store; `isConditionEvaluable` from `@/lib/agency/condition`; `TIER_BLURB` from `@/lib/seed`; `EnforcementSite` type from `@/lib/agency/wallet`.

- [ ] **Step 4: Extract `ProvenancePanel` and `UsagePanel`**

Create `src/components/board/panels/provenance.tsx` — move `app-runtime.tsx:927-963` with its comments:

```tsx
export function ProvenancePanel({ m, explorerBase }: { m: Manifest; explorerBase: string | null }) {
```

Create `src/components/board/panels/usage.tsx` — move `app-runtime.tsx:965-1003` with both long comment blocks (the `valueTransactedUsd` deletion argument and the "Not earnings" note):

```tsx
export function UsagePanel({ app }: { app: MiniApp }) {
  const m = app.manifest;
```

- [ ] **Step 5: Wire them back and delete the inline copies**

`app-runtime.tsx` now imports all five and renders them where the inline blocks were. Do not restructure the layout yet — that is Task 6. This step should leave the rendered output byte-identical.

- [ ] **Step 6: Verify**

```bash
cd web && pnpm test
```

Expected: PASS, same count. Then confirm the file shrank:

```bash
wc -l src/components/board/app-runtime.tsx
```

Expected: roughly 350-400 lines, down from 1155.

- [ ] **Step 7: Commit**

```bash
git add src/components/board/app-policy-strip.tsx src/components/board/panels src/components/board/app-runtime.tsx
git commit -m "Give each panel its own file, so two layouts can arrange the same sections"
```

---

### Task 6: The two layouts and the `variant` prop

The visible change. The drawer gets tabs; `/a/[name]` keeps the rail.

**Files:**
- Create: `src/components/board/app-sections.tsx`
- Modify: `src/components/board/app-runtime.tsx`
- Modify: `src/components/board/app-drawer.tsx:285`

**Interfaces:**
- Consumes: `tabsFor`, `seamLine`, `TabKey` from `@/lib/app-view` (Task 1); all five panel components (Task 5).
- Produces:
  - `interface AppSections { app: ReactNode; data: ReactNode; safety: ReactNode | null; activity: ReactNode; about: ReactNode }`
  - `TabbedSections({ sections, tier, seam, activeTab, onTabChange })`
  - `RailSections({ sections })`
  - `AppRuntime` gains `variant?: "drawer" | "page"`, defaulting to `"page"`.

- [ ] **Step 1: Write the layouts**

Create `src/components/board/app-sections.tsx`:

```tsx
"use client";

/**
 * Two arrangements of the same sections.
 *
 * The sections arrive as already-built elements rather than as props to build
 * from. That is the seam: `AppRuntime` owns the data and the fetches, these two
 * own arrangement and nothing else, and neither can accidentally render a panel
 * with different inputs than the other.
 *
 * WHAT IS NOT IN `AppSections`, and must never be added to it: the policy strip.
 * The autonomous safety invariant now rests on that strip being on screen no
 * matter which tab is open — `AppRuntime` passes HOST_PROVIDED to the renderer
 * on the strength of it, so the composed body no longer carries its own policy
 * badge or kill switch. `AppRuntime` renders the strip ABOVE the call to either
 * layout, and neither layout holds a reference to it, so neither can suppress
 * it. There is no DOM in this repo's test harness and so no test can assert
 * this; the structure is the enforcement.
 */
import { useId, type ReactNode } from "react";
import { tabsFor, type TabKey } from "@/lib/app-view";
import type { AgencyTier } from "@/lib/contracts/manifest";
import { cn } from "@/lib/utils";

export interface AppSections {
  app: ReactNode;
  data: ReactNode;
  /** Null for every tier but autonomous — there is no wallet to describe. */
  safety: ReactNode | null;
  activity: ReactNode;
  about: ReactNode;
}

/**
 * The drawer. One tab body at a time, with the composed document first and
 * named as composed.
 */
export function TabbedSections({
  sections,
  tier,
  seam,
  activeTab,
  onTabChange,
}: {
  sections: AppSections;
  tier: AgencyTier;
  /** The line naming the composed body. Rendered on the App tab only. */
  seam: string;
  activeTab: TabKey;
  onTabChange: (key: TabKey) => void;
}) {
  const tabs = tabsFor(tier);
  const base = useId();

  // Arrow keys move between tabs. This does not fight the option wheel beside
  // the drawer: the wheel's own arrow handling is an `onKeyDown` on its focused
  // element (`option-wheel.tsx`, role="listbox", tabIndex={0}), not a document
  // listener, so the two can never both be focused.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.key === activeTab);
    const next = tabs[(i + delta + tabs.length) % tabs.length];
    onTabChange(next.key);
    document.getElementById(`${base}-tab-${next.key}`)?.focus();
  };

  return (
    <div className="mt-4">
      <div
        role="tablist"
        aria-label="Mini app sections"
        onKeyDown={onKeyDown}
        className="flex gap-1 border-b border-hairline"
      >
        {tabs.map((t) => {
          const active = t.key === activeTab;
          return (
            <button
              key={t.key}
              id={`${base}-tab-${t.key}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${base}-panel-${t.key}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onTabChange(t.key)}
              className={cn(
                "mono px-2.5 py-1.5 text-[0.6875rem] uppercase tracking-[0.08em]",
                active ? "text-[var(--ink)]" : "text-[var(--muted-ink)]",
                active && "shadow-[inset_0_-2px_0_var(--action)]",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* The seam. It sits under the strip on the App tab only, because it is a
          claim about the panel directly below it and nowhere else. */}
      {activeTab === "app" ? (
        <p className="mono px-0.5 pt-2 text-[0.625rem] leading-snug text-[var(--muted-ink)]">
          {seam}
        </p>
      ) : null}

      <div
        role="tabpanel"
        id={`${base}-panel-${activeTab}`}
        aria-labelledby={`${base}-tab-${activeTab}`}
        tabIndex={0}
        className="space-y-4 pt-3 outline-none"
      >
        {sections[activeTab]}
      </div>
    </div>
  );
}

/**
 * The full-page route. The 380px rail, unchanged — this is the width it was
 * measured for, and the `@4xl` split is container-relative so it answers about
 * this element rather than the window.
 *
 * It renders the rail ONLY, not `sections.app`. On the page the composed body
 * lives inside the tier panel with the strip and the header, and the rail sits
 * outside and below it — which is exactly where `app-runtime.tsx:571` had it
 * before this refactor. Folding the body in here would pull the rail inside the
 * panel and change the page's appearance, which this refactor must not do.
 */
export function RailSections({ sections }: { sections: AppSections }) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <div className="min-w-0 space-y-4">
        {sections.about}
        {sections.data}
        {sections.safety}
      </div>
      <aside className="min-w-0 space-y-4">{sections.activity}</aside>
    </div>
  );
}
```

- [ ] **Step 2: Build the sections in `AppRuntime`**

First lift the inline `onAction` arrow from the `<AppBody>` call — currently `app-runtime.tsx:534-562`, the handler that special-cases `halt_agent` and then calls `dispatchAction` — into a named `const onBodyAction = (action: unknown) => { … }` declared just above the `sections` object. Move it verbatim, including the three comment blocks inside it; only its position changes.

Then, after the early returns and the existing derivations, add:

```tsx
  const sections: AppSections = {
    app: (
      <AppBody
        doc={bodyDoc ?? m.ui}
        animate
        providedByHost={HOST_PROVIDED}
        policy={policy}
        spentUsd={app.stats.spentUsd}
        journal={journal}
        onAction={onBodyAction}
      />
    ),
    data: <DataPlanPanel app={app} signer={signer} stream={stream} noLiveSource={noLiveSource} />,
    safety: autonomous ? <PermissionsPanel app={app} signer={signer} /> : null,
    activity: (
      <>
        {watchable ? <TradeLog appName={m.name} /> : null}
        <UsagePanel app={app} />
      </>
    ),
    about: (
      <>
        <AppPublishPanel app={app} />
        <ProvenancePanel m={m} explorerBase={explorerBase} />
        <Ratings appName={m.name} />
      </>
    ),
  };
```

- [ ] **Step 3: Add the tab state**

```tsx
  const [activeTab, setActiveTab] = useState<TabKey>("app");
  // Reset when the wheel flicks to a different app. Adjusting state during
  // render is the sanctioned pattern and avoids a frame of the previous app's
  // Safety tab showing under this app's name.
  const [tabbedApp, setTabbedApp] = useState(name);
  if (name !== tabbedApp) {
    setTabbedApp(name);
    setActiveTab("app");
  }
```

Place these with the other `useState` calls near the top of the component, **above** the early returns — hooks may not sit after a conditional return.

- [ ] **Step 4: Render the spine, then the layout**

Replace the body of the returned `<main>` so the strip, header and receipts render unconditionally, then one layout. `HEADER` below means the existing `<header className="flex flex-wrap items-start…">` element from `app-runtime.tsx:450-510`, moved unchanged; `RECEIPTS` means the existing `{runOut || running || watchOut || watching ? (…) : null}` block from `:516-525`, moved unchanged. Do not retype either — cut and paste them.

```tsx
      <div className={panelClass(tier)}>
        {autonomous ? <AppPolicyStrip app={app} signer={signer} /> : null}

        HEADER

        RECEIPTS

        {/* On the page the composed body stays inside the tier panel, exactly
            where it was. In the drawer it belongs to the App tab instead. */}
        {variant === "page" ? <div className="p-3 sm:p-4">{sections.app}</div> : null}
      </div>

      {variant === "page" ? <RailSections sections={sections} /> : null}

      {variant === "drawer" ? (
        <TabbedSections
          sections={sections}
          tier={tier}
          seam={seamLine({
            rows: runOut?.ok ? runOut.rows : null,
            sourcesHealthy: app.stats.sourcesHealthy,
            sourcesQueried: app.stats.sourcesQueried,
            live: runOut?.ok ? runOut.live : null,
          })}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      ) : null}
```

Note the strip, header and receipts are inside `panelClass(tier)` in both variants and the tab strip is outside it — the tabs divide the sections, not the spine.

- [ ] **Step 5: Add the `variant` prop**

```tsx
export function AppRuntime({
  name,
  variant = "page",
}: {
  name: string;
  /**
   * `page` keeps the 380px rail — the width it was measured for. `drawer` puts
   * the sections behind tabs, because at panel width the rail collapses to one
   * column and the composed body becomes 1 of 9 stacked panels.
   */
  variant?: "drawer" | "page";
}) {
```

- [ ] **Step 6: Pass it from the drawer**

In `src/components/board/app-drawer.tsx` at line 285:

```tsx
          {shownName ? <AppRuntime name={shownName} variant="drawer" /> : null}
```

`src/app/a/[name]/page.tsx` needs no change — `"page"` is the default.

- [ ] **Step 7: Verify**

```bash
cd web && pnpm test
```

Expected: PASS, same count as Task 5.

Then check it by hand, since no test can:

```bash
pnpm dev
```

Open the board, click a card, and confirm: the drawer opens on the App tab; the policy strip and its Kill switch are visible on **every** tab of an autonomous app; the seam line appears under the tab strip on the App tab only; the composed body no longer shows a policy badge, a trade log or a kill switch card; the Activity tab shows the trade log once. Then open `/a/<name>` and confirm the rail layout is unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/components/board/app-sections.tsx src/components/board/app-runtime.tsx src/components/board/app-drawer.tsx
git commit -m "Open the drawer on the app the agent composed, and say that is what it is"
```

---

### Task 7: Make the "unpublished" line reach Publish

The spec's answer to Publish moving behind a tab: the claim in the header becomes the route to its own remedy.

**Files:**
- Modify: `src/components/board/app-runtime.tsx:475-481`

**Interfaces:**
- Consumes: `activeTab` / `setActiveTab` (Task 6).
- Produces: nothing new.

- [ ] **Step 1: Make the line a button in the drawer**

The header currently renders (`app-runtime.tsx:475-481`):

```tsx
            {m.identity.ens ? (
              <p className="mono mt-1.5 text-[0.6875rem]">{m.identity.ens}</p>
            ) : (
              <p className="mono mt-1.5 text-[0.6875rem] text-[var(--muted-ink)]">
                unpublished — no ENS subname issued
              </p>
            )}
```

First hoist the sentence to a module constant near the top of `app-runtime.tsx`, so the three branches below cannot drift apart:

```tsx
/** One sentence, three renderings — a header line, a button, a page paragraph. */
const UNPUBLISHED = "unpublished — no ENS subname issued";
```

Then replace the unpublished branch with (using `{UNPUBLISHED}` in place of each literal):

```tsx
            {m.identity.ens ? (
              <p className="mono mt-1.5 text-[0.6875rem]">{m.identity.ens}</p>
            ) : variant === "drawer" ? (
              /* The claim is also the way to fix it. Publish used to sit
                 directly under this line; behind a tab it would be further from
                 the sentence it answers than it was before, and the comment on
                 AppPublishPanel is explicit that "why can I not publish this?"
                 deserves an answer next to the claim. So the claim carries the
                 reader there. */
              <button
                type="button"
                onClick={() => setActiveTab("about")}
                className="mono mt-1.5 block text-left text-[0.6875rem] text-[var(--muted-ink)] underline decoration-dotted"
              >
                {UNPUBLISHED}
              </button>
            ) : (
              <p className="mono mt-1.5 text-[0.6875rem] text-[var(--muted-ink)]">
                {UNPUBLISHED}
              </p>
            )}
```

The `page` variant keeps a plain paragraph — there is no tab to switch to, and Publish is already visible in its rail.

- [ ] **Step 2: Verify**

```bash
cd web && pnpm test
```

Expected: PASS.

Then by hand: open an unpublished app in the drawer, click "unpublished — no ENS subname issued", and confirm the About tab opens with the Publish panel at the top.

- [ ] **Step 3: Commit**

```bash
git add src/components/board/app-runtime.tsx
git commit -m "Let the unpublished line carry the reader to the thing that publishes"
```

---

## Verification checklist

After Task 7, confirm all of the following by hand — none is covered by a test:

- [ ] Autonomous app in the drawer: policy strip with Kill switch visible on all five tabs.
- [ ] Composed body contains no policy badge, no trade log card, no kill switch card.
- [ ] No "added by the client — an autonomous app must show these" block appears in the drawer.
- [ ] Studio preview (describe a new autonomous app, look at the draft render) **still shows** all three, under that client-added label.
- [ ] Read-only app: four tabs, no Safety.
- [ ] Trade log appears exactly once, in Activity.
- [ ] Seam line reports fixture runs as fixtures after pressing Run with no gateway key.
- [ ] `/a/<name>` rail layout unchanged.
- [ ] `wc -l src/components/board/app-runtime.tsx` is roughly 300.
