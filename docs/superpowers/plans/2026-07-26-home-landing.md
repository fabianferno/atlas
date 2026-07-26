# Home Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/` into a landing page whose hero is the existing Board (globe + card wheel + tier legend), with a scripted prompt-to-interface animation and two acts of content below it.

**Architecture:** Two pre-existing hero defects are fixed first so anything below the fold is reachable at all — the card wheel `preventDefault`s every scroll event over itself, and the globe is a viewport-fixed layer positioned with a page coordinate. Then a facts module derives every figure the page prints from the code that already holds it, three A2UI documents are authored with the composer's own builders and rendered through the real renderer, and eight section components are composed into `page.tsx`.

**Tech Stack:** Next.js 16.2.11 (App Router), React 19.2.4, TypeScript 5, Tailwind v4, no animation library — CSS keyframes and `requestAnimationFrame` only.

**Spec:** `docs/superpowers/specs/2026-07-26-home-landing-design.md`

## Global Constraints

- **This is not the Next.js you know.** Per `web/AGENTS.md`: read the relevant guide in `web/node_modules/next/dist/docs/` before writing code that touches a Next API. Heed deprecation notices.
- **All work happens in `web/`.** Run every command from `/Users/fabianferno/Documents/graph-minis/web`.
- **Test command is `pnpm test`.** It runs `tsc --noEmit` first and then `pnpm dlx tsx src/lib/agency/all.test.ts`. Both halves, always — `tsx` strips types and never type-checks, so the suite alone goes green on code that does not compile.
- **There is no React testing library in this repo.** No component renders in tests. Tests cover pure modules (`facts.ts`) and data (the A2UI documents). Everything visual is verified by hand against the checklist in Task 9.
- **Test helpers come from `@/lib/kit/testing`:** `describe(name, body)`, `it(name, body)`, `assert(condition, message)`, `assertEqual(actual, expected, message?)`. A new test file must be imported into `src/lib/agency/all.test.ts` or it never runs.
- **Path aliases:** `@/lib/kit/*` → `packages/atlas-kit/src/kit/*`, `@/lib/contracts/*` → `packages/atlas-kit/src/contracts/*`, `@/*` → `src/*`.
- **No new dependencies.** `package.json` gains nothing.
- **No hardcoded figure that exists in code.** Every count, cost and date the landing prints is derived in `src/components/landing/facts.ts`. Constants are permitted only for things no code holds (block numbers, transaction hashes, attestation ids) and each carries a comment naming the script that measured it.
- **Copy is verbatim from spec §5.** Do not paraphrase, soften, or expand the drafted lines. The "what isn't built" section keeps the same visual weight as receipts.
- **Commit after every task.** Message body explains why, not what.
- **Co-author trailer on every commit:**
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```

---

### Task 1: Release page scroll from the card wheel

The wheel currently owns every scroll event over its box, so no landing content below it is reachable. It gains an engaged state: it captures scroll only after the reader clicks or focuses into it.

**Files:**
- Modify: `web/src/components/board/option-wheel.tsx` (props interface ~line 27, state ~line 112, wheel effect 383-405, pointer-down handler ~line 408, key handler, root element 511-518)
- Modify: `web/src/components/board/app-deck.tsx` (wheel props ~line 233-266, hint line ~line 272-278)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `OptionWheelProps` gains `onEngagedChange?: (engaged: boolean) => void`. No other task depends on this.

- [ ] **Step 1: Add the engaged state and its ref**

In `option-wheel.tsx`, add `onEngagedChange` to `OptionWheelProps`:

```ts
  /**
   * Fired when the wheel takes or releases scroll capture. The Board uses it to
   * swap its hint line, so a reader who has engaged the wheel is told how to get
   * the page back.
   */
  onEngagedChange?: (engaged: boolean) => void;
```

Add it to the destructured parameters in `export default function OptionWheel({ … })`, after `onItemClick`.

Then, immediately after the `rootRef`/`itemRefs` declarations (~line 113), add:

```ts
  /**
   * SCROLL CAPTURE IS OPT-IN.
   *
   * This component used to `preventDefault()` every wheel event over its box,
   * unconditionally. That is correct for a wheel that owns the screen and wrong
   * for one sitting in the hero of a scrolling page: with the cursor anywhere on
   * the deck — most of the hero — the page could not scroll at all, and nothing
   * below the fold was reachable.
   *
   * The usual fix is "yield once you hit the end". There is no end: the Board
   * mounts this with `loop`. So capture is gated on engagement instead, which
   * the root already had the machinery for — it is `tabIndex={0} role="listbox"`,
   * so focus is real state rather than something invented here.
   *
   * Engage: pointerdown on the root, or focus.
   * Release: blur out of the root, Escape, or pointerdown anywhere else.
   *
   * A ref alongside the state because the `wheel` listener is attached once, in
   * an effect that must not re-run and re-register on every engagement.
   */
  const [engaged, setEngaged] = useState(false);
  const engagedRef = useRef(false);
  const onEngagedChangeRef = useRef<OptionWheelProps["onEngagedChange"]>(onEngagedChange);
  const setEngagedBoth = useCallback((next: boolean) => {
    if (engagedRef.current === next) return;
    engagedRef.current = next;
    setEngaged(next);
    onEngagedChangeRef.current?.(next);
  }, []);
```

Find the existing effect that keeps `onChangeRef`/`onItemClickRef` current (search for `onChangeRef.current = onChange`) and add `onEngagedChangeRef.current = onEngagedChange;` beside them, adding `onEngagedChange` to that effect's dependency array. If no such effect exists, add one:

```ts
  useEffect(() => {
    onEngagedChangeRef.current = onEngagedChange;
  }, [onEngagedChange]);
```

Confirm `useState` and `useCallback` are in the React import at the top of the file; add whichever is missing.

- [ ] **Step 2: Gate the wheel handler on it**

Replace the handler body at `option-wheel.tsx:388-389`:

```ts
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cfg = cfgRef.current;
```

with:

```ts
    const onWheel = (e: WheelEvent) => {
      // Disengaged: this event belongs to the page. Returning without
      // preventing default is what lets the landing below the hero exist.
      if (!engagedRef.current) return;
      e.preventDefault();
      const cfg = cfgRef.current;
```

Leave the listener registration (`{ passive: false }`) and the effect's dependency array exactly as they are — the handler still needs to be able to prevent default when it is engaged.

- [ ] **Step 3: Engage on pointerdown and focus, release on blur, Escape and outside clicks**

In `handlePointerDown`, add `setEngagedBoth(true);` as the first statement of the callback body, and add `setEngagedBoth` to its dependency array. The first pointerdown therefore both engages the wheel and begins the drag — there is no dead first gesture.

In `handleKeyDown`, add a branch before the existing key handling:

```ts
    if (e.key === "Escape") {
      setEngagedBoth(false);
      rootRef.current?.blur();
      return;
    }
```

and add `setEngagedBoth` to its dependency array.

Add a new effect after the wheel effect:

```ts
  // Releases capture when the reader's attention goes elsewhere. Only mounted
  // while engaged, so a disengaged wheel costs no document listener.
  useEffect(() => {
    if (!engaged) return;
    const onDocDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (root && e.target instanceof Node && root.contains(e.target)) return;
      setEngagedBoth(false);
    };
    document.addEventListener("pointerdown", onDocDown);
    return () => document.removeEventListener("pointerdown", onDocDown);
  }, [engaged, setEngagedBoth]);
```

On the root element (line ~511), add:

```tsx
      onFocus={() => setEngagedBoth(true)}
      onBlur={(e) => {
        // Focus moving to a card INSIDE the wheel is not a release.
        const next = e.relatedTarget;
        if (next instanceof Node && rootRef.current?.contains(next)) return;
        setEngagedBoth(false);
      }}
