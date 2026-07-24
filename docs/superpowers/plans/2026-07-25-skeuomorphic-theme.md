# Skeuomorphic Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the whole Graph Minis UI — studio chrome and generated mini-apps — from neo-brutalism to a tactile Dieter Rams / Braun skeuomorphic look, re-encoding (not dropping) every signal the current design carries.

**Architecture:** The design language is centralized in `web/src/app/globals.css` (`:root` tokens + `@layer components` classes) which the `brutal/` primitives and `catalog/` components consume by class name. Re-authoring that CSS converts ~90% of the app with no component churn. The remaining work is (a) the few `brutal/` primitives that hard-code brutalist assumptions in TSX, (b) the board-chrome components that use raw hard-rule / zero-radius Tailwind, and (c) a repo-wide sweep for stragglers.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4 (`@theme inline`, CSS-first config), shadcn primitives, TypeScript. Package manager: **pnpm** (workspace). No unit-test harness exists for the web app; verification is `pnpm -C web build` (which type-checks) plus visual QA via the `/browse` skill.

## Global Constraints

- **This is NOT stock Next.js** — breaking changes vs. training data. Before writing Next-specific code, read the relevant guide in `web/node_modules/next/dist/docs/`. (From `web/AGENTS.md`.)
- **Browser QA uses the `/browse` skill only.** Never call `mcp__claude-in-chrome__*` directly. (From user global CLAUDE.md.)
- **Package manager is pnpm**, run from repo root with `-C web` (avoid `cd`).
- **Preserve all component logic and data flow.** No changes to `CatalogComponentProps`, to agency-tier being client-held, or to which components render per tier.
- **Light mode only.** No dark variant. Keep `.dark { color-scheme: light; }`.
- **Semantic colors keep their exact meanings:** `--live` streaming, `--gain` up, `--loss` down, `--risk` threshold, `--spend` value-leaving-a-wallet-ONLY. `--action` (orange `#ff611a`) is the new decorative/primary accent and carries no data meaning.
- **Agency tier is now encoded as depth/elevation**, not border weight: `readonly` flush + inset groove < `monitor` raised bevel + blue rim < `autonomous` tall bevel + deep shadow + warm rim.
- **Do not rename any design-system CSS class** (`.panel`, `.btn`, `.raise`, `.press`, `.tag`, `.bar*`, `.live-dot`, `.snap-in`, `.policy-strip`) — `brutal/` and `catalog/` depend on these names.
- **Keep all existing CSS custom-property names** components read: `--paper --card-b --ink --rule --muted-ink --hairline --live --gain --loss --risk --spend` and the `--color-*` Tailwind mappings. Repurpose their values; don't delete the tokens.

---

### Task 1: Re-author the design system in `globals.css`

This is the core. It replaces the product design-system section of `globals.css` (everything from the `GRAPH MINI APPS — DESIGN SYSTEM` banner comment to end of file) with the skeuomorphic system. Lines 1–130 (shadcn `@theme inline`, the oklch neutral `:root`/`.dark`, and the first `@layer base`) are left untouched — shadcn primitives still need them.

**Files:**
- Modify: `web/src/app/globals.css` (replace from the `/* ===… GRAPH MINI APPS — DESIGN SYSTEM …*/` banner at line ~131 through EOF)

**Interfaces:**
- Produces (CSS classes/tokens the rest of the plan relies on):
  - Tokens: `--paper --card-b --ink --rule --muted-ink --hairline --action --live --gain --loss --risk --spend --radius`, depth tokens `--bevel-hi --bevel-lo --elev-1 --elev-2 --elev-3 --inset-groove`, legacy `--drop --drop-sm` (repurposed soft).
  - Tailwind utilities via `@theme inline`: `--color-paper --color-ink --color-rule --color-hairline --color-action --color-live --color-gain --color-loss --color-risk --color-spend`, `--shadow-drop --shadow-drop-sm`.
  - Classes: `.panel .panel--monitor .panel--autonomous`, `.policy-strip`, `.raise .raise-sm .press`, `.btn .btn--primary .btn--danger .btn--spend .btn--quiet`, `.tag`, `.bar .bar--60 .bar--35 .bar--accent`, `.cells`, `.live-dot`, `.snap-in`.

