# Home as a landing page

**Date:** 2026-07-26
**Status:** approved, ready for planning

The Board (globe + card wheel + tier legend) becomes the hero of a landing page.
Everything below it is new: an animated prompt-to-interface demonstration, three
sections of product argument, then a hard rule and three sections of checkable
proof.

---

## 1. Why

`web/src/app/page.tsx` currently ends at the tier legend and a one-paragraph
footer. A stranger who arrives at the origin sees sixteen cards on a wheel and
has no way to learn what a mini app is, why generating one is different from
building one, or which of the project's claims are backed. The submission and
the README carry all of that and neither is on the site.

Two audiences, in this order:

1. **A crypto-native visitor** who might use it. Needs the idea to land in one
   screen of scrolling, and needs to *see* an interface being made rather than
   read that it can be.
2. **A judge or sponsor reviewer** checking specific claims. Needs the measured
   numbers, the transaction hashes and the ENS records grouped where they can be
   found, and needs the honest list of what is not built — which is the most
   persuasive thing on the page for that reader.

The act structure below serves both without making either read the other's
section.

---

## 2. Two defects in the hero this depends on

Both are pre-existing, both block a landing page, and both are fixed as part of
this work rather than worked around.

### 2.1 The card wheel eats page scroll

`web/src/components/board/option-wheel.tsx:389` calls `e.preventDefault()` on
every `wheel` event over its root, unconditionally. With the cursor anywhere on
the deck — most of the hero — the page cannot scroll. Nothing below the fold is
reachable.

The wheel is also mounted with `loop`, so there is no first or last card: the
common "yield once you hit the end" fix has no end to yield at.

**Fix: capture only while engaged.**

- The root is already `tabIndex={0} role="listbox"`, so focus is real state, not
  an invention. Engage on `pointerdown` on the root, or on focus.
- Release on blur, on `Escape`, and on `pointerdown` outside the root.
- While disengaged `onWheel` returns immediately without preventing default, and
  the page scrolls normally.
- Drag-to-turn and click-to-open are untouched. The first `pointerdown` both
  engages and begins the drag, so there is no dead first gesture.

### 2.2 Touch: `touch-action: none`

`option-wheel.tsx:516` sets `[touch-action:none]` on the root. The browser
decides this before any handler runs, so no engaged-state trick reaches it — a
vertical swipe over the wheel on a phone can never scroll the page.

**Fix: `touch-action: pan-y` on coarse pointers.** Vertical swipe scrolls the
page; the wheel is driven by tapping a card, which centers and opens it. Phones
lose drag-to-turn. That is the accepted trade: trapping page scroll under the
primary content is a worse failure than losing one gesture on a surface where a
list is normally tapped anyway.

Fine pointers keep `touch-action: none` and keep drag.

### 2.3 The globe is fixed to the viewport and mis-aligned already

`web/src/components/board/board-globe.tsx:229` renders `fixed top-0 h-screen`,
offset by `translateY(calc(${centerY}px - 50vh))` where `centerY` is a **page**
coordinate measured by the deck (`app-deck.tsx`, `measureWheel`). A page
coordinate applied to a viewport-fixed layer only agrees at `scrollY === 0`, so
the equator/card-arc alignment the file's own comment describes drifts as soon
as anyone scrolls. Today that is invisible because there is nowhere to scroll
to.

**Fix: make the layer `absolute` inside the hero section.** Both the wheel and
the globe are then in page coordinates, the offset is correct at every scroll
position, and the globe leaves with the hero — which is the requested behaviour.
Full-bleed is preserved by keeping `w-screen left-1/2 -translate-x-1/2`; the
hero section gets `relative` and `overflow-x-clip` so the overhang does not add
a horizontal scrollbar.

---

## 3. Page structure

`page.tsx` stays a composition file. New work lands in
`web/src/components/landing/`, one file per section, none over roughly 200
lines.