```

- [ ] **Step 4: Let touch scroll the page**

Change the root's className at `option-wheel.tsx:516` from `[touch-action:none]` to `[touch-action:pan-y]`, and put the reason above the element:

```tsx
      // `pan-y`, not `none`. `touch-action` governs touch and pen input only —
      // it has no effect on a mouse, and `wheel` events are not subject to it at
      // all — so this costs the desktop nothing and buys back vertical page
      // scroll on a phone, where `none` made the landing below the hero
      // unreachable by any gesture. A touch drag is now panned by the browser
      // and arrives here as `pointercancel`, which `handlePointerEnd` already
      // handles. Phones lose drag-to-turn and keep tap-to-open, which is how a
      // list is read on a phone anyway.
      className={`relative h-full w-full select-none overflow-hidden outline-none [touch-action:pan-y] ${className}`}
```

- [ ] **Step 5: Tell the reader what state the wheel is in**

In `app-deck.tsx`, add state above the `items` memo (near the `selected`/`openName` declarations):

```tsx
  // Whether the wheel is currently taking scroll. The hint below says different
  // things for the two states, because "scroll to browse" is a lie in one of them.
  const [wheelEngaged, setWheelEngaged] = useState(false);
```

Add the prop to the `<OptionWheel>` element, beside `onChange`:

```tsx
                  onEngagedChange={setWheelEngaged}
```

Replace the hint paragraph (`app-deck.tsx:272-278`) with:

```tsx
              <p className="mono mt-2 text-center text-[0.625rem] text-[var(--muted-ink)]">
                {openName !== null
                  ? "still scrollable — click another card to switch"
                  : wheelEngaged
                    ? "wheel has the scroll — Esc, or click away, to scroll the page"
                    : "click the wheel to turn it · click a card to open"}
              </p>
```

Keep the existing comment block above that paragraph — it explains why the word is "open" and not "live", and that is still true.

- [ ] **Step 6: Typecheck and run the suite**

Run: `pnpm test`
Expected: PASS. No test asserts this behaviour (nothing here renders in the harness); this run is confirming the changes compile and nothing else broke.

- [ ] **Step 7: Verify by hand**

Run: `pnpm dev`, open `http://localhost:3000`.

Confirm all five:
1. With the cursor over the wheel and nothing clicked, the mouse wheel scrolls the **page**.
2. Click a card. The card opens, the wheel turns on wheel events, and the hint reads "wheel has the scroll".
3. Press `Escape`. The hint returns to "click the wheel to turn it" and the page scrolls again.
4. Click a card, then click on empty page background. The wheel releases.
5. Drag the wheel with the mouse — it still turns.

- [ ] **Step 8: Commit**

```bash
git add src/components/board/option-wheel.tsx src/components/board/app-deck.tsx
git commit -m "$(cat <<'EOF'
The card wheel takes the scroll only once you've engaged it

It preventDefaulted every wheel event over its box, so with the cursor
anywhere on the deck the page could not scroll and nothing below the
hero was reachable. Yielding at the ends was not available — the Board
mounts it with `loop`, so there are no ends.

touch-action goes to pan-y for the same reason: it governs touch input
only, so a mouse loses nothing and a phone gets vertical page scroll
back.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The globe scrolls away with the hero

The globe layer is `fixed` to the viewport but positioned with a page coordinate, so its alignment to the wheel is only correct at scroll zero. Making it absolute inside the hero fixes the alignment and makes it leave with the hero.

**Files:**
- Modify: `web/src/components/board/board-globe.tsx:219-235`
- Modify: `web/src/components/board/app-deck.tsx` (the `<section>` at ~line 140, and `measureWheel` ~line 97-105)

**Interfaces:**
- Consumes: nothing.
- Produces: `BoardGlobe`'s `centerY` prop changes meaning — it is now **px from the top of the deck `<section>`**, not from the top of the page. Documented in the prop's JSDoc.

- [ ] **Step 1: Measure the wheel relative to its section, not the page**

In `app-deck.tsx`, add a ref for the section beside `wheelRef`:

```tsx
  const sectionRef = useRef<HTMLElement>(null);
```

Replace the body of `measureWheel`:

```tsx
  const measureWheel = useCallback(() => {
    const el = wheelRef.current;
    const section = sectionRef.current;
    if (!el || !section) return;
    // Relative to the SECTION, not the page. The globe layer used to be fixed to
    // the viewport while this number was a page coordinate — two coordinate
    // systems that only agree at scrollY 0, so the equator drifted off the card
    // arc the moment anyone scrolled. It was invisible while there was nowhere
    // to scroll to. Both are now in the section's box and agree everywhere.
    const r = el.getBoundingClientRect();
    const s = section.getBoundingClientRect();
    setWheelCenterY(r.top - s.top + r.height / 2);
  }, []);
```

Attach the ref to the section element (~line 140):

```tsx
    <section ref={sectionRef} className="relative overflow-x-clip">
```

`relative` is already there; `overflow-x-clip` is new and stops the globe's full-bleed overhang from adding a horizontal scrollbar now that the layer is inside this box.

- [ ] **Step 2: Make the globe layer absolute**

In `board-globe.tsx`, update the `centerY` JSDoc (line 202-209) to say what it now measures:

```tsx
  /**
   * px from the top of the DECK SECTION to put the globe's equator on — the
   * wheel's center row, measured by the deck. The sphere's rim and the card arc
   * then bulge from the same line, which is the only way the two read as one
   * curve. Null before the deck has measured (and when it has no wheel to
   * measure), and the globe falls back to the middle of the viewport.
   */
```

Replace the layer element (lines 227-235):

```tsx
    <div
      aria-hidden
      // ABSOLUTE, not fixed. Fixed gave the globe a full 100vh to live in, but
      // it also pinned it to the viewport while `centerY` — measured by the deck
      // — was a page coordinate, so the alignment this whole prop exists for was
      // only ever correct at scroll 0. Absolute inside the deck section puts
      // both in the same coordinate space, and has the effect the landing wants
      // anyway: the globe belongs to the hero and leaves with it rather than
      // following the reader down through the copy. `h-screen` is kept so the
      // sphere still gets a tall box and is not cropped by the shorter card
      // section; the section clips the overhang with `overflow-x-clip`.
      className="pointer-events-none absolute left-1/2 top-0 -z-10 hidden h-screen w-screen -translate-x-1/2 items-center overflow-hidden lg:flex"
      // Centers the globe in its own h-screen box, then lifts it to the deck's
      // center row. Safe alongside the `-translate-x-1/2` above, which Tailwind
      // v4 writes to the `translate` property — a different property that
      // composes with this one rather than overwriting it.
      style={centerY === null ? undefined : { transform: `translateY(calc(${centerY}px - 50vh))` }}
    >
```

- [ ] **Step 3: Typecheck and run the suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 4: Verify by hand**

Run: `pnpm dev`, open `http://localhost:3000` on a viewport at least 1024px wide.

1. The globe's equator sits on the wheel's centered card, as before.
2. Resize the window tall and short — the equator stays on the centered card at both heights.
3. Scroll down (the wheel now yields, per Task 1). The globe moves up and off with the hero rather than staying pinned.
4. There is no horizontal scrollbar at any width.

- [ ] **Step 5: Commit**

