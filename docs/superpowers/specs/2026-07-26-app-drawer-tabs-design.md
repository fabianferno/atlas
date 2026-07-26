# App drawer: tabs, one owner per fact, and a visible seam

Date: 2026-07-26

## The problem

Open a card on the board and the drawer shows nine stacked sections. Exactly one
of them is composed by the agent. Nothing on screen says which.

| # | Section | Source | Generated? |
|---|---|---|---|
| — | Drawer header (app name, close) | `app-drawer.tsx:254` | no |
| — | Policy strip (caps, armed, Kill switch) | `app-runtime.tsx:392` | no |
| — | Title, ENS, intent, tier, Run / Watch / Fork | `app-runtime.tsx:450` | no |
| — | Run/watch receipts | `app-runtime.tsx:516` | no |
| 1 | **`AppBody` — the composed document** | `app-runtime.tsx:528` | **yes** |
| 2 | Publish | `publish-panel.tsx` | no |
| 3 | Data plan | `app-runtime.tsx:591` | no |
| 4 | What it is allowed to do | `app-runtime.tsx:747` | no |
| 5 | Ratings | `registry/ratings.tsx` | no |
| 6 | Trade log | `board/ledger.tsx` | no |
| 7 | Provenance | `app-runtime.tsx:927` | no |
| 8 | Usage | `app-runtime.tsx:965` | no |

Three faults, all confirmed in the code:

1. **The composed UI is unmarked.** `AppBody` sits in a bare `<div className="p-3
   sm:p-4">` inside the same `panelClass(tier)` shell as the hand-written header
   above it, and every section below uses the same `panel` + `SectionHead`
   vocabulary. There is no frame, no label, no seam.

2. **It is buried.** At drawer width the `@4xl` grid at `app-runtime.tsx:571`
   collapses to one column, so all seven rail panels stack beneath the body. The
   product's central claim renders as 1 of 9 and the drawer becomes a scroll.
   The comment at `app-runtime.tsx:383` already concedes the point — the 380px
   rail "only earns its keep when the main column still has room to breathe
   beside it," and at drawer width it never does.

3. **The same fact is rendered twice, by two different authors.** `trade_log`,
   `policy_badge` and `kill_switch` are pushed into the composed document by
   `seed-to-a2ui.ts:365`, `:290` and `:371` — while the runtime *also* renders a
   `TradeLog` panel, a policy strip and a "What it is allowed to do" panel. This
   is the deepest cause of fault 1: when one fact appears twice in two hands,
   authorship cannot be read off the screen at all.

## Design

### 1. Tabs, with a persistent spine

**Never in a tab** — rendered above the tab strip on every view:

- Policy strip including **Kill switch**. A kill switch behind a click is a
  defect, and `app-drawer.tsx:243` is explicit that the board's halt-everything
  control stays clickable the whole time an app runs.
- Title, ENS line, intent, tier tag, Run / Watch / Fork.
- Run/watch receipts — the verdict on whether the numbers on screen are live or
  fixtures. That has to hold on whichever tab the reader is on.

**Tabs**, derived per tier rather than fixed:

| Tab | Contains | Shown when |
|---|---|---|
| App | `AppBody` — the composed document, full drawer height | always (default) |
| Data | Data plan + Sources list | always |
| Safety | Signer, caps, keyScope banner, per-constraint enforcement, registry line, allowlist, triggers | autonomous only |
| Activity | Trade log + Usage | Trade log autonomous/monitor; Usage always |
| About | Publish + Provenance + Ratings | always |

Standard ARIA tablist with arrow-key navigation. This does not fight the option
wheel: the wheel's arrow handling is `onKeyDown` on its own focused element
(`option-wheel.tsx:522`, `role="listbox"`, `tabIndex={0}`), not a document
listener, so the two can never both be focused.

