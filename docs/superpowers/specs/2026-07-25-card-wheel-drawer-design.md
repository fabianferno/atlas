# Card-wheel mini-app deck with slide-in drawer

**Date:** 2026-07-25
**Status:** Approved — ready for implementation planning

## Problem

The Board home surface lists mini apps as `<AppCard>` Links in a static grid
(`web/src/components/board/app-grid.tsx`). Clicking a card navigates away to a
full page at `/a/[name]` (`web/src/app/a/[name]/page.tsx` → `<AppRuntime>`).

We want a more tactile browsing surface: the mini apps are presented as a
**vertical card-wheel** (the React Bits `OptionWheel`, adapted to render cards
instead of text), and opening one slides its detail in as a **drawer** rather
than a full-page navigation — from the right on desktop, from the bottom on
mobile.

## Goals

- Present mini apps as a vertical **card-wheel** with the wheel's motion
  physics: curved arc, tilt, per-step blur/fade, scroll + drag + keyboard
  navigation, and the active (centered) card emphasized.
- Wheel items are the mini-app **cards**, not text labels.
- Opening a card slides in a **drawer** rendering the existing `<AppRuntime>`:
  - Desktop: slides in from the **right** (~60% width), wheel stays on the left
    (~40%) → reads as a 40/60 split.
  - Mobile: rises as a **bottom sheet** with details on top; the wheel stays
    behind. Dismiss by **dragging down** past a threshold or tapping a close
    arrow.
- Keep `/a/[name]` working as a full-page deep-link fallback.

## Non-goals

- No change to `AppRuntime` internals, the store, or the seed data model.
- No change to the Registry page's card grid (it may adopt the extracted card
  face, but its layout stays a grid).
- No backend/API changes.

## Approach (chosen)

Fixed-position **sliding drawer** + a **generalized wheel** that renders
arbitrary node content per item. The drawer is `position: fixed` and animates
via CSS transform, so the left wheel column never reflows — giving a clean
slide and the intended 40/60 split feel without width-animation jank.

### Alternatives considered

- **In-flow reflowing grid column** — the drawer as a real grid column whose
  width animates 0→60%. More literally a "split", but width animations are
  janky and the existing `Ledger` aside would have to reflow with it. Rejected
  for robustness.
- **base-ui `Dialog` as the drawer** — gives built-in focus-trap, portal, and
  escape handling (the project already uses `@base-ui/react`). But
  drag-to-dismiss on mobile still needs a custom pointer layer on top. Deferred:
  the custom drawer handles Escape / focus / scroll-lock for now; base-ui can be
  layered in later without changing the public shape.

## Components

### `web/src/components/board/option-wheel.tsx` (new — adapted from React Bits)

Generalize the `OptionWheel` source from `items: string[]` to render arbitrary
content:

- Props change: `items: { key: string; node: ReactNode }[]` (or `items: T[]`
  plus a `renderItem` render prop — implementer's choice, whichever is cleaner).
- Add an explicit **`rowHeight: number`** prop (pixels). Cards have a fixed
  height that is NOT derived from `fontSize × spacing`, so the wheel's `rowH`
  comes from `rowHeight` in card mode. The text path (`fontSize`/`spacing`) is
  retained for backward-compatible text usage, but card mode uses `rowHeight`.
- Keep ALL existing physics intact: the single rAF loop with frame-rate
  independent exponential smoothing (`smoothing`/`tau`), the circular layout
  (`curve`, `tilt`), per-step `blur`/`fade`/`minOpacity`, `loop`, wheel/touchpad
  scroll (non-passive), pointer drag with click-vs-drag disambiguation, arrow
  keys, and the optional throttled tick sound.
- Keep exposing `--ow-p` (0..1 proximity-to-center) as a CSS var on each item so
  the card face can emphasize the active card (e.g. scale/opacity/shadow) via
  `color-mix`/transform without JS.
- `onChange(index, item)` fires when the wheel settles on a new centered item.
- Tuned **card defaults**: gentle `curve`/`tilt` and small `blur` so cards stay
  readable; horizontal curve kept subtle so cards remain within the column.
- Accessibility: keep `role="listbox"` / `role="option"` / `aria-selected`.

### `web/src/components/board/app-card-face.tsx` (new — extracted)

Extract the visual body of the current `AppCard` (in `app-grid.tsx`) into a
presentational, **fixed-height compact face**:

- Renders: title, ENS/name line, tier tag + network chips, 1–2 key stats, and
  the autonomous **policy strip** + spend bar when the tier is autonomous.
- **Fixed height** so every wheel row has a uniform `rowHeight`.
- No navigation itself — it's purely presentational; the wrapper decides
  behavior (Link in the grid, button in the wheel).
- `AppCard` (the existing Link) and the wheel both wrap this face. Passing an
  active/highlight flag (driven by `--ow-p` or a prop) lets the wheel emphasize
  the centered card.

### `web/src/components/board/app-drawer.tsx` (new)

The slide-in panel that renders `<AppRuntime name={openName} />`:

- `position: fixed`. Desktop: pinned to the right edge, width ~60% (max ~820px),
  slides via `translateX`. Mobile: bottom sheet pinned to the bottom, slides via
  `translateY`.
- **Mobile drag-to-dismiss:** a drag handle at the top; pointer drag translates
  the sheet down and, past a threshold (or with sufficient velocity), closes;
  otherwise it springs back.
- **Close arrow** (right-pointing / down chevron) always present.
- **Escape** closes; body **scroll-lock** while open; move focus into the drawer
  on open and restore on close.
- Scrim: light scrim over the drawer region on desktop (wheel stays visible /
  interactive); full scrim on mobile. Clicking the scrim closes.
- Mounts/unmounts with the slide transition (open/closing states), so it fully
  leaves the DOM when closed.

### `web/src/components/board/app-deck.tsx` (new — orchestrator, client)

Replaces the role of `<AppGrid>` on the Board:

- Holds two pieces of state: `selectedName` (the centered/highlighted card, from
  the wheel's `onChange`) and `openName` (the app whose drawer is open).
- Builds wheel items from `myApps(board)` (same source as `AppGrid`), each item
  being an `<AppCardFace>` wrapped so **clicking opens** that app's drawer (and
  centers it in the wheel). Scrolling only updates `selectedName`; it does not
  auto-open the drawer.
- Renders the `<OptionWheel>` (left/top) and the `<AppDrawer>` (right/bottom).
- Empty state preserved (the "nothing published yet" message from `AppGrid`).

## Board layout changes

`web/src/app/page.tsx`:

- `TopBar`, `LedgerTicker`, `StudioInput`, `TierLegend` unchanged, above the
  deck.
- The mini-apps section becomes `<AppDeck>` in place of `<AppGrid>`.
- Desktop, drawer **closed**: card-wheel occupies the main column; the standalone
  `Ledger` aside remains (as today).
- Desktop, drawer **open**: the fixed drawer covers the right ~60%; the `Ledger`
  aside is visually superseded by the drawer (the runtime shows its own ledger /
  trade log), so it may be hidden or simply sit under the drawer. Wheel stays on
  the left.
- Mobile: card-wheel full width; drawer is the bottom-sheet overlay.

`TierLegend` and the `AppGrid`/`AppCard` exports stay available (AppCard now
composes `AppCardFace`); `/a/[name]` continues to render `<AppRuntime>`
full-width for deep links.

## Data flow

```
useBoard() ──► myApps(board) ──► AppDeck
                                   │  builds items: {key, node: <AppCardFace app/>}
                                   ▼
                            <OptionWheel items rowHeight
                                 onChange=setSelectedName />
                                   │  click on a card ──► setOpenName(app.name)
                                   ▼
                            <AppDrawer open={!!openName}
                                 onClose=... >
                                 <AppRuntime name={openName} />
```

No new global store state is required; `selectedName`/`openName` are local to
`AppDeck`. Existing store selectors (`myApps`, `useBoard`) are reused.

## Interaction summary

| Action | Result |
|--------|--------|
| Scroll / drag the wheel | Wheel eases to nearest card; `selectedName` updates on settle; active card emphasized. |
| Click a card | Wheel centers it; drawer opens for that app. |
| Arrow keys | Move selection one card. |
| Desktop: click scrim / Escape / close arrow | Drawer slides out to the right. |
| Mobile: drag sheet down past threshold / tap scrim / Escape / close arrow | Bottom sheet slides down and unmounts. |
| Visit `/a/[name]` directly | Full-page `AppRuntime` (unchanged). |

## Testing

- **Wheel unit behavior:** given N items and `rowHeight`, settling on an item
  fires `onChange` with the correct index; arrow keys move selection; `loop`
  wraps. (Physics via rAF are hard to assert precisely — assert the
  index/`onChange` contract and DOM `aria-selected`, not exact transforms.)
- **AppCardFace:** renders title/tier/stats; autonomous tier shows the policy
  strip; height is fixed/uniform across tiers.
- **AppDeck:** clicking a card sets `openName` and mounts the drawer with the
  right `AppRuntime`; scrolling does not open the drawer.
- **AppDrawer:** Escape and close-arrow close it; scroll-lock toggles with open
  state; on mobile a downward drag past threshold closes, a small drag springs
  back.
- **Manual QA:** desktop right-slide + 40/60 read; mobile bottom-sheet drag;
  deep-link `/a/[name]` still works.

## Risks / open questions

- **Variable card height** would break the uniform `rowHeight` assumption →
  mitigated by the fixed-height `AppCardFace`.
- **Wheel drag vs. drawer drag** don't conflict (wheel is behind; drawer drag is
  on the sheet handle), but on mobile ensure the wheel's non-passive `wheel`/
  pointer handlers don't fight the sheet — the drawer captures pointer while
  open.
- **Rotation readability:** card rotation from `tilt` must stay subtle enough
  that text stays legible; tune defaults during implementation.