```bash
git add src/components/board/board-globe.tsx src/components/board/app-deck.tsx
git commit -m "$(cat <<'EOF'
Put the globe and the wheel in the same coordinate space

The layer was fixed to the viewport and offset by a page coordinate the
deck measured, so the equator only sat on the card arc at scrollY 0.
Nobody saw it because there was nowhere to scroll to. Absolute inside
the deck section makes the alignment hold at every scroll position, and
lets the globe leave with the hero instead of trailing the reader down
the landing.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The facts module

One module holds every figure the landing prints. Derived where derivable, pinned with provenance where not.

**Files:**
- Create: `web/src/components/landing/facts.ts`
- Create: `web/src/components/landing/facts.test.ts`
- Modify: `web/src/lib/agency/all.test.ts` (import the new test)

**Interfaces:**
- Consumes: `SOURCE_REGISTRY`, `registryCoverage` from `@/lib/kit/sources`; `LIVE_SEED_COUNT`, `SEED_DECLARED_COUNT`, `SEED_DROPPED`, `LIVE_SEED_AT` from `@/lib/seed`; the snapshot JSON.
- Produces, for Tasks 7 and 8:
  - `REGISTRY: { entries: number; verified: number; familiesDeclared: number; familiesLive: number; networks: readonly string[] }`
  - `SEED: { live: number; declared: number; dropped: readonly string[]; measuredAt: string | null; totalCostUsd: number }`
  - `REFERENCE_RUN: { queried: number; healthy: number; dead: number; rows: number; seconds: number; costUsd: number }`
  - `SUBSTREAMS: { breach: {...}; control: {...} }`
  - `ONCHAIN: { arbitrumBlock: number; txHash: string; basescanUrl: string; baseBlock: number; allowanceUsdc: number; kind: string }`
  - `ENS_RECORDS: readonly string[]`, `ENS_PARENT: string`
  - `ZEROG: { tokenId: number; chainId: number; chainName: string; model: string; attestation: string }`

- [ ] **Step 1: Write the failing test**

Create `web/src/components/landing/facts.test.ts`:

```ts
/**
 * The landing page prints numbers. This asserts they come from the code that
 * holds them rather than from a copy-paste of the README, so a `pnpm seed:live`
 * re-run that changes a count changes the page too instead of silently making
 * it wrong.
 */
import { describe, it, assert, assertEqual } from "@/lib/kit/testing";
import { SOURCE_REGISTRY } from "@/lib/kit/sources";
import { LIVE_SEED_COUNT, SEED_DECLARED_COUNT, SEED_DROPPED } from "@/lib/seed";
import { ENS_PARENT, ONCHAIN, REGISTRY, SEED, SUBSTREAMS, ZEROG } from "./facts";

describe("landing facts", () => {
  it("counts registry entries off SOURCE_REGISTRY, not a constant", () => {
    assertEqual(REGISTRY.entries, SOURCE_REGISTRY.length);
    assertEqual(
      REGISTRY.verified,
      SOURCE_REGISTRY.filter((e) => e.verification === "verified").length,
    );
    assert(REGISTRY.verified < REGISTRY.entries, "placeholders exist, so verified is a subset");
  });

  it("counts schema families declared and live separately", () => {
    assertEqual(REGISTRY.familiesDeclared, new Set(SOURCE_REGISTRY.map((e) => e.schema)).size);
    assert(
      REGISTRY.familiesLive <= REGISTRY.familiesDeclared,
      "a family cannot be live without being declared",
    );
  });

  it("lists only networks that have a verified deployment", () => {
    assert(REGISTRY.networks.length > 0, "some network is covered");
    for (const n of REGISTRY.networks) {
      assert(
        SOURCE_REGISTRY.some((e) => e.network === n && e.verification === "verified"),
        `network ${n} has a verified deployment`,
      );
    }
  });

  it("reads seed coverage off the snapshot", () => {
    assertEqual(SEED.live, LIVE_SEED_COUNT);
    assertEqual(SEED.declared, SEED_DECLARED_COUNT);
    assertEqual(SEED.dropped.length, SEED_DROPPED.length);
    assert(SEED.totalCostUsd > 0, "the snapshot records what the run cost");
  });

  it("pins onchain constants in the shape they are claimed in", () => {
    assert(/^0x[0-9a-f]{64}$/i.test(ONCHAIN.txHash), "a 32-byte tx hash");
    assert(ONCHAIN.basescanUrl.includes(ONCHAIN.txHash), "the link points at the hash we print");
    assertEqual(ONCHAIN.kind, "approve");
    assert(ONCHAIN.arbitrumBlock > 0 && ONCHAIN.baseBlock > 0, "real block heights");
  });

  it("keeps the Substreams control run, which is the half that proves anything", () => {
    assert(
      SUBSTREAMS.breach.toBlock > SUBSTREAMS.breach.fromBlock,
      "the breach run spans forward",
    );
    assert(
      SUBSTREAMS.control.toBlock > SUBSTREAMS.control.fromBlock,
      "the control run spans forward",
    );
    assertEqual(SUBSTREAMS.control.firings, 0);
    assertEqual(SUBSTREAMS.breach.firings, 1);
  });

  it("names the ENS parent and the 0G identity", () => {
    assert(ENS_PARENT.endsWith(".eth"), "a real ENS name");
    assertEqual(ZEROG.chainId, 16602);
    assert(ZEROG.tokenId > 0, "a minted token");
  });
});
```

Register it. In `web/src/lib/agency/all.test.ts`, add beside the other component-level import:

```ts
import "@/components/landing/facts.test";
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `pnpm test`
Expected: FAIL at the typecheck stage — `Cannot find module './facts'`.

- [ ] **Step 3: Write the facts module**

Create `web/src/components/landing/facts.ts`:

```ts
/**
 * Every figure the landing page prints, in one module.
 *
 * The rule this file exists to enforce: if the code holds a number, the page
 * reads the code. A landing page that retypes counts out of the README is one
 * `pnpm seed:live` away from asserting something that is no longer true, and
 * this particular product spends its whole voice on not doing that.
 *
 * What cannot be derived — block heights, transaction hashes, attestation ids —
 * is pinned here as a constant WITH the script that measured it and the date,
 * and the page labels those as a recorded run rather than a live reading.
 */
import liveSeed from "@/lib/kit/seed-live.generated.json";
import { SOURCE_REGISTRY, registryCoverage } from "@/lib/kit/sources";
import { LIVE_SEED_AT, LIVE_SEED_COUNT, SEED_DECLARED_COUNT, SEED_DROPPED } from "@/lib/seed";

const snapshot = liveSeed as unknown as {
  generatedAt?: string;
  totalCostUsd?: number;
};

/* ── derived: the source registry ──────────────────────────────────────── */

const VERIFIED = SOURCE_REGISTRY.filter((e) => e.verification === "verified");

export const REGISTRY = {
  /** Every row in the registry, including placeholders for gaps we know about. */
  entries: SOURCE_REGISTRY.length,
  /** Rows whose deployment id was confirmed by the network crawl. */
  verified: VERIFIED.length,
  /** Families the registry declares at all. */
  familiesDeclared: new Set(SOURCE_REGISTRY.map((e) => e.schema)).size,
  /**
   * Families with at least one non-placeholder deployment. `registryCoverage()`
   * skips placeholders, so its key count is exactly this and stays right if the
   * registry gains a family that turns out to have no live deployment.
   */
  familiesLive: Object.keys(registryCoverage()).length,
  networks: [...new Set(VERIFIED.map((e) => e.network))] as readonly string[],
} as const;

/* ── derived: the seed snapshot ────────────────────────────────────────── */

export const SEED = {
  /** Seed apps the snapshot could measure. */
  live: LIVE_SEED_COUNT,
  /** Seed apps declared, measured or not. The denominator. */
  declared: SEED_DECLARED_COUNT,
  /** Named, because "13 of 16" without the names is a number nobody can check. */
  dropped: SEED_DROPPED,
  measuredAt: LIVE_SEED_AT,
  /** What re-measuring every declared app cost, last run. */
  totalCostUsd: snapshot.totalCostUsd ?? 0,
} as const;

/* ── pinned: measured runs, not live readings ──────────────────────────── */

/**
 * The reference fan-out quoted in README.md and submission.md. A recorded run,
 * not a reading — the page says so. The ~28% dead rate is why sources are
 * health-checked at generation time and frozen into the manifest.
 */
export const REFERENCE_RUN = {
  queried: 18,
  healthy: 13,
  dead: 5,
  rows: 74,
  seconds: 2.8,
  costUsd: 0.0014,
} as const;

/**
 * Both directions of `web/scripts/substreams-verify.ts` against
 * arb-one.streamingfast.io. The control run is here on purpose: a harness that
 * can only report a firing proves nothing about the one that should not fire.
 */
export const SUBSTREAMS = {
  endpoint: "arb-one.streamingfast.io",
  network: "arbitrum-one",
  trigger: "healthFactor < 1.15",
  breach: {
    fromBlock: 487508073,
    toBlock: 487508075,
    seconds: 1.5,
    breachBlock: 487508074,
    healthFactor: 1.035,
    firings: 1,
  },
  control: {
    fromBlock: 487509578,
    toBlock: 487509580,
    firings: 0,
  },
} as const;

/**
 * `scripts/substreams-verify.ts --real`. An `approve`, and described as one —
 * granting the router an allowance is genuinely the first step of a swap and is
 * not a swap, and `approve` is its own Action.kind for that reason.
 */
const TX_HASH =
  "0x5a44e9d5d79446afd042928a76d405459242688f479d7257e23143d6190c9d78";

export const ONCHAIN = {
  arbitrumBlock: 487540654,
  kind: "approve",
  amountUsd: 25,
  txHash: TX_HASH,
  basescanUrl: `https://sepolia.basescan.org/tx/${TX_HASH}`,
  baseBlock: 44604106,
  allowanceUsdc: 25,
} as const;