**Publish keeps its argument.** The comment at `app-runtime.tsx:573` insists
Publish must sit beside the header's "unpublished — no ENS subname issued"
claim, and a tab is worse than below the fold. Resolution: Publish lives in
About, and the header line itself becomes the affordance — clicking "unpublished
— no ENS subname issued" switches to About. The claim and its remedy stay
connected without pinning a 664-line panel into every tab.

**Tab state resets when `name` changes,** so flicking the wheel to the next app
lands on App rather than on the previous app's Safety tab.

### 2. One owner per fact

The rule: **each fact is owned by whoever can always show it.** Tabs make this
answerable, because the persistent spine is the only thing on screen
unconditionally.

| Fact | Copies today | New owner | Deleted |
|---|---|---|---|
| Kill switch | strip button `app-runtime.tsx:436` + composed `kill_switch` `seed-to-a2ui.ts:371` | Policy strip — persistent, every tab | composed card |
| Policy / caps | strip + composed `policy_badge` `seed-to-a2ui.ts:290` + "What it is allowed to do" | Strip = live summary; Safety tab = full account | composed card |
| Journal | composed `trade_log` `seed-to-a2ui.ts:365` + `TradeLog` panel `ledger.tsx` | Activity tab panel | composed card |

#### Mechanism

`REQUIRED_FOR_AUTONOMOUS` is a genuine safety invariant, enforced twice:
`composer.ts:1296` at compose time and `renderer.tsx:218` at render time, the
latter re-appending anything missing under a `--loss` label reading *"added by
the client — an autonomous app must show these."* Deleting the three cards from
`appendAutonomous` alone would make the renderer put them back, labelled as a
fault.

The invariant currently reads "these must be in the **document**." What it means
is "these must be **on screen**." So:

- Add `providedByHost?: ComponentName[]` to `A2uiRenderer`, defaulting to `[]`.
- `renderer.tsx:218` becomes
  `!present.has(n) && !providedByHost.includes(n)`.
- `AppBody` gains the same optional prop and forwards it verbatim to
  `A2uiRenderer` at `app-body.tsx:58`. It is the only path between the two.
- `AppRuntime` passes
  `HOST_PROVIDED = ["policy_badge", "trade_log", "kill_switch"]` — the whole
  trio — because the strip and the Activity tab guarantee all three.
- `appendAutonomous` stops pushing them, keeping only the genuine action
  surface: `amount_input`, `allowlist_picker`, `action_button`,
  `confirm_dialog`.

#### Why this is safe

- All three are in `ACTION_COMPONENTS` (`catalog.ts:34`), so `displayHalf`
  already strips whatever the composer emitted. `appendAutonomous` is the
  **single** insertion point for autonomous apps — the seed path and the
  live-run path both pass through it, so this is one edit with no second path.
- `A2uiRenderer` has exactly one caller (`app-body.tsx:58`); `AppBody` has two.
  The Studio preview (`studio-input.tsx:413`) renders a bare draft with no strip
  around it and **must** keep the trio. The `[]` default leaves it untouched;
  only `AppRuntime` opts in.
- The invariant gets *stronger* for the kill switch: today it can be scrolled
  past inside the body; after, it is in chrome that is on screen on every tab.

#### The risk this creates, stated

The App tab will show a spending surface — amount, target, execute — with no
policy card *in the document*. The strip above carries that load entirely. If
the strip is ever made conditional or dropped from a future layout, the
invariant breaks silently and nothing fails. Section 3 answers this
structurally, because the test infrastructure cannot.

`policy_badge`'s caption — *"Enforced at the signer, not suggested to the
model."* — moves onto the strip rather than being lost with the card.

### 3. The seam

One line beneath the tab strip, on the App tab only:

> `Composed by the agent from 412 rows · 3 of 4 deployments live`

Counts come from the last `RunOutcome` / `app.stats`, the same figures the
receipts already report. With section 2 done this needs no caveat: everything
below the line really is the composer's, because the runtime no longer inserts
cards into it.

### 4. File split

`app-runtime.tsx` is 1155 lines and both layouts need the same sections, so the
sections come out.