```
web/src/components/landing/
  facts.ts                  every figure the page prints, derived (§6)
  morph/
    script.ts               the three scenes: prompt, trace lines, tier, doc ref
    fixtures.ts             three A2UI documents built with buildDocument()
    morph-section.tsx       the timeline driver and layout
    prompt-line.tsx         typewriter + caret
    trace.tsx               the mono pipeline trace
  why-section.tsx
  depth-section.tsx
  containment-section.tsx
  act-rule.tsx              the seam between Act I and Act II
  receipts-section.tsx
  not-built-section.tsx
  endpoints-section.tsx
```

Order on the page:

| Act | Section | Carries |
|---|---|---|
| hero | existing Board | globe, wheel, tier legend |
| I | morph | the animation |
| I | why | The Graph never shipped a consumer surface |
| I | depth | three tiers, agency is visible |
| I | containment | A2UI sends names, not code; live skin toggle |
| — | act rule | visible seam |
| II | receipts | measured numbers, each labelled with what produced it |
| II | not built | the honest omissions |
| II | endpoints | MCP, ENS parent, registry, repo |

The existing footer stays where it is, below Act II.

---

## 4. The morph

The centrepiece. A scripted animation showing a text prompt becoming a rendered
interface, looping three prompts.

### 4.1 Scenes

Same subject, three questions, three visibly different interfaces — which also
teaches the tier ladder before the depth section arrives.

| Prompt | Components | Tier | Makes the point |
|---|---|---|---|
| "Which Arbitrum lending markets are closest to liquidation?" | leaderboard + metric cards | analytics | ranked categorical becomes a leaderboard |
| "Tell me when any Aave position drops below 1.15 health" | gauge + alert banner + time series | monitoring | bounded ratio becomes a gauge; frame lifts, live-blue rim |
| "If health breaks 1.15, repay $25 automatically" | gauge + policy badge + trade log + kill switch | autonomous | frame stands proud, orange rim — depth arrives with the agency |

### 4.2 Authored, but through the real machinery

The three documents live in `landing/morph/fixtures.ts` and are built with
`buildDocument()` from `@/lib/kit/a2ui`, exactly as
`web/src/components/renderer/fixture.tsx:414` does. They break at compile time
if the wire format moves, rather than at demo time. They render through the
actual `<Renderer>` and the actual client-held catalog.

The choreography is scripted and the data is illustrative. The widgets on screen
are the product's own.

### 4.3 Timeline, per scene, about 9.5s

1. Caret blinks; the prompt types out over ~2.2s. One `requestAnimationFrame`
   loop advancing a character index — not a timer per character.
2. The prompt locks. A mono trace prints line by line over ~1.6s:
   `resolve → lending-cdp@3.1.0` · `health-check 6/6` · `fan-out 6 sources` ·
   `compose → 4 components`.
3. The surface assembles: components stagger in on the existing `.snap-in` class
   (`web/src/app/globals.css:762`) about 90ms apart, and the frame's chrome depth
   animates to the scene's tier.
4. Hold ~3s, cross-dissolve to the next scene.

### 4.4 Behaviour

- One `IntersectionObserver` starts and stops a single `rAF` timeline. Nothing
  animates while the section is off screen.
- Three dots jump between scenes. Hover or keyboard focus pauses the loop.
- Under `prefers-reduced-motion` there is no typing and no stagger: scene 1 sits
  finished with its prompt above it, and the dots are the only way to change
  scene. `globals.css:619` already has the media block to extend.
- The frame is measured once to the tallest of the three scenes so the page does
  not jump mid-loop.
- Desktop: prompt and copy left, frame right. Mobile: stacked, frame first.

### 4.5 The label

A single mono line under the frame:

> a demonstration — the measured runs are below

anchored to the receipts section. It costs nothing dramatic, and it means Act
II's real numbers are not standing beside an unlabelled reenactment.

---

## 5. Copy

### 5.1 Why this doesn't exist yet

> **The Graph had everything it needed to be crypto's consumer layer.**
>
> More chains, more protocols, real time, decentralized — and it only ever
> shipped for developers. Every consumer surface built on it was made by hand,
> one dashboard at a time, so only the questions worth a developer's week ever
> got an interface.
>
> Atlas generates the interface per question. An app exists the moment you ask
> for it, including for the long tail nobody would ever build by hand.