/* ── pinned: identity ──────────────────────────────────────────────────── */

export const ENS_PARENT = "atlas-apps.eth";

/** Written per published mini app. ENSIP-25 and ENSIP-26 records included. */
export const ENS_RECORDS: readonly string[] = [
  "addr",
  "contenthash",
  "agent-context",
  "agent-endpoint[web]",
  "agent-endpoint[mcp]",
  "agent-registration",
  "url · description · avatar",
];

export const ZEROG = {
  tokenId: 10,
  chainId: 16602,
  chainName: "0G Galileo",
  model: "0gm-1.0-35b-a3b",
  attestation: "0g://6f3651f2…",
} as const;
```

- [ ] **Step 4: Run the suite to verify it passes**

Run: `pnpm test`
Expected: PASS, with the `landing facts` block green.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/facts.ts src/components/landing/facts.test.ts src/lib/agency/all.test.ts
git commit -m "$(cat <<'EOF'
Read the landing's figures out of the code that holds them

A landing page that retypes counts from the README is one seed:live run
away from asserting something untrue, on a page whose whole argument is
that we do not do that. Everything derivable is derived; block heights
and hashes are pinned with the script that measured them, and the page
will label those as a recorded run.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: One source of truth for the MCP tool list

The landing advertises the MCP endpoint's tools. `TOOLS` lives inside the route handler and the README's table disagrees with the route — it lists five and omits `check_coverage`, while the README's own footer says six. Extracting the list makes the page's copy a compile-time consequence of the server.

**Files:**
- Create: `web/src/lib/mcp-tools.ts`
- Modify: `web/src/app/api/mcp/route.ts` (the `TOOLS` declaration ~line 90-180)
- Modify: `web/src/components/landing/facts.test.ts` (add the parity assertions)
- Modify: `README.md` (the MCP tool table)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `MCP_TOOLS: readonly McpTool[]` where `McpTool = { name: string; description: string; inputSchema: Record<string, unknown> }`. Task 8's endpoints section imports it.

- [ ] **Step 1: Write the failing test**

Append to `web/src/components/landing/facts.test.ts`:

```ts
import { MCP_TOOLS } from "@/lib/mcp-tools";

describe("mcp tool list", () => {
  it("is non-empty and has unique names", () => {
    assert(MCP_TOOLS.length > 0, "the server advertises tools");
    assertEqual(new Set(MCP_TOOLS.map((t) => t.name)).size, MCP_TOOLS.length);
  });

  it("every tool describes itself, because the list is rendered on the landing", () => {
    for (const t of MCP_TOOLS) {
      assert(t.description.trim().length > 0, `${t.name} has a description`);
    }
  });
});
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `pnpm test`
Expected: FAIL at typecheck — `Cannot find module '@/lib/mcp-tools'`.

- [ ] **Step 3: Extract the list**

Create `web/src/lib/mcp-tools.ts`. Move the `TOOLS` array out of `src/app/api/mcp/route.ts` verbatim — every name, description and `inputSchema` unchanged — and export it as `MCP_TOOLS`:

```ts
/**
 * The tools `/api/mcp` advertises.
 *
 * Lifted out of the route so the landing page can print the list without
 * retyping it. That retyping had already gone wrong once in the README, which
 * tabulated five tools and omitted `check_coverage` while its own footer said
 * six. A page that imports this cannot drift from the server.
 *
 * Read-only by design. Nothing here signs or spends — `/api/act` owns the
 * action loop and reads its policy server-side, because an MCP endpoint is a
 * URL strangers point agents at.
 */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOLS: readonly McpTool[] = [
  // …the six entries moved verbatim from route.ts: list_schemas,
  // check_coverage, plan_mini_app, query_graph, build_mini_app,
  // resolve_mini_app.
];
```

Replace the array literal in `route.ts` with an import and a local alias so the rest of the handler is untouched:

```ts
import { MCP_TOOLS } from "@/lib/mcp-tools";

const TOOLS = MCP_TOOLS;
```

Do not change any tool's behaviour, name, description or schema. This is a move, not an edit.

- [ ] **Step 4: Run the suite to verify it passes**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Verify the endpoint still answers with all six**

Run: `pnpm dev`, then in another shell:

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -o '"name":"[a-z_]*"'
```

Expected: six lines — `list_schemas`, `check_coverage`, `plan_mini_app`, `query_graph`, `build_mini_app`, `resolve_mini_app`.

- [ ] **Step 6: Fix the README's table**

In `README.md`, add the missing row to the MCP tool table so it lists six and agrees with the route:

```markdown
| `check_coverage` | Whether a question is answerable from the registry, and what is missing if not |
```

Use the tool's own `description` string from `mcp-tools.ts` as the wording, so the two say the same thing.

- [ ] **Step 7: Commit**

```bash
git add src/lib/mcp-tools.ts src/app/api/mcp/route.ts src/components/landing/facts.test.ts ../README.md
git commit -m "$(cat <<'EOF'
Give the MCP tool list one home

The landing needs to print it, and the README had already shown what
retyping costs: its table lists five tools and omits check_coverage
while its own footer says six. Both the route and the page now import
the same array, so the copy is a compile-time consequence of the server.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The three morph scene documents

Three A2UI documents, authored for the animation but built with the composer's own builders so they break at compile time rather than at demo time, and validated by the renderer's own validator.

**Files:**
- Create: `web/src/components/landing/morph/fixtures.ts`
- Create: `web/src/components/landing/morph/fixtures.test.ts`
- Modify: `web/src/lib/agency/all.test.ts`

**Interfaces:**
- Consumes: `buildDocument`, `bind`, `serverEvent`, `type A2UIComponent`, `type A2UIDocument`, `type JsonValue` from `@/lib/kit/a2ui`; `DEMO_POLICY`, `DEMO_JOURNAL`, `AAVE_V3_POOL` from `@/components/renderer/fixture`.
- Produces, for Task 6: `SCENE_DOCS: { analytics: A2UIDocument; monitor: A2UIDocument; autonomous: A2UIDocument }`.

- [ ] **Step 1: Write the failing test**

Create `web/src/components/landing/morph/fixtures.test.ts`:

