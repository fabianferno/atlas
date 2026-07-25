# Theme dice button + more skins — design

Date: 2026-07-25

## Goal

Replace the two-way tactile↔flat toggle with a **dice/shuffle** button that jumps
to a random other skin, and add four skins so there are six total. One of the new
skins is a **faithful rendering of The Graph's own brand**.

## Constraints (non-negotiable)

- **One attribute is the whole mechanism.** `document.documentElement.dataset.skin`
  stays the single source of truth. Each skin is a `[data-skin="…"]` token block in
  `globals.css`. No component or catalog changes; deleting a block loses exactly one
  skin and nothing else.
- **Agency stays legible in every skin.** You must always be able to see which
  mini-apps are autonomous (can spend). Two encodings already exist and every new
  skin picks one:
  - **depth** family (tactile default `.panel` rules): agency = elevation. A depth
    skin only re-points `--elev-*` / bevel tokens.
  - **border** family (`flat` `@layer components` rules): agency = border weight. A
    border skin joins the grouped selector list and inherits those rules.
- No hydration mismatch and no first-paint flash (keep the pre-paint boot script and
  `useSyncExternalStore` discipline).

## The six skins

| Skin | Family | Ground | Accent | Notes |
|---|---|---|---|---|
| `tactile` *(existing)* | depth | warm grey `#ECEBE6` | orange `#ff611a` | unchanged |
| `flat` *(existing)* | border | white | blue `#0047FF` | unchanged |
| `graph` *(new)* | depth (purple glow) | Galaxy Dark `#0C0A1D` | Graph Purple `#6F4CFF` | flagship faithful skin |
| `terminal` *(new)* | border (green rules) | near-black `#0B0F0B` | phosphor green `#3BF07A` | mono-forward |
| `blueprint` *(new)* | border (cyan rules) | blueprint navy `#0E1B3A` | cyan `#4FC3F7` | faint cyan grid ground; CAD feel |
| `vaporwave` *(new)* | depth (neon glow) | deep indigo `#160B2E` | magenta `#FF3CAC` | cyan `#59E0FF` live |

> Update (2026-07-25): the original `paper` skin (cream editorial, black hairline
> rules) was dropped — it read as a near-duplicate of `flat` (both light,
> hard-cornered, border weight). It was replaced by `blueprint` above, which
> keeps the border family but moves to a distinct dark navy + cyan identity.

### Graph skin — real brand tokens (from thegraph.com/brand)

Primary: Graph Purple `#6F4CFF`, Galaxy Dark `#0C0A1D`, Lunar Gray `#494755`,
Spacesuit White `#F8F6FF`. Secondary: Astro Blue `#4C66FF`, Galactic Aqua `#66D8FF`,
Starfield Green `#4BCA81`, Nebula Pink `#FF79C6`, Solar Yellow `#FFA801`.

Token mapping:
- `--paper` = `#0C0A1D` (Galaxy Dark), `--card-b` = a lifted purple-tinted dark
  surface, `--ink` = `#F8F6FF` (Spacesuit White), `--muted-ink` = `#9E9BB0`,
  `--hairline` = a low-alpha purple line.
- `--action` = `#6F4CFF`; `--live` = `#4C66FF`; `--gain` = `#4BCA81`;
  `--risk` = `#FFA801`; `--spend` = `#FF79C6`; `--loss` = a harmonized red
  (`#FF5C6C`, brand has none).
- `--elev-*` = **purple-tinted glows** so autonomous panels "stand proud" with a
  purple halo (depth-family agency on a dark ground).

Brand-faithful extras (mirrors what `flat` already does per-skin):
- Font: **Poppins** (the brand's sanctioned free stand-in for Euclid Circular A),
  added via `next/font/google` and applied only under `[data-skin="graph"]`.
- Headings: normal case, Semibold (~600), **no emboss** text-shadow (The Graph's
  headings are not uppercase-embossed like the tactile display type).
- `color-scheme: dark` so native controls/scrollbars match the dark ground.

### Dark-skin shared hygiene (graph, terminal, vaporwave)

Because the base heading style is uppercase + light-ground emboss, every dark skin
turns `text-shadow: none` on `h1/h2/h3/.display` and sets `color-scheme: dark`.
terminal + vaporwave keep uppercase display type (fits their aesthetic); graph does
not. Body's `radial-gradient` top-light is subtle enough to keep on dark grounds.

## The dice button (`skin-toggle.tsx`)

- `SKINS` grows to the six names; `DISPLAY: Record<Skin,string>` gives each a proper
  label (`Tactile`, `Flat`, `The Graph`, `Terminal`, `Paper`, `Vaporwave`).
- Press → pick a **random skin ≠ current**, apply it, persist it, then pre-roll the
  **next** random target.
- Label = `🎲 {DISPLAY[pending]}` — the theme the *next* press switches to
  ("random + name label" choice). Server / first client paint render a stable
  `🎲 Shuffle` (pending is `null` until an effect rolls it post-mount) → no
  hydration mismatch. Title/aria describe the shuffle.
- `SKIN_BOOT_SCRIPT` validation is generated from `SKINS` so the allow-list can't
  drift; unknown/stored-garbage falls back to `DEFAULT_SKIN`.
- `applySkin`, `getSnapshot`, `isSkin` already generalize over `SKINS`; only the
  two-entry `NEXT_LABEL`/`TITLE` maps and the two-way toggle logic are replaced.

## Files touched

- `web/src/components/board/skin-toggle.tsx` — SKINS, DISPLAY, shuffle + pending
  logic, boot-script allow-list, label.
- `web/src/app/globals.css` — four new token blocks; join `terminal`/`paper` into
  the border-family component selectors; per-skin base overrides (fonts, emboss,
  color-scheme) for the dark/brand skins.
- `web/src/app/layout.tsx` — import Poppins, add its `--font-poppins` variable to
  the `<html>` className.

## Out of scope

No changes to the renderer, catalog, manifest, or agent. No new UI beyond the dice
button. Euclid Circular A itself (paid) is not bundled; Poppins is the brand's own
sanctioned substitute.