- [ ] **Step 1: Baseline the build (pre-change gate)**

Run: `pnpm -C web build`
Expected: build succeeds (records the pre-change baseline; if it already fails, stop and report — the failure is unrelated to this work).

- [ ] **Step 2: Replace the product design-system block**

In `web/src/app/globals.css`, replace everything from the line beginning `/* ============` (the `GRAPH MINI APPS — DESIGN SYSTEM` banner, ~line 131) through the end of the file with exactly:

```css
/* ============================================================================
   GRAPH MINI APPS — DESIGN SYSTEM
   Skeuomorphic, Dieter Rams / Braun. Tactile plastic + warm charcoal controls,
   one orange action accent. Meaning is preserved but re-expressed as material:

   1. Agency tier = DEPTH. readonly sits flush (inset groove); monitor lifts
      with a soft bevel + a live-blue rim; autonomous stands proud — tall bevel,
      deep shadow, warm orange rim. (was: border weight)
   2. Colour is semantic, never decorative. Five accents, one meaning each.
      --spend appears ONLY when value leaves a wallet. --action (orange) is the
      one decorative/primary accent and means nothing about data.
   3. Charts are monochrome ink plus one accent. Bars get a bevel, not a palette.
   4. Mono is a primary voice, not an accent.
   5. Light mode, deliberately.
   ========================================================================= */

:root {
  /* --- ground & material --- */
  --paper:  #ECEBE6;   /* warm light-grey ground */
  --card-b: #F7F6F2;   /* raised plastic surface, a touch lighter than ground */
  --ink:    #2A2724;   /* warm charcoal — controls and text, not pure black */
  --rule:   #2A2724;   /* crisp line colour for chart frames / thin outlines */
  --muted-ink: #8A857C;
  --hairline: #D8D5CD;

  /* --- the one action accent (reference #ff611a) --- */
  --action: #ff611a;

  /* --- semantic accents: one meaning each, tuned for gloss --- */
  --live:  #1F6BFF;   /* streaming, subscribed, running */
  --gain:  #12905A;   /* value up, healthy, policy passed */
  --loss:  #E0402A;   /* value down, policy rejected, source dead */
  --risk:  #F5A623;   /* approaching threshold, degraded, stale */
  --spend: #8B4CF0;   /* value LEAVING a wallet — nothing else */

  /* --- skeuomorphic depth: catch-lights + real drop shadows --- */
  --bevel-hi: rgba(255, 255, 255, 0.85);   /* top-edge highlight */
  --bevel-lo: rgba(0, 0, 0, 0.22);          /* bottom inner shade */
  --elev-1: 0 1px 2px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06);
  --elev-2: 0 2px 4px rgba(0,0,0,0.12), 0 6px 16px rgba(0,0,0,0.10);
  --elev-3: 0 3px 6px rgba(0,0,0,0.16), 0 12px 28px rgba(0,0,0,0.16);
  --inset-groove: inset 0 1px 2px rgba(0,0,0,0.10), inset 0 -1px 1px rgba(255,255,255,0.55);

  /* Legacy names some utilities may reference — repurposed soft. */
  --drop:    var(--elev-2);
  --drop-sm: var(--elev-1);

  /* Rounded again. Buttons override to a pill. */
  --radius: 0.75rem;

  /* Remap shadcn's tokens onto ours so its primitives inherit the system. */
  --background: var(--paper);
  --foreground: var(--ink);
  --card: var(--card-b);
  --card-foreground: var(--ink);
  --popover: var(--card-b);
  --popover-foreground: var(--ink);
  --primary: var(--action);
  --primary-foreground: #fff;
  --secondary: var(--card-b);
  --secondary-foreground: var(--ink);
  --muted: var(--paper);
  --muted-foreground: var(--muted-ink);
  --accent: var(--action);
  --accent-foreground: #fff;
  --destructive: var(--loss);
  --border: var(--hairline);
  --input: var(--hairline);
  --ring: var(--action);
}

@theme inline {
  --color-paper: var(--paper);
  --color-ink: var(--ink);
  --color-rule: var(--rule);
  --color-hairline: var(--hairline);
  --color-action: var(--action);
  --color-live: var(--live);
  --color-gain: var(--gain);
  --color-loss: var(--loss);
  --color-risk: var(--risk);
  --color-spend: var(--spend);
  --shadow-drop: var(--drop);
  --shadow-drop-sm: var(--drop-sm);
}

@layer base {
  /* Skeuomorphism is a lit surface. No dark variant. */
  .dark { color-scheme: light; }

  html { font-family: var(--font-archivo), ui-sans-serif, system-ui, sans-serif; }
  body {
    background:
      radial-gradient(120% 120% at 50% 0%, color-mix(in srgb, var(--paper), white 4%), var(--paper));
    color: var(--ink);
  }

  h1, h2, h3, .display {
    font-family: var(--font-archivo), ui-sans-serif, sans-serif;
    font-stretch: 118%;
    font-weight: 800;
    letter-spacing: -0.02em;
    text-transform: uppercase;
    /* pressed-into-the-surface emboss */
    text-shadow: 0 1px 0 rgba(255,255,255,0.6);
  }

  /* Rule 4 — every figure, address, hash and log line. Tabular always. */
  .mono, code, kbd, samp, pre, td.num, .fig {
    font-family: var(--font-plex-mono), ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
  }

  :focus-visible { outline: 3px solid var(--action); outline-offset: 2px; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
}

@layer components {
  /* --- Rule 1: the signature. Tier drives DEPTH. --- */
  .panel {
    background: var(--card-b);
    border: 1px solid var(--hairline);
    border-radius: var(--radius);
    /* readonly: flush with a faint recessed groove + top catch-light */
    box-shadow: var(--inset-groove), inset 0 1px 0 var(--bevel-hi);
  }
  .panel--monitor {
    border-color: color-mix(in srgb, var(--live) 45%, var(--hairline));
    /* raised, soft bevel, live-blue rim */
    box-shadow:
      inset 0 1px 0 var(--bevel-hi),
      0 0 0 1px color-mix(in srgb, var(--live) 30%, transparent),
      var(--elev-1);
  }
  .panel--autonomous {
    border-color: color-mix(in srgb, var(--action) 55%, var(--ink));
    /* stands proud: tall bevel, deep shadow, warm rim */
    box-shadow:
      inset 0 1px 0 var(--bevel-hi),
      inset 0 -2px 3px var(--bevel-lo),
      0 0 0 1.5px color-mix(in srgb, var(--action) 45%, transparent),
      var(--elev-3);
  }

  /* Only autonomous apps carry a policy strip — an engraved inset band. */
  .policy-strip {
    display: flex; flex-wrap: wrap; gap: .5rem; align-items: center;
    padding: .45rem .75rem;
    border-radius: var(--radius) var(--radius) 0 0;
    border-bottom: 1px solid color-mix(in srgb, var(--action) 40%, var(--hairline));
    background: color-mix(in srgb, var(--action) 12%, var(--card-b));
    color: var(--ink);
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.12);
    font-size: .6875rem; letter-spacing: .06em; text-transform: uppercase;
  }

  /* Actionable surfaces float above the ground. Never on a static panel. */
  .raise    { box-shadow: var(--elev-2), inset 0 1px 0 var(--bevel-hi); }
  .raise-sm { box-shadow: var(--elev-1), inset 0 1px 0 var(--bevel-hi); }
  /* Press = the object sinks into the surface. */
  .press:active { transform: translateY(1px); box-shadow: var(--inset-groove); }

  /* --- the pressable pill (reference button) --- */
  .btn {
    --btn-color: var(--card-b);
    position: relative;
    display: inline-flex; align-items: center; justify-content: center;
    border: none;
    border-radius: 100vh;
    color: var(--ink);
    background-color: var(--btn-color);
    background-image: radial-gradient(circle at 30% 25%,
      color-mix(in srgb, var(--btn-color), white 45%), transparent 70%);
    box-shadow:
      inset 0 1px 1px color-mix(in srgb, var(--btn-color), white 60%),
      inset 0 -2px 3px color-mix(in srgb, var(--btn-color), black 24%),
      var(--elev-1);
    transition: transform .15s ease, box-shadow .15s ease, background-color .15s ease;
    cursor: pointer;
  }
  .btn:hover, .btn:focus-visible {
    transform: translateY(-1px);
    box-shadow:
      inset 0 1px 1px color-mix(in srgb, var(--btn-color), white 60%),
      inset 0 -2px 3px color-mix(in srgb, var(--btn-color), black 24%),
      var(--elev-2);
  }
  .btn:active {
    transform: translateY(1px);
    box-shadow: inset 0 2px 4px color-mix(in srgb, var(--btn-color), black 32%);
  }
  .btn:disabled { cursor: not-allowed; opacity: .4; box-shadow: var(--inset-groove); transform: none; }
  .btn--primary { --btn-color: var(--action); color: #fff; }
  .btn--danger  { --btn-color: var(--loss);   color: #fff; }
  .btn--spend   { --btn-color: var(--spend);  color: #fff; }
  .btn--quiet   {
    background-image: none; box-shadow: none; color: var(--ink);
    border: 1px solid var(--hairline);
  }

  /* --- soft pill chip --- */
  .tag {
    display: inline-flex; align-items: center;
    border: 1px solid var(--hairline);
    border-radius: 100vh;
    background: var(--card-b);
    box-shadow: inset 0 1px 0 var(--bevel-hi), var(--elev-1);
    padding: .15rem .55rem;
    font-size: .6875rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: .04em;
  }

  /* Rule 3 — monochrome bars, beveled fill (no palette). */
  .bar {
    background-image: linear-gradient(180deg, color-mix(in srgb, var(--ink), white 20%), var(--ink));
    border-radius: 3px 3px 0 0;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.25);
  }
  .bar--60 {
    background-image: linear-gradient(180deg,
      color-mix(in srgb, var(--ink) 66%, var(--paper)),
      color-mix(in srgb, var(--ink) 55%, var(--paper)));
  }
  .bar--35 {
    background-image: linear-gradient(180deg,
      color-mix(in srgb, var(--ink) 40%, var(--paper)),
      color-mix(in srgb, var(--ink) 30%, var(--paper)));
  }
  .bar--accent {
    background-image: linear-gradient(180deg, color-mix(in srgb, var(--action), white 25%), var(--action));
  }

  /* Density: hairlines between rows. */
  .cells tr + tr { border-top: 1px solid var(--hairline); }

  /* Indicator lamp: a lit dome, not a flat square. */
  .live-dot {
    width: .5rem; height: .5rem; border-radius: 100vh;
    background: radial-gradient(circle at 35% 30%,
      color-mix(in srgb, var(--live), white 55%), var(--live));
    box-shadow:
      0 0 4px color-mix(in srgb, var(--live) 70%, transparent),
      inset 0 -1px 1px rgba(0,0,0,0.3);
    animation: blip 1.6s steps(1, end) infinite;
  }
  @keyframes blip { 50% { opacity: .35; } }

  /* The animation budget: an interface settling into place. Rise, no clip wipe. */
  .snap-in {
    animation: snap 260ms cubic-bezier(.2,.8,.25,1) both;
    animation-delay: calc(var(--i, 0) * 70ms);
  }
  @keyframes snap {
    from { opacity: 0; transform: translateY(8px) scale(0.99); }
    to   { opacity: 1; transform: none; }
  }
}
```