```ts
/**
 * The morph is scripted, but it renders through the real renderer and the real
 * catalog. So the three documents have to satisfy exactly what a composed
 * document satisfies — a name outside the catalog would render an inert
 * placeholder on the landing page's centrepiece, which is a worse failure than
 * a red test.
 */
import { describe, it, assert, assertEqual } from "@/lib/kit/testing";
import { readSurface, validateDocument } from "@/lib/kit/a2ui";
import { ALL_COMPONENTS } from "@/lib/contracts/catalog";
import { SCENE_DOCS } from "./fixtures";

const CATALOG = new Set<string>(ALL_COMPONENTS);

describe("morph scene documents", () => {
  it("validates with zero issues", () => {
    for (const [key, doc] of Object.entries(SCENE_DOCS)) {
      const v = validateDocument(doc);
      assert(v.valid, `${key}: ${v.issues.map((i) => `${i.code} ${i.message}`).join("; ")}`);
      assertEqual(v.issues.length, 0, `${key} has no warnings either`);
    }
  });

  it("names only components the client-held catalog holds", () => {
    for (const [key, doc] of Object.entries(SCENE_DOCS)) {
      const surface = readSurface(doc);
      assert(surface !== null, `${key} has a surface`);
      for (const c of surface!.components) {
        assert(CATALOG.has(c.component), `${key}: ${c.component} is in the catalog`);
      }
    }
  });

  it("gives each scene the tier its frame will claim", () => {
    assertEqual(readSurface(SCENE_DOCS.analytics)?.theme?.tier, "readonly");
    assertEqual(readSurface(SCENE_DOCS.monitor)?.theme?.tier, "monitor");
    assertEqual(readSurface(SCENE_DOCS.autonomous)?.theme?.tier, "autonomous");
  });

  it("makes the autonomous scene show what it is allowed to do", () => {
    const names = readSurface(SCENE_DOCS.autonomous)!.components.map((c) => c.component);
    for (const required of ["policy_badge", "trade_log", "kill_switch"]) {
      assert(names.includes(required), `autonomous scene renders its ${required}`);
    }
  });

  it("makes the three scenes look different, which is the whole argument", () => {
    const set = (k: keyof typeof SCENE_DOCS) =>
      new Set(readSurface(SCENE_DOCS[k])!.components.map((c) => c.component));
    const a = set("analytics");
    const m = set("monitor");
    assert(!a.has("gauge"), "the ranked question does not produce a gauge");
    assert(m.has("gauge"), "the bounded-ratio question does");
    assert(a.has("leaderboard"), "the ranked question produces a leaderboard");
  });
});
```

Register it in `web/src/lib/agency/all.test.ts`:

```ts
import "@/components/landing/morph/fixtures.test";
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `pnpm test`
Expected: FAIL at typecheck — `Cannot find module './fixtures'`.

- [ ] **Step 3: Write the fixtures**

Create `web/src/components/landing/morph/fixtures.ts`. Follow the shape of `web/src/components/renderer/fixture.tsx` exactly: block payloads in `buildPayload()` shape keyed by component id, components binding `/blocks/<their own id>`, then `buildDocument`.

```ts
/**
 * The three surfaces the landing's morph animation assembles.
 *
 * Authored, not measured — the landing says so under the frame, and the
 * measured runs are in the receipts section below it. But authored THROUGH the
 * composer's own builders, for the same reason `renderer/fixture.tsx` is: if
 * the wire format moves these break at compile time instead of at demo time,
 * and they render through the real renderer and the real client-held catalog
 * rather than being pictures of it.
 *
 * The three questions are the same subject asked three ways, so the animation
 * teaches the tier ladder before the depth section arrives:
 *   ranked categorical  → leaderboard,  read-only, sits flush
 *   bounded ratio       → gauge,        monitor,   lifts on a live rim
 *   a policy to act on  → the trio,     autonomous, stands proud
 */
import {
  bind,
  buildDocument,
  serverEvent,
  type A2UIComponent,
  type A2UIDocument,
  type JsonValue,
} from "@/lib/kit/a2ui";
import { AAVE_V3_POOL, DEMO_JOURNAL, DEMO_POLICY } from "@/components/renderer/fixture";

export interface Scene {
  /** What the reader watches being typed. */
  prompt: string;
  /** The mono trace that prints while the surface is being built. */
  trace: readonly string[];
  doc: A2UIDocument;
}
```

Then build three scenes. Requirements, not suggestions:

- **`analytics`** — surfaceId `landing-closest-to-liquidation`, `theme: { tier: "readonly", primaryColor: "#0047FF" }`. Components: two `metric_card`s and one `leaderboard`. No `gauge`. The leaderboard block uses `shape: "categorical_ranked"` with `metric`, `unit: "usd"`, `rowCount`, and a `rows` array of five `{ label, value }` entries for Arbitrum lending markets. Metric cards use `shape: "scalar_with_delta"` with `value`, `delta`, `label`, `unit`.
- **`monitor`** — surfaceId `landing-health-watch`, `theme: { tier: "monitor", primaryColor: "#0047FF" }`. Components: one `gauge` (block `shape: "bounded_ratio"`, `value`, `min`, `max`, `target: 1.15`, `unit: "ratio"`), one `alert_banner`, one `time_series` (block `shape: "timeseries_many_metrics"` with a `series` array of `{ name, key, accent, points: [{ t, v }] }`). Generate the points with a small local helper in the style of `hfPoints` in `renderer/fixture.tsx` — a deterministic loop, no `Math.random`.
- **`autonomous`** — surfaceId `landing-repay-guard`, `theme: { tier: "autonomous", primaryColor: "#0047FF" }`. Components: the `gauge` again, `policy_badge` (bound to `DEMO_POLICY`), `trade_log` (bound to `DEMO_JOURNAL`), `kill_switch`. Give `kill_switch` `localAction: { call: "setHalted", args: { halted: true } }` and `action: serverEvent("halt_agent", { scope: "app", halted: true })`, matching `renderer/fixture.tsx`.

Every component gets `data: bind("/blocks/<its id>")` and a `tier` matching the scene. Every scene's `dataModel` must include `meta`, `sources`, `blocks`, and — for the autonomous scene — `policy`, `status: { halted: false, streaming: true }` and `journal`, or `validateDocument` will report dangling bindings.

Each scene's `trace` is four lines in this style, matching the scene's own numbers:

```ts
  trace: [
    "resolve   → lending-cdp@3.1.0 · arbitrum-one",
    "health    → 6/6 deployments answered",
    "fan-out   → 6 sources, 36 rows",
    "compose   → 3 components",
  ],
```

Export at the end:

```ts
export const SCENE_DOCS = {
  analytics: ANALYTICS_SCENE.doc,
  monitor: MONITOR_SCENE.doc,
  autonomous: AUTONOMOUS_SCENE.doc,
} as const;

/** Play order. */
export const SCENES: readonly Scene[] = [ANALYTICS_SCENE, MONITOR_SCENE, AUTONOMOUS_SCENE];
```

- [ ] **Step 4: Run the suite to verify it passes**

Run: `pnpm test`
Expected: PASS, with the `morph scene documents` block green. If `validateDocument` reports `dangling_binding`, a component binds a `/blocks/<id>` key the `dataModel.blocks` object does not have — the ids must match exactly.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/morph/fixtures.ts src/components/landing/morph/fixtures.test.ts src/lib/agency/all.test.ts
git commit -m "$(cat <<'EOF'
Three scenes for the morph, built by the composer's own builders

The animation is authored and the page says so. Authoring it through
buildDocument anyway means it breaks at compile time rather than at demo
time, and it renders through the real renderer and the real catalog —
so what a visitor watches assemble is what a published mini app is
actually made of.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The morph section

The centrepiece: a prompt types out, a pipeline trace prints, an interface assembles, three times on a loop.

**Files:**
- Create: `web/src/components/landing/morph/prompt-line.tsx`
- Create: `web/src/components/landing/morph/trace.tsx`
- Create: `web/src/components/landing/morph/morph-section.tsx`

**Interfaces:**
- Consumes: `SCENES` from `./fixtures`; `A2uiRenderer` from `@/components/renderer`; `SectionHead` from `@/components/board/chrome`.
- Produces: `<MorphSection />`, default-exported nothing, named export only. Task 9 mounts it.

- [ ] **Step 1: The typewriter**

Create `prompt-line.tsx`:

```tsx
"use client";