Under it, a three-figure rule — schema families, verified deployments, networks
— and the line that makes it work: *the resolver picks a schema family, never a
subgraph id, which is why a question nobody anticipated still resolves.*

### 5.2 Depth encodes agency

> **You can see what a thing is allowed to do by looking at it.**
>
> Analytics sits flush in the surface. Monitoring lifts, on a live-blue rim.
> Autonomous stands proud, orange, with a shadow under it.
>
> The tier is not decoration. An autonomous app always renders its policy strip,
> its kill switch and its trade log — and the renderer enforces that on screen
> rather than trusting the document to include them. A skin that hid which apps
> can spend would be a bug, not a theme.

Illustrated with the three real card faces at their three real depths, reusing
the shipped chrome rather than drawing pictures of it.

### 5.3 The agent cannot inject code

> **It sends a name. It never sends code.**
>
> The model emits A2UI v0.9.1 — a declarative document and a data model. No
> markup, no class names, no styles, no module path. Rendering is a map lookup:
>
> ```
> lookupCatalog(name) ?? <UnknownComponent/>
> ```
>
> There is no `eval`, no `new Function`, no `dangerouslySetInnerHTML` and no
> dynamic import keyed on model output anywhere in the renderer. A name outside
> the catalog renders a visible, inert placeholder — never nothing, never
> something executable. For a generated interface that can move money, that
> containment is the entire safety argument.
>
> **Press this.** One attribute re-expresses the whole system in a different
> material — no component changes, no catalog changes, nothing round-trips to
> the agent. That the swap is possible at all is the proof the interface is
> data.

The control is the shipped `SkinToggle` from
`web/src/components/board/skin-toggle.tsx`, not a copy. Pressing it re-skins the
hero, the morph and every section at once, because `data-skin` is set on the
document element.

### 5.4 Receipts

Grouped under one heading, each figure labelled with what produced it rather
than asserted. Contents:

- **Registry.** Entries in `SOURCE_REGISTRY`, of which verified deployment ids;
  schema families declared and how many have a live deployment; the four
  networks. All derived — see §6.
- **A fan-out run.** `18 sources queried → 13 healthy, 5 dead skipped by health
  check → 74 rows in 2.8s → $0.0014`, with the note that the ~28% dead rate is
  why sources are health-checked at generation time and frozen into the
  manifest.
- **The registry is built by the pipeline.** All seed apps are produced by
  resolve → health-check → fan-out → compose, and re-measuring every one costs
  `$0.0084` total. Counts derived from the snapshot, including `SEED_DROPPED`
  when it is non-empty.
- **Substreams, verified both directions**, off `arb-one.streamingfast.io`:
  breach run blocks `487508073 → 487508075` in 1.5s, `487508074` breaching
  `healthFactor < 1.15`; control run `487509578 → 487509580`, healthy
  throughout, 0 firings. The control run is stated explicitly — a harness that
  can only print a tick proves nothing.
- **A real transaction.** Arbitrum block `487540654` → trigger fired → policy
  passed → session key signed → `0x5a44e9d5…9d78` on Base Sepolia, block
  `44604106`, allowance read back as 25 USDC. Linked to Basescan, and described
  as what it is: an `approve`, which is genuinely the first step of a swap and
  is not a swap.
- **ENS.** `atlas-apps.eth`, wrapped on Sepolia, and the record set written per
  app (`addr`, `contenthash`, `agent-context`, `agent-endpoint[web]`,
  `agent-endpoint[mcp]`, `agent-registration`, plus profile records). Noted as
  verified from the deployed origin with no write key present.
- **0G.** Agentic ID token 10 on Galileo (chain 16602); planning ran on 0G
  Compute (`0gm-1.0-35b-a3b`) with attestation `0g://6f3651f2…`.

### 5.5 What isn't built

Same visual weight as receipts, not a footnote.

- **x402 is implemented and has paid for nothing.** The 402 challenge is parsed
  and answered with a real EIP-3009 signature, but `X402_PRIVATE_KEY` is unset,
  so every row on the board arrived over the API-key gateway.
- **One session key signs for every mini app.** `AGENT_SESSION_PRIVATE_KEY` is
  process-wide. "A wallet per app" is true of the manifest and not of custody.