- [ ] **Step 3: Rebuild to confirm the CSS compiles**

Run: `pnpm -C web build`
Expected: build succeeds. A Tailwind/CSS syntax error here fails the build — fix it before continuing.

- [ ] **Step 4: Visual smoke check**

Start the dev server (`pnpm -C web dev`, background) and use the `/browse` skill to open `http://localhost:3000`.
Expected observations: warm light-grey ground; the Studio panel reads as a raised plastic card with rounded corners; the "Build it" button is a glossy pill; no hard black offset shadows remain. Note anything obviously broken (invisible text, missing backgrounds) for later tasks — do NOT fix chrome-specific issues here (Task 3 owns them).

- [ ] **Step 5: Commit**

```bash
git add web/src/app/globals.css
git commit -m "Reskin the design system to skeuomorphic tokens and classes"
```

---

### Task 2: Convert the `brutal/` primitives

The shared primitives that `catalog/` consumes. Three files hard-code brutalist assumptions in TSX (square-corner buttons via `bg-*` utilities, a bordered SVG legend swatch, the tier chip's inline border-width). Fix them to use the new class vocabulary.

**Files:**
- Modify: `web/src/components/brutal/button.tsx` (intent classes + input)
- Modify: `web/src/components/brutal/chart.tsx:225-229` (Legend swatch)
- Modify: `web/src/components/brutal/tag.tsx` (TierTag uses `.btn`? no — verify no border-weight leak; see step)
- Modify: `web/src/components/brutal/panel.tsx:73-75` (monitor header rule)

**Interfaces:**
- Consumes from Task 1: `.btn .btn--primary .btn--danger .btn--spend .btn--quiet`, `--elev-1`, `--hairline`, `--bevel-hi`.
- Produces: `BrutalButton` intents now map to `.btn--*` classes (no `bg-*`); `BrutalInput` renders inset.

- [ ] **Step 1: Rewrite `BrutalButton` intent map**

In `web/src/components/brutal/button.tsx`, replace the `intentClass` record (lines ~15–21) with:

```tsx
const intentClass: Record<ButtonIntent, string> = {
  default: "",
  primary: "btn--primary",
  spend: "btn--spend",
  danger: "btn--danger",
  quiet: "btn--quiet",
};
```

And in the `className` `cn(...)` call, remove the now-redundant `disabled` shadow overrides (the `.btn:disabled` CSS from Task 1 handles them). Replace the `disabled && "…"` line (lines ~52–53) with:

```tsx
        disabled && "cursor-not-allowed",
```

(Keep the `rounded`/radius-free assumption gone — `.btn` sets its own pill radius. Do not add any `rounded-*` utility.)

- [ ] **Step 2: Make `BrutalInput` inset**

In the same file, replace the `BrutalInput` className `cn(...)` (lines ~68–72) with:

```tsx
      className={cn(
        "fig w-full bg-[var(--card-b)] px-2.5 py-2 text-[1rem] outline-none",
        "rounded-[calc(var(--radius)*0.6)] border border-hairline",
        "shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)] placeholder:text-[var(--muted-ink)]",
        "focus-visible:border-[color:var(--action)]",
        className,
      )}
```

- [ ] **Step 3: Soften the chart Legend swatch**

In `web/src/components/brutal/chart.tsx`, the `Legend` swatch (line ~227) uses `border border-rule`. Replace that `<span aria-hidden …>` with:

```tsx
          <span
            aria-hidden
            className="inline-block h-2 w-3 rounded-[2px] border border-hairline"
            style={{ background: it.color }}
          />
```

(The `Frame`, `YAxis` gridlines and `XLabels` keep `var(--rule)`/`var(--hairline)` strokes — a plotted chart frame is a real drawn line and should stay crisp.)

- [ ] **Step 4: Fix the monitor header rule in `Panel`**

In `web/src/components/brutal/panel.tsx`, the header applies a brutalist dashed live rule for monitor tier (lines ~73–75). Replace that `t === "monitor" && "…"` line with a bevel-friendly hairline glow:

```tsx
            t === "monitor" && "border-b border-[color:color-mix(in_srgb,var(--live)_45%,var(--hairline))]",
```

- [ ] **Step 5: Check `brutal/tag.tsx` for a border-weight leak**

Read `web/src/components/brutal/tag.tsx`. Its `TierTag` uses `<Tag tone=… filled?>` and `LiveDot` — no inline border-width. **No change needed.** (This step is a verification, not an edit: confirm there is no `borderWidth`/`border-[Npx]` in the file. If there is, convert it to a `.tag` class usage.)

- [ ] **Step 6: Build**

Run: `pnpm -C web build`
Expected: build succeeds, no TS errors.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/brutal/button.tsx web/src/components/brutal/chart.tsx web/src/components/brutal/panel.tsx
git commit -m "Convert brutal primitives to the skeuomorphic button and chrome vocabulary"
```

---

### Task 3: Reskin the board chrome

The `board/` components use raw hard-rule / zero-radius Tailwind and inline `background: var(--ink|loss)` on buttons that fight the new gloss. Apply a fixed substitution recipe plus the specific button/tier fixes.

**Files:**
- Modify: `web/src/components/board/chrome.tsx` (`TierTag` inline border-width; `SectionHead` rule)
- Modify: `web/src/components/board/top-bar.tsx` (header rule; Halt/wallet buttons)
- Modify: `web/src/components/board/studio-input.tsx` (header bars, textarea, framed inputs, Publish button, plan dot)
- Modify: `web/src/components/board/app-runtime.tsx` (header rule; kill-switch button; source dots)
- Modify: `web/src/components/board/app-body.tsx`, `web/src/components/board/app-grid.tsx`, `web/src/components/board/ledger.tsx` (apply the substitution recipe)

**Interfaces:**
- Consumes from Tasks 1–2: `.btn .btn--primary .btn--danger`, `.panel*`, `--hairline`, `--bevel-hi`, `--elev-*`.

**Substitution recipe** (apply to every occurrence in the six files, unless a step below overrides it for a specific element):

| Find (raw Tailwind) | Replace with |
|---|---|
| `border-b-[2.5px] border-rule` (section/header underline) | `border-b border-hairline shadow-[inset_0_-1px_0_var(--bevel-hi)]` |
| `border-b-[1.5px] border-rule` | `border-b border-hairline` |
| `border-t-[2.5px] border-rule` | `border-t border-hairline` |
| `border-[2.5px] border-rule` (framed input box) | `rounded-[calc(var(--radius)*0.6)] border border-hairline shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)]` |
| `border-[1.5px] border-rule` (small status square) | `rounded-full border border-hairline` |
| inline `style={{ background: "var(--ink)", color: "var(--card-b)" }}` on a `.btn` | remove the style; add `btn--primary` to className |
| inline `style={{ background: "var(--loss)", color: "#fff" }}` on a `.btn` | remove the style; add `btn--danger` to className |

- [ ] **Step 1: `chrome.tsx` — TierTag depth chip + SectionHead**

In `web/src/components/board/chrome.tsx`, replace the `TierTag` `<span>` (lines ~21–33) so tier reads as depth, not border weight:

```tsx
export function TierTag({ tier, className }: { tier: AgencyTier; className?: string }) {
  return (
    <span
      className={cn("tag inline-flex items-center gap-1.5 whitespace-nowrap", className)}
      style={{
        background: tier === "autonomous" ? "var(--action)" : "var(--card-b)",
        color: tier === "autonomous" ? "#fff" : "var(--ink)",
        boxShadow:
          tier === "autonomous"
            ? "inset 0 1px 0 rgba(255,255,255,0.4), var(--elev-2)"
            : tier === "monitor"
              ? "inset 0 1px 0 var(--bevel-hi), var(--elev-1), 0 0 0 1px color-mix(in srgb, var(--live) 30%, transparent)"
              : "var(--inset-groove)",
      }}
      title={TIER_BLURB[tier]}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}
```

Then in `SectionHead` (line ~57) apply the recipe: change `border-b-[2.5px] border-rule pb-2` to `border-b border-hairline shadow-[inset_0_-1px_0_var(--bevel-hi)] pb-2`.

- [ ] **Step 2: `top-bar.tsx` — header rule + buttons**

In `web/src/components/board/top-bar.tsx`:
- Line ~18: change `border-b-[2.5px] border-rule` on the `<header>` to `border-b border-hairline shadow-[var(--elev-1)]`.
- Halt button (lines ~59–67): remove the inline `style={board.halted ? undefined : { background: "var(--loss)", color: "#fff" }}` and instead set the class conditionally — replace the `className` string with:
  ```tsx
            className={cn(
              "btn ml-auto shrink-0 px-2.5 py-1 text-[0.6875rem] uppercase tracking-[0.08em] sm:ml-0",
              !board.halted && "btn--danger",
            )}
  ```
  (Add `import { cn } from "@/lib/utils";` if not already imported.)
- The halted banner (lines ~79–88): change `border-t-[2.5px] border-rule` to `border-t border-hairline`; leave its `background: var(--loss)` (a full-width alert bar is meant to be solid loss-red, not a control).

- [ ] **Step 3: `studio-input.tsx` — bars, textarea, inputs, Publish, plan dot**

In `web/src/components/board/studio-input.tsx`:
- idle header bar (line ~108): `border-b-[1.5px] border-rule` → `border-b border-hairline`.
- resolving header bar (line ~182): `border-b-[2.5px] border-rule` → `border-b border-hairline`.
- textarea (line ~142): `border-[2.5px] border-rule` → `rounded-[calc(var(--radius)*0.6)] border border-hairline shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)]`.
- name field box (line ~298) and price field box (line ~311): `border-[2.5px] border-rule` → `rounded-[calc(var(--radius)*0.6)] border border-hairline shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)]`.
- PublishBar wrapper (line ~294): `border-t-[2.5px] border-rule` → `border-t border-hairline`.
- Publish button (lines ~322–326): remove `style={{ background: "var(--ink)", color: "var(--card-b)" }}`; change `className="btn press text-sm disabled:opacity-40"` to `className="btn btn--primary press text-sm"`.
- PlanRow status square (lines ~254–260): change `mt-[3px] h-2.5 w-2.5 shrink-0 border-[1.5px] border-rule` to `mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full border border-hairline shadow-[inset_0_-1px_1px_rgba(0,0,0,0.2)]` (keep the inline `background` switch by state).

- [ ] **Step 4: `app-runtime.tsx` — header, kill switch, source dots**

In `web/src/components/board/app-runtime.tsx`:
- app header (line ~117): `border-b-[2.5px] border-rule` → `border-b border-hairline shadow-[inset_0_-1px_0_var(--bevel-hi)]`.
- kill-switch button (lines ~105–112): replace the whole `<button>` with a pill danger control:
  ```tsx
              <button
                type="button"
                onClick={() => void haltRemote(m, !policy.halted)}
                className={cn(
                  "btn press px-2.5 py-0.5 text-[0.625rem] uppercase tracking-[0.08em]",
                  !policy.halted && "btn--danger",
                )}
              >
                {policy.halted ? "Release" : "Kill switch"}
              </button>
  ```
  (Add `import { cn } from "@/lib/utils";` if not present.)
- source status dots (lines ~200–204) and the autonomous source dot: change `h-2 w-2 shrink-0` to `h-2 w-2 shrink-0 rounded-full shadow-[inset_0_-1px_1px_rgba(0,0,0,0.25)]` (keep the inline gain/loss background).

- [ ] **Step 5: Apply the substitution recipe to the remaining three files**

For `web/src/components/board/app-body.tsx`, `web/src/components/board/app-grid.tsx`, and `web/src/components/board/ledger.tsx`: grep each for the recipe's find-patterns and apply the mapped replacement.

Run to enumerate:
```bash
grep -nE "border-(b|t|l|r)?-?\[?[0-9.]*px\]? *border-rule|border-\[?[0-9.]+px\]? border-rule|border-rule|background: \"var\(--(ink|loss)\)\"" web/src/components/board/app-body.tsx web/src/components/board/app-grid.tsx web/src/components/board/ledger.tsx
```
Expected: a list of lines. Apply the recipe table to each. For any `.btn` with an inline `var(--ink)`/`var(--loss)` background, switch to `btn--primary`/`btn--danger`. For any bare `border-rule` outline on a container that is NOT a chart frame, use `border-hairline`.

- [ ] **Step 6: Build + typecheck**

Run: `pnpm -C web build`
Expected: build succeeds, no TS errors (verifies the added `cn` imports resolve and no className typos).

- [ ] **Step 7: Visual QA of chrome via `/browse`**

With `pnpm -C web dev` running, use `/browse` to check:
- `/` — Studio idle: raised plastic card, glossy "Build it" pill, example chips read as soft pills. Type an autonomous-tier example, submit, and confirm the resolving/ready states render with monitor/autonomous depth (not hard borders).
- Top bar: "Halt all" is an orange-free danger pill; wallet button is a plastic pill; header has a soft edge, no hard black rule.
Note and fix any invisible-text or missing-background regressions before committing.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/board/
git commit -m "Reskin board chrome for the skeuomorphic depth model"
```