/**
 * The prompt, typing itself out.
 *
 * One rAF loop advancing a character index against elapsed time — not a timer
 * per character, which drifts under load and leaves N pending timeouts to clean
 * up when the reader scrolls away mid-word.
 */
import { useEffect, useRef, useState } from "react";

export function PromptLine({
  text,
  /** Whole-text duration in ms. Not per character — a longer prompt types faster. */
  durationMs,
  /** False parks the full text with no animation: paused, or reduced motion. */
  animate,
}: {
  text: string;
  durationMs: number;
  animate: boolean;
}) {
  const [shown, setShown] = useState(() => (animate ? 0 : text.length));
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!animate) {
      setShown(text.length);
      return;
    }
    setShown(0);
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      setShown(Math.round(p * text.length));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [text, durationMs, animate]);

  const done = shown >= text.length;

  return (
    <p className="mono text-[0.8125rem] leading-relaxed sm:text-sm">
      <span className="text-[var(--muted-ink)]">&gt;&nbsp;</span>
      {text.slice(0, shown)}
      {/* The caret stops blinking once the prompt is submitted, because a live
          caret on a locked line reads as "still waiting for you". */}
      <span
        aria-hidden
        className={done ? "opacity-0" : "ml-px inline-block w-[0.5ch] animate-pulse bg-[var(--action)]"}
      >
        &nbsp;
      </span>
    </p>
  );
}
```

- [ ] **Step 2: The trace**

Create `trace.tsx`:

```tsx
"use client";

/**
 * The pipeline trace — resolve, health-check, fan-out, compose — printing a
 * line at a time between the prompt and the interface.
 *
 * It is here because the jump from a sentence to a finished UI is too large to
 * read as anything but magic, and "the agent did something clever" is the wrong
 * takeaway. Four lines of what actually happened make the interface look
 * derived rather than dreamt.
 */