- **Subgraph MCP is not wired.** `GRAPH_MCP_URL` is an environment variable
  nothing in `src/` calls. Schema resolution runs off the local registry plus a
  live health check. Distinct from *our* MCP server, which is served.
- **Three of the eight issued subnames point at manifest bytes that no longer
  exist** anywhere.
- **The Substreams success path is unexercised inside the app.** The free tier
  allows two concurrent streams and the account is at its quota, so `POST
  /api/stream` reaches the endpoint and is refused. Verified end to end by
  `web/scripts/substreams-verify.ts`; verified as far as the endpoint's answer
  in the product.

### 5.6 Endpoints

MCP URL and its tool list, ENS parent, links to the registry and the studio, the
repo. The tool list is derived, not retyped — see §6.

---

## 6. Where the numbers come from

`landing/facts.ts` is the single module the landing imports figures from. Rules:

- **Derived wherever derivable.** Registry counts come from `SOURCE_REGISTRY`
  and `registryCoverage()` in `packages/atlas-kit/src/kit/sources.ts`. Seed
  counts come from `LIVE_SEED_COUNT`, `SEED_DECLARED_COUNT` and `SEED_DROPPED`
  in `web/src/lib/seed.ts`. Snapshot cost and date come from
  `seed-live.generated.json` (`totalCostUsd`, `generatedAt`). Re-running
  `pnpm seed:live` therefore updates the page.
- **Pinned where it cannot be derived.** Block numbers, transaction hashes,
  attestation ids and the reference fan-out run are constants, each with a
  comment naming the script that measured it and the date. They are labelled on
  the page as a recorded run, not as a live reading.
- **Nothing is retyped from the README.** Where a figure exists in code, the
  page reads the code.

**MCP tool list.** `TOOLS` in `web/src/app/api/mcp/route.ts` holds six tools
(`list_schemas`, `check_coverage`, `plan_mini_app`, `query_graph`,
`build_mini_app`, `resolve_mini_app`). The README's table lists five — it omits
`check_coverage` — while its footer says six, so the two disagree today. `TOOLS`
moves to its own module that both the route and `endpoints-section.tsx` import,
so the page cannot drift from the server. The README discrepancy is fixed in the
same pass.

---

## 7. Testing

Added to the existing suite via `web/src/lib/agency/all.test.ts`, which is the
only entry point (`pnpm test` runs `tsc --noEmit` first, then the suite).

- **`landing/facts.test.ts`** — asserts every derived figure matches its source
  of truth, and that the pinned constants are shaped as claimed (hex length for
  hashes, ordering for block ranges). Catches a `seed:live` re-run that changes a
  count the page prints.
- **Morph documents validate.** The three fixtures are run through the
  renderer's own `validateDocument()` and must produce zero issues, and every
  component name they reference must be in `CATALOG`. The demo cannot ship an
  invalid document or a name the renderer would render as an unknown-component
  placeholder.
- **MCP tool parity.** `endpoints-section.tsx` and the route import the same
  `TOOLS` module, so parity is a compile-time property; the test asserts the
  list is non-empty and that names are unique.
- **Typecheck** covers the fixtures' conformance to the A2UI builders, which is
  the main structural risk in §4.2.

Manual checks before landing, on desktop and on a phone:

- Page scrolls with the cursor over the wheel; wheel still turns after a click
  into it; `Escape` releases it.
- Vertical swipe over the wheel scrolls the page on a touch device.
- Globe leaves with the hero and its equator stays on the wheel's center row at
  every scroll position.
- The morph does not run while off screen, and reduced-motion shows a finished
  scene with no typing.
- The skin toggle in the containment section re-skins hero and landing together.

---

## 8. Out of scope

- No live pipeline call from the landing page. The morph is a scripted
  demonstration; a "run it for real" control would spend gateway credits per
  visitor and can visibly fail or fall back to fixtures.
- No studio prompt box on this surface. The studio stays on the registry; the
  landing links to it.
- No new copy on `/registry` or `/a/[name]`.
- No changes to the composer, planner, catalog or renderer beyond the `TOOLS`
  extraction in §6.