---

### Task 4: Straggler sweep + full-app QA

Catch any `catalog/` component (or anything missed) that sets raw hard borders / offset shadows / zero-radius, and do a final QA pass across all three tiers.

**Files:**
- Modify: any `web/src/components/catalog/*.tsx` (or elsewhere) surfaced by the sweep.

**Interfaces:**
- Consumes: everything from Tasks 1–3.

- [ ] **Step 1: Sweep for stragglers**

Run:
```bash
grep -rnE "border-\[?[0-9.]+px\]?|shadow-\[.*0 0 0|border-rule|rounded-none|\bshadow-drop\b|background:\s*\"var\(--(ink|loss|spend)\)\"" web/src/components/catalog web/src/components/renderer web/src/components/registry web/src/components/catalog/_shared.tsx 2>/dev/null | grep -v "border-hairline"
```
Expected: a list of candidate lines. This is the work-list for this task.

- [ ] **Step 2: Triage and fix**

For each hit, decide:
- **Chart internals** (SVG `stroke="var(--rule)"`, `Frame`, axis lines, `INK_RAMP`): **leave as-is** — these are drawn plot lines, intentionally crisp/monochrome (Rule 3).
- **Container borders / offset shadows / `rounded-none`**: convert with the same recipe as Task 3 (`border-rule` → `border-hairline`; hard offset shadow → `.raise`/`.raise-sm` or `var(--elev-*)`; drop `rounded-none`).
- **`.btn` with inline `var(--ink|loss|spend)` background**: switch to `btn--primary`/`btn--danger`/`btn--spend`.