export function Trace({ lines, shown }: { lines: readonly string[]; shown: number }) {
  return (
    <ul className="mono mt-3 space-y-1 text-[0.6875rem] text-[var(--muted-ink)]" aria-live="off">
      {lines.map((line, i) => (
        <li
          key={line}
          className={i < shown ? "opacity-100 transition-opacity duration-200" : "opacity-0"}
        >
          {line}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: The timeline and layout**

Create `morph-section.tsx`. It owns one `requestAnimationFrame` loop and derives everything from elapsed time within the current scene.

Phase boundaries, in ms from the start of a scene:

```ts
const TYPE_MS = 2200;
const TRACE_MS = 1600;   // all four lines, evenly spaced
const ASSEMBLE_MS = 900; // components stagger in on .snap-in
const HOLD_MS = 3000;
const SCENE_MS = TYPE_MS + TRACE_MS + ASSEMBLE_MS + HOLD_MS; // 7700
```

Requirements:

- One `IntersectionObserver` on the section root with `threshold: 0.25`. When it leaves, cancel the rAF; when it enters, restart it from the current elapsed value. Nothing animates off screen.
- Pause on `mouseenter` and on `focusin`, resume on `mouseleave`/`focusout`. Pausing freezes elapsed time rather than resetting it.
- A `usePrefersReducedMotion()` hook — `window.matchMedia("(prefers-reduced-motion: reduce)")`, read in an effect so the server render is stable, with a `change` listener. When true: no rAF at all, scene stays on index 0, `PromptLine` gets `animate={false}`, all trace lines shown, the surface rendered at rest with no `.snap-in`.
- Three dots below the frame, each a real `<button>` with `aria-label={`Show scene ${i + 1}: ${scene.prompt}`}` and `aria-current` on the active one, that set the scene index and reset elapsed to the start of the assemble phase (so a click shows the finished interface immediately rather than replaying the typing).
- The A2UI surface renders with:

```tsx
<A2uiRenderer
  document={scene.doc}
  // No policy strip, no kill switch injected by the host — this frame is not a
  // runtime, so the document's own components are all there is. That is also
  // what makes the autonomous scene's trio meaningful: the document carries them.
  className={assembling ? "[&>*]:snap-in" : undefined}
/>
```

  Set `--i` per child for the stagger by wrapping each rendered child — if that is not reachable from outside the renderer, instead apply `.snap-in` to the frame's container and accept a single settle rather than a per-component stagger. Do not modify `renderer.tsx` to expose a hook for this; the spec puts the renderer out of scope.
- The frame is height-locked. On mount, render all three scenes once into an offscreen measuring div (`aria-hidden`, `position: absolute`, `visibility: hidden`, `pointer-events: none`), take the max `offsetHeight`, store it, and remove the measuring div. Apply that as `minHeight` on the frame so the page does not jump between scenes.
- Layout: `lg:grid lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-10`. Left column holds the section copy, the `PromptLine` and the `Trace`. Right column holds the frame. Below `lg`, stacked with the frame second.

Section copy, above the prompt:

```tsx
<SectionHead
  title="You didn't build this interface. You asked for it."
  note="three prompts, three interfaces"
/>
```

and under the frame, the label from spec §4.5:

```tsx
<p className="mono mt-3 text-[0.625rem] text-[var(--muted-ink)]">
  a demonstration —{" "}
  <a href="#receipts" className="underline underline-offset-2">
    the measured runs are below
  </a>
</p>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm test`
Expected: PASS. Nothing here is unit-tested — no component renders in this harness — so this run only confirms it compiles.

- [ ] **Step 5: Verify by hand**

Temporarily mount `<MorphSection />` at the end of `page.tsx` (Task 9 does this properly) and run `pnpm dev`.

1. The prompt types, the trace prints, the interface assembles, it holds, then the next scene starts.
2. All three scenes play and the frame height never changes.
3. Hovering the section pauses it; leaving resumes from where it stopped.
4. Scrolling the section fully off screen stops it — confirm with a `console.count` in the rAF tick, removed before commit.
5. In devtools, emulate `prefers-reduced-motion: reduce` and reload: scene 1 is shown finished, nothing types, the dots still switch scenes.
6. Tab to the dots — focus ring visible, `Enter` switches scene.

- [ ] **Step 6: Commit**

```bash
git add src/components/landing/morph/
git commit -m "$(cat <<'EOF'
The morph: a prompt becoming an interface, three times

The argument this page has to make is that nobody drew this UI. Reading
that is not the same as watching it, so the centrepiece is the watching:
prompt, the four lines of pipeline that make the result look derived
rather than dreamt, then the surface assembling out of the real catalog.

One rAF loop, stopped by an IntersectionObserver when off screen, and it
does not run at all under prefers-reduced-motion.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Act I — why, depth, containment, and the seam

Three copy sections and the rule between the acts. Copy is verbatim from spec §5.1–5.3.

**Files:**
- Create: `web/src/components/landing/why-section.tsx`
- Create: `web/src/components/landing/depth-section.tsx`
- Create: `web/src/components/landing/containment-section.tsx`
- Create: `web/src/components/landing/act-rule.tsx`

**Interfaces:**
- Consumes: `REGISTRY` from `../facts`; `Panel` from `@/components/brutal`; `SkinToggle` from `@/components/board/skin-toggle`; `SectionHead` from `@/components/board/chrome`.
- Produces: `<WhySection />`, `<DepthSection />`, `<ContainmentSection />`, `<ActRule />`. Task 9 mounts all four.

- [ ] **Step 1: `why-section.tsx`**

Server component — no `"use client"`. Copy verbatim from spec §5.1. Under the prose, a three-figure rule reading from `REGISTRY`:

```tsx
<dl className="mono mt-6 grid grid-cols-3 gap-4 border-t border-hairline pt-4 text-center">
  <div>
    <dt className="text-[0.625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
      schema families
    </dt>
    <dd className="fig text-2xl">{REGISTRY.familiesLive}</dd>
  </div>
  <div>
    <dt className="text-[0.625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
      verified deployments
    </dt>
    <dd className="fig text-2xl">{REGISTRY.verified}</dd>
  </div>
  <div>
    <dt className="text-[0.625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
      networks
    </dt>
    <dd className="fig text-2xl">{REGISTRY.networks.length}</dd>
  </div>
</dl>
<p className="mt-4 text-sm text-[var(--muted-ink)]">
  The resolver picks a schema family, never a subgraph id — which is why a
  question nobody anticipated still resolves.
</p>
```

- [ ] **Step 2: `depth-section.tsx`**

Server component. Copy verbatim from spec §5.2. Illustrate with three real `Panel`s at their three real tiers, side by side — `Panel` takes a `tier` prop whose own JSDoc says "almost never needed outside the demo grid", which is exactly this:

```tsx
<div className="mt-6 grid gap-4 sm:grid-cols-3">
  <Panel tier="readonly" title="Analytics" meta={<span className="mono text-[0.625rem]">read only</span>}>
    <p className="text-xs text-[var(--muted-ink)]">Sits flush in the surface. Reads, renders, never acts.</p>
  </Panel>
  <Panel tier="monitor" title="Monitoring" meta={<span className="mono text-[0.625rem]">watches</span>}>
    <p className="text-xs text-[var(--muted-ink)]">Lifts, on a live-blue rim. Evaluates triggers and tells you.</p>
  </Panel>
  <Panel tier="autonomous" title="Autonomous" meta={<span className="mono text-[0.625rem]">holds a wallet</span>}>
    <p className="text-xs text-[var(--muted-ink)]">Stands proud, orange, with a shadow under it. Signs, inside a policy.</p>
  </Panel>
</div>
```

Verify `Panel` is exported from `@/components/brutal` (`src/components/brutal/index.ts`) before importing from there; if it is not, import from `@/components/brutal/panel`.

- [ ] **Step 3: `containment-section.tsx`**

Client component only if `SkinToggle` requires it — check `skin-toggle.tsx:115`; it is `"use client"`, so this file can stay a server component and simply render `<SkinToggle />`.

Copy verbatim from spec §5.3. The code line goes in a real `<pre><code>`:

```tsx
<pre className="mono mt-4 overflow-x-auto rounded-[var(--radius)] border border-hairline bg-[var(--card-b)] p-4 text-xs">
  <code>{`lookupCatalog(name) ?? <UnknownComponent/>`}</code>
</pre>
```

The toggle goes under the "Press this." paragraph with one line naming what it does:

```tsx
<div className="mt-4 flex items-center gap-3">
  <SkinToggle />
  <span className="mono text-[0.625rem] text-[var(--muted-ink)]">
    re-skins this page, the hero and every mini app on it
  </span>
</div>
```

- [ ] **Step 4: `act-rule.tsx`**

The visible seam. Small, mono, unmistakable — a judge should be able to see where the argument stops and the evidence starts:

```tsx
/**
 * The seam between the two acts.
 *
 * Everything above it is the case for the product. Everything below it is
 * checkable. Marking the boundary means a reader who only came to verify a
 * sponsor claim can find where to start, and a reader who came for the idea
 * knows when they have finished it.
 */
export function ActRule() {
  return (
    <div className="my-16 flex items-center gap-4" role="separator">
      <span className="h-px flex-1 bg-[var(--hairline)]" />
      <span className="mono text-[0.625rem] uppercase tracking-[0.16em] text-[var(--muted-ink)]">
        everything below this line is checkable
      </span>
      <span className="h-px flex-1 bg-[var(--hairline)]" />
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Verify by hand**

Mount the four temporarily in `page.tsx`, run `pnpm dev`:

1. The three panels show three visibly different depths — flush, lifted with a blue rim, proud with an orange rim and a shadow.
2. Pressing the skin toggle re-skins the panels, the morph frame and the hero at once.
3. Press it through every skin in `SKINS` and confirm the three depths stay distinguishable in each — a skin that flattened them would be a bug, which is what the copy claims.
4. The registry figures render as numbers, not `NaN` or `undefined`.

- [ ] **Step 7: Commit**

```bash
git add src/components/landing/why-section.tsx src/components/landing/depth-section.tsx src/components/landing/containment-section.tsx src/components/landing/act-rule.tsx
git commit -m "$(cat <<'EOF'
Act I: why this doesn't exist, what depth means, what the agent can't do

Three sections of argument, then a visible seam. The depth section uses
real Panels at real tiers rather than pictures of them, and the skin
toggle in the containment section is the shipped one — pressing it
re-skins the hero and the morph too, which is the demonstration.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Act II — receipts, what isn't built, endpoints

The checkable half. Every figure from `facts.ts`; every omission stated at the same visual weight as the achievements.

**Files:**
- Create: `web/src/components/landing/receipts-section.tsx`
- Create: `web/src/components/landing/not-built-section.tsx`
- Create: `web/src/components/landing/endpoints-section.tsx`

**Interfaces:**
- Consumes: everything exported from `../facts`; `MCP_TOOLS` from `@/lib/mcp-tools`; `SponsorMark` from `@/components/brand/sponsor-mark`; `SectionHead` from `@/components/board/chrome`.
- Produces: `<ReceiptsSection />`, `<NotBuiltSection />`, `<EndpointsSection />`.

- [ ] **Step 1: `receipts-section.tsx`**

Server component. The root element carries `id="receipts"` — the morph's label anchors to it.

Contents, in this order, each as a labelled group per spec §5.4:

1. **Registry** — `REGISTRY.entries` entries, of which `REGISTRY.verified` verified deployment ids; `REGISTRY.familiesLive` of `REGISTRY.familiesDeclared` schema families have a live deployment; `REGISTRY.networks.join(" · ")`.
2. **A fan-out run** — rendered as a mono line, exactly the README's form:
   ```tsx
   <pre className="mono overflow-x-auto text-xs">
     <code>
       {`${REFERENCE_RUN.queried} sources queried → ${REFERENCE_RUN.healthy} healthy, ${REFERENCE_RUN.dead} dead skipped by health check → ${REFERENCE_RUN.rows} rows in ${REFERENCE_RUN.seconds}s → $${REFERENCE_RUN.costUsd}`}
     </code>
   </pre>
   ```
   with the note that the dead rate is why sources are health-checked at generation time and frozen into the manifest.
3. **The registry is built by the pipeline** — `SEED.live` of `SEED.declared` seed apps built by resolve → health-check → fan-out → compose; re-measuring every one costs `$${SEED.totalCostUsd}`; measured `{SEED.measuredAt}`. **If `SEED.dropped.length > 0`, name them** — a bare "13 of 16" that does not say which three is a number nobody can check:
   ```tsx
   {SEED.dropped.length > 0 ? (
     <p className="mono mt-1 text-[0.625rem] text-[var(--muted-ink)]">
       no live data in this snapshot: {SEED.dropped.join(", ")}
     </p>
   ) : null}
   ```
4. **Substreams, both directions** — from `SUBSTREAMS`, with the breach run and the control run as two mono lines, and the sentence that the control run is the half that proves anything.
5. **A real transaction** — from `ONCHAIN`. The link is `<a href={ONCHAIN.basescanUrl} target="_blank" rel="noreferrer">`. Include the sentence: *It is an `approve`, and it is described as one — granting the router an allowance is genuinely the first step of a swap, and it is not a swap.*
6. **ENS** — `ENS_PARENT`, wrapped on Sepolia, and `ENS_RECORDS` as a mono list. Note that it was verified from the deployed origin with no write key present.
7. **0G** — from `ZEROG`.

Use `<SponsorMark of="graph" />`, `of="ens"`, `of="zerog"` inline on the clauses that name each protocol, following the pattern in `page.tsx:48-54` — inline in the sentence, never as a logo strip, so each mark inherits the qualification of the sentence it sits in.

- [ ] **Step 2: `not-built-section.tsx`**

Server component. Same heading weight and same type sizes as receipts — this is not a footnote and must not read as one.

Five items, verbatim from spec §5.5: x402 has paid for nothing; one session key signs for every mini app; Subgraph MCP is not wired; three of eight subnames point at manifest bytes that no longer exist; the Substreams success path is unexercised in the app because the account is at its two-stream quota.

Head it:

```tsx
<SectionHead
  title="What isn't built"
  note="stated here rather than left ambiguous"
/>
```

- [ ] **Step 3: `endpoints-section.tsx`**

Server component. The MCP endpoint URL, the tool list from `MCP_TOOLS` (name + description, in a table), the ENS parent from `ENS_PARENT`, and links to `/registry` and the repo.

The MCP config block:

```tsx
<pre className="mono overflow-x-auto rounded-[var(--radius)] border border-hairline bg-[var(--card-b)] p-4 text-xs">
  <code>{`{ "mcpServers": { "atlas": { "type": "http", "url": "<origin>/api/mcp" } } }`}</code>
</pre>
```

Under the table, the line that says why it is safe to publish: *Read-only by design. Nothing here signs or spends — `/api/act` owns the action loop and reads its policy server-side, because an MCP endpoint is a URL strangers point agents at.*

- [ ] **Step 4: Typecheck**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Verify by hand**

Mount the three temporarily, run `pnpm dev`:

1. Every figure renders as a number — no `undefined`, no `NaN`, no empty string.
2. The Basescan link opens the transaction in `ONCHAIN.txHash`.
3. The MCP table lists six tools.
4. "What isn't built" is the same type size and heading weight as "Receipts" — measure it in devtools, do not eyeball it.
5. The mono `<pre>` blocks scroll horizontally on a 375px-wide viewport rather than widening the page.

- [ ] **Step 6: Commit**

```bash
git add src/components/landing/receipts-section.tsx src/components/landing/not-built-section.tsx src/components/landing/endpoints-section.tsx
git commit -m "$(cat <<'EOF'
Act II: the receipts, and the things that aren't built

Every figure comes out of facts.ts, so the page cannot drift from the
snapshot. What isn't built gets the same heading weight as what is —
x402 has paid for nothing, one session key signs for every app, Subgraph
MCP is an env var nothing calls — because a page that hides those is
spending the credibility of the numbers above them.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Compose the page

Wire the hero and the eight sections into `page.tsx`, and run the full manual pass.

**Files:**
- Modify: `web/src/app/page.tsx`

**Interfaces:**
- Consumes: every section component from Tasks 6, 7 and 8.
- Produces: the finished page. Nothing depends on it.

- [ ] **Step 1: Rewrite the page body**

Update the file header comment to say what the page now is — it currently describes only the Board — then compose:

```tsx
export default function BoardPage() {
  return (
    <>
      <TopBar active="board" />

      {/* THE HERO. The Board as it was: the globe, the wheel, the legend. It is
          full-height on purpose — the landing below has to be something you
          scroll TO, not something that crowds the deck. The wheel yields page
          scroll unless you have clicked into it (option-wheel.tsx), which is
          what makes anything below this reachable at all. */}
      <main className="mx-auto flex w-full max-w-[1400px] flex-col px-3 py-4 sm:px-5 sm:py-6">
        <div className="flex min-h-0 min-w-0 flex-col gap-4">
          <AppDeck />
          <TierLegend />
        </div>
      </main>

      <div className="mx-auto w-full max-w-[1400px] px-3 sm:px-5">
        <MorphSection />
        <WhySection />
        <DepthSection />
        <ContainmentSection />
        <ActRule />
        <ReceiptsSection />
        <NotBuiltSection />
        <EndpointsSection />
      </div>

      <footer …unchanged… />
    </>
  );
}
```

Note the `flex-1` is dropped from `<main>`: it was stretching the hero to fill a viewport that now has content below it, which would leave a gap between the legend and the morph.

Give each section consistent vertical rhythm with a shared wrapper class rather than per-file margins — add `className="py-16 sm:py-24"` on each section's own root element inside its file if it is not already there, so the spacing lives with the section.

- [ ] **Step 2: Typecheck and run the suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: PASS with no errors. Watch specifically for "client component" errors — a section that uses hooks without `"use client"` fails here rather than in dev.

- [ ] **Step 4: The full manual pass**

Run `pnpm dev`. Check every item; this is the only verification the visual work gets.

**Scroll and hero**
1. Page scrolls with the cursor over the wheel.
2. Click a card → wheel turns on scroll, hint reads "wheel has the scroll".
3. `Escape` releases it; page scrolls again.
4. On a phone or in devtools touch emulation: vertical swipe over the wheel scrolls the page.
5. The globe leaves with the hero and its equator stays on the centered card at every scroll position.
6. No horizontal scrollbar at 375px, 768px, 1024px, 1440px.

**Morph**
7. Three scenes play in order; frame height never changes.
8. Hover pauses; leaving resumes.
9. Scrolled off screen, the rAF stops.
10. `prefers-reduced-motion: reduce` → scene 1 finished, no typing, dots still work.

**Content**
11. Every figure is a number; no `undefined` or `NaN` anywhere on the page.
12. The skin toggle re-skins hero, morph and all sections together; the three tier depths stay distinguishable in every skin in `SKINS`.
13. "What isn't built" has the same heading weight as "Receipts".
14. The morph's "the measured runs are below" link jumps to the receipts section.
15. The Basescan link opens the right transaction.
16. Tab through the page: dots, skin toggle and every link take focus with a visible ring, in reading order.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "$(cat <<'EOF'
The home page is a landing; the Board is its hero

A stranger arriving at the origin saw sixteen cards on a wheel and had
no way to learn what a mini app is. The argument and the receipts were
both in the README and neither was on the site. Now the deck is the
first screen and everything under it explains, then proves.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review notes

**Spec coverage.** §2.1 → Task 1. §2.2 → Task 1 step 4. §2.3 → Task 2. §3 file layout → Tasks 3–8, composed in Task 9. §4 morph → Tasks 5 and 6. §5.1–5.3 → Task 7. §5.4–5.6 → Task 8. §6 derived figures → Task 3; MCP tool list → Task 4. §7 testing → the test steps in Tasks 3, 4 and 5, and the manual pass in Task 9. §8 out of scope → nothing in this plan calls `/api/graph`, `/api/compose` or `/api/act`, adds a studio input, or edits the composer, planner or renderer.

**Known soft spot.** Task 6 step 3's per-component `.snap-in` stagger depends on whether the stagger index is reachable from outside `A2uiRenderer`. The step states the fallback explicitly (settle the frame as a whole) rather than authorising a renderer change, because spec §8 puts the renderer out of scope. If the stagger matters more than that boundary, that is a decision to raise, not to make inside the task.

**Not covered by automated tests.** Everything visual, all of Tasks 6–9. There is no React test harness in this repo and adding one is out of scope for a landing page. The manual checklists are the verification, and they are written as pass/fail observations rather than "check it looks right".