`AppRuntime` keeps the three fetch hooks, the early returns (`:311`–`:336`), the
persistent spine, and section construction. `useSigner` **must** stay a single
call — it POSTs to `/api/agency/register`, so two callers would double-register.

| File | From |
|---|---|
| `board/app-facts.ts` | `useSigner`, `useStreamMode`, `useZeroGExplorer`, `SignerFacts` |
| `board/app-policy-strip.tsx` | `:392` strip, plus the rescued caption |
| `board/app-receipts.tsx` | `Receipt`, `runReceipt`, `watchReceipt` |
| `board/panels/data-plan.tsx` | `:591` |
| `board/panels/permissions.tsx` | `:747` + `EnforcementRow` |
| `board/panels/provenance.tsx` | `:927` |
| `board/panels/usage.tsx` | `:965` |
| `board/app-sections.tsx` | `tabsFor()` + both layouts |
| → `board/chrome.tsx` | `KV` joins `Fig` / `Label` / `SectionHead` / `TierTag` / `panelClass` |

**Sections are passed as elements, not prop bundles.** `AppRuntime` builds:

```tsx
const sections = {
  app:      <AppBody doc={bodyDoc ?? m.ui} providedByHost={HOST_PROVIDED} … />,
  data:     <DataPlanPanel app={app} signer={signer} stream={stream} noLiveSource={noLiveSource} />,
  safety:   autonomous ? <PermissionsPanel app={app} signer={signer} /> : null,
  activity: <>{watchable ? <TradeLog appName={m.name} /> : null}<UsagePanel app={app} /></>,
  about:    <><AppPublishPanel app={app} /><ProvenancePanel m={m} explorerBase={explorerBase} /><Ratings appName={m.name} /></>,
};
```

…and hands the record to `<TabbedSections>` (drawer) or `<RailSections>` (page,
the existing `@4xl` grid). Layouts arrange and nothing else — about 30 lines
each, no data, no drilling.

`AppRuntime` takes `variant: "drawer" | "page"`, defaulting to `"page"` so the
existing `/a/[name]` route (`app/a/[name]/page.tsx`) keeps the rail unchanged —
the width it was designed for. `app-drawer.tsx:285` is the one call site that
passes `variant="drawer"`.

**Why the policy strip cannot be forgotten.** Section 2 rests the autonomous
invariant on the strip's persistence. The strip is rendered by `AppRuntime`
*above* the layout call and is **not** a member of `sections`. A layout holds no
reference to it and has no way to suppress it. This is deliberate: it is
stronger than a test, which can be deleted, and it is the only enforcement
available given the test infrastructure below.

### 5. Testing

The suite is a hand-rolled harness (`lib/kit/testing`) run under `tsx` via
`all.test.ts`. There is no DOM, no testing-library and no component test
anywhere in the repo. Adding jsdom is out of scope here, so only pure logic is
tested and the untestable guarantee is handled structurally instead.

Added to `all.test.ts`:

- **`tabsFor(tier)`** — pure. Read-only yields App / Data / Activity / About and
  no Safety; monitor yields Activity containing Trade log; autonomous yields all
  five.
- **`missingRequired(tier, present, providedByHost)`** — extracted out of the
  inline computation at `renderer.tsx:217` specifically to be testable. Two
  cases carry the safety argument: `AppRuntime`'s three-item list yields no
  "added by the client" block, and Studio's `[]` default still yields all three.

Not covered, and named rather than papered over: that the strip actually renders
on every tab, and that the seam line reports the counts the receipts report.
Both are visual, both need a DOM, and neither has a harness here.

## Result

`app-runtime.tsx` drops from 1155 lines to roughly 300. The drawer opens on the
composed document at full height with a line naming it as composed, and the
seven hand-written panels move behind four tabs whose contents each have exactly
one author.

## Out of scope

- Adding jsdom / testing-library.
- Changing the composer or the planner.
- Restructuring `/a/[name]` beyond giving it the `variant="page"` path.
- The Studio preview, which keeps its current behaviour by default.
