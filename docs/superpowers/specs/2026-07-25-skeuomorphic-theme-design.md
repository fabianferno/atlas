# Skeuomorphic Theme — Design Spec

**Date:** 2026-07-25
**Status:** Approved (design), pending implementation plan
**Reference:** `dieter-rams-button-skeumorphism-3d.zip` (CodePen by allankukral) — 3D pill button, radial-gradient highlight, inset + outer shadow, physical lift on hover, orange `#ff611a` accent on `#f5f5f5` ground.

## Goal

Convert the entire Graph Minis UI — the studio chrome **and** the generated mini-apps — from its current neo-brutalist design system to a tactile, Dieter Rams / Braun skeuomorphic look, while **preserving every signal the current design encodes**. This is a "translate the semantics" conversion, not a purely aesthetic reskin: each meaning-carrying visual (agency tier, actionability, semantic color) is re-expressed in the tactile language rather than dropped.

## Decisions (locked)

1. **Scope:** Everything — studio chrome and generated mini-apps. Semantics are translated, not discarded.
2. **Agency tier encoding:** Depth / elevation.
   - `readonly` — flush with the surface, faint inset groove.
   - `monitor` — raised, soft bevel + a live-tinted (blue) glow rim.
   - `autonomous` — stands proud: tall bevel, deep drop shadow, warm rim.
3. **Palette:** Match the reference — warm light-grey ground (`#f5f5f5`-ish), orange `#ff611a` as the single action accent, charcoal 3D controls. The five semantic accents keep their exact meanings, rendered glossy.
4. **Light mode only** — unchanged. No dark variant.

## Non-goals