Make the edits. If a file has no non-chart hits, skip it.

- [ ] **Step 3: Build**

Run: `pnpm -C web build`
Expected: build succeeds, no TS errors.

- [ ] **Step 4: Full-tier visual QA via `/browse`**

With `pnpm -C web dev` running, use `/browse` to verify, on `/` and on a running app page (`/a/<name>` for a published app, or the registry `/registry`):
- **All three tiers are distinguishable by depth at a glance**: readonly ≈ flush, monitor raised with blue rim, autonomous proud with warm rim + deep shadow.
- Actionable elements (buttons, actionable panels) visibly **lift on hover and sink on press**; static panels do not move.
- The five semantic colors are legible; `spend` violet appears only on wallet-exit figures; `--action` orange is the primary CTA color.
- No horizontal body scroll; charts still scroll inside their own boxes.
- Spot-check 3–4 catalog components that render (e.g. a metric card, a bar chart, a data table, the kill switch) for leftover hard rules.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/
git commit -m "Sweep remaining components onto the skeuomorphic theme"
```

---

## Self-Review

**Spec coverage:**
- Scope = everything, semantics translated → Tasks 1 (classes) + 2 (primitives) + 3 (chrome) + 4 (catalog sweep). ✓
- Tier = depth/elevation → Task 1 `.panel*` box-shadows + Task 3 `TierTag`. ✓
- Palette = reference (orange/warm-grey/charcoal) → Task 1 `:root` tokens. ✓
- `.raise`=soft drop, `.press`=sink, radius restored, pill buttons, glossy semantic buttons, beveled bars, indicator lamp, softened `.snap-in`, engraved policy strip → Task 1. ✓
- Board chrome inline hard-rules & buttons → Task 3. ✓
- Preserve logic / `CatalogComponentProps` / light-mode / tier-client-held → Global Constraints + no logic edits in any task. ✓
- Motion + reduced-motion guard → Task 1 `@keyframes` + preserved `@media (prefers-reduced-motion)`. ✓

**Placeholder scan:** No TBD/TODO. Every code step shows complete code; the substitution recipe gives exact before/after strings; the sweep gives exact grep commands and a triage rule per hit-type. ✓

**Type consistency:** Class names (`.btn--primary/danger/spend/quiet`, `.panel--monitor/autonomous`) are defined in Task 1 and consumed identically in Tasks 2–4. `cn` import guarded where added. Token names (`--action --elev-1/2/3 --bevel-hi --inset-groove --hairline`) defined in Task 1, used verbatim later. ✓