- No component logic changes. `CatalogComponentProps` stays a frozen contract; agency tier stays client-held (the agent still cannot promote itself).
- No new components, no renaming of the design-system CSS classes (keeping names means `brutal/` and `catalog/` don't churn).
- No dark mode. No font-family swap (Archivo + IBM Plex Mono stay).

## The translation table

| Current signal | Meaning | New tactile form |
|---|---|---|
| Border weight (`--bw-readonly/monitor/autonomous`) | agency tier | **Depth/elevation.** readonly = flush + faint inset; monitor = raised bevel + blue glow rim; autonomous = tall bevel + deep shadow + warm rim. |
| Hard offset shadow `.raise` / `.raise-sm` | actionable surface | Soft realistic drop shadow + top inner highlight (object resting above the surface). |
| `.press:active` | pressed | Object sinks: outer shadow collapses, surface goes inset. Mirrors the reference's hover→flat transition. |
| `--radius: 0` | brutalist signature | Removed. Panels gain gentle radius; buttons become pills (`border-radius: 100vh`). |
| Ink primary button | primary action | Orange glossy pill — radial highlight, inset light/dark, outer drop, lifts on hover. The reference button verbatim. |
| `--live/gain/loss/risk/spend` | semantic (streaming / up / down / threshold / value leaving wallet) | Meanings unchanged. Rendered with the reference's `color-mix` gloss: radial highlight, inset light + dark, emboss text-shadow. `--spend` still violet, still only when value leaves a wallet. |
| `.bar` / `.bar--60/35/accent` | monochrome charts + one accent | Monochrome kept; bar fill gains a subtle vertical bevel/gloss instead of flat ink. Do not colour-code protocols. |
| Uppercase Archivo headings | hierarchy | Kept, plus a faint emboss `text-shadow` (pressed-into-surface feel). |
| `.live-dot` blip | streaming | Kept; may gain a soft glow to read as an indicator lamp. |
| `.snap-in` clip reveal | interface assembling | Softened to a gentle rise + settle (no hard clip-path wipe). |
| `.policy-strip` (autonomous) | policy banner | Restyled as an inset engraved strip on the warm autonomous rim. |

## Architecture — where the change lives

The design language is centralized, so the surface area is small:

1. **`web/src/app/globals.css`** — the core of the work.
   - Re-author `:root` tokens: ground (`--paper`, `--card-b`), controls (charcoal), orange accent, the five semantic accents (kept), and **new depth/bevel tokens** (highlight color, shadow color, inset/outset shadow recipes, radius restored to a non-zero value).
   - Re-author every `@layer components` class to the tactile form: `.panel`, `.panel--monitor`, `.panel--autonomous`, `.btn`, `.btn--danger`, `.btn--spend`, `.raise`, `.raise-sm`, `.press`, `.policy-strip`, `.tag`, `.bar`, `.bar--60`, `.bar--35`, `.bar--accent`, `.live-dot`, `.snap-in`.
   - Update `@theme inline` if new tokens must be exposed as Tailwind utilities.
   - Keep `@layer base` typography; add emboss text-shadow to headings.
   - This converts ~90% of the app because `brutal/` and `catalog/` consume these class names and CSS variables.

2. **`web/src/components/brutal/tier.tsx`** — no logic change. `tierPanelClass()` returns the same class names; only their CSS is redefined. Confirm no inline styles need to move.

3. **`web/src/components/brutal/button.tsx`** — pill shape + per-intent gloss. Primarily CSS-driven via `.btn` + intent classes; minor className adjustments (e.g. drop the assumption of square corners). `BrutalInput` restyled to an inset engraved field.

4. **`web/src/components/brutal/panel.tsx`** — verify the header hairline / monitor dashed-rule chrome still reads under the new depth model; adjust the monitor `border-dashed border-live/50` header treatment to fit the bevel look. No structural change.

5. **Board chrome components** — reskin raw Tailwind that assumed hard rules / zero radius:
   - `web/src/components/board/top-bar.tsx`
   - `web/src/components/board/studio-input.tsx`
   - `web/src/components/board/app-runtime.tsx`
   - `web/src/components/board/app-body.tsx`
   - `web/src/components/board/app-grid.tsx`
   - `web/src/components/board/chrome.tsx`
   - `web/src/components/board/ledger.tsx`

6. **Catalog components** (`web/src/components/catalog/*`) — should convert for free via the class + token changes. Spot-check the chart-family components (`bar-chart`, `time-series`, `candlestick`, `heatmap`, `gauge`, `area-stack`, `grouped-bar`, `distribution`) and any that set raw `border`/`shadow`/`rounded` Tailwind directly, and fix the stragglers.

## Depth / bevel model (token sketch)

New tokens in `:root` (names indicative, finalized in implementation):

- `--bevel-light` — top highlight (near-white, low alpha).
- `--bevel-dark` — bottom/inner shadow (charcoal, low alpha).
- `--elev-1`, `--elev-2`, `--elev-3` — outer drop shadows at increasing depth (soft, realistic; replace the hard `5px 5px 0` offset).
- `--inset-groove` — the faint recessed look for `readonly` / pressed states.
- `--radius` — restored to a real value (panels); buttons override to `100vh`.
- `--accent: #ff611a` — orange, the one action accent.

Panels compose these: `readonly` = `--inset-groove`; `monitor` = `--elev-1` + blue rim; `autonomous` = `--elev-3` + warm rim + thicker bevel. Buttons compose radial highlight + `--bevel-light`/`--bevel-dark` inset + `--elev-*`, and on `:active`/`.press` swap to the inset/sunk recipe.

## Motion

- Interactive lift: reference's `transition: all .2s ease-in-out` on buttons and actionable panels (hover raises, active sinks).
- `.snap-in`: rise + settle, no clip wipe.
- Keep the `@media (prefers-reduced-motion: reduce)` guard that zeroes animation/transition durations.

## Preserved exactly

- All component logic and data flow.
- Agency-tier **meaning** (now depth instead of border weight) and its client-held enforcement.
- The five semantic color **meanings**; `--spend` remains wallet-exit-only.
- Light mode only; tabular mono figures; the frozen `CatalogComponentProps` contract.

## Success criteria

- Studio chrome and a running mini-app both read as tactile/skeuomorphic, matching the reference's material feel.
- The three agency tiers are visually distinguishable at a glance via depth (readonly < monitor < autonomous).
- Actionable elements visibly lift and sink; static panels do not.
- All five semantic colors remain legible and carry their meanings; `spend` violet appears only on wallet-exit actions.
- No horizontal body scroll; charts still scroll inside their own boxes.
- `next build` / lint pass; no component logic regressions.

## Risks

- **Depth vs. density.** The app is information-dense; heavy shadows can muddy a packed grid. Mitigation: keep `readonly` nearly flat, reserve strong elevation for `monitor`/`autonomous` and actionable elements only.
- **Contrast/legibility** of gloss text on colored controls. Mitigation: keep the emboss subtle; verify semantic colors still pass legible contrast for figures.
- **Straggler raw-Tailwind** in catalog/chrome that bypasses the class system. Mitigation: the implementation plan includes a grep sweep for raw `border-`, `shadow-`, `rounded-` usages after the core CSS lands.
