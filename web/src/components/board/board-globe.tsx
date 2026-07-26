"use client";

/**
 * The Board's globe — a full-bleed decoration anchored to the left edge, and the
 * thing that clears out of the way when you open an app.
 *
 * It is NOT a boxed circle in a column. It's a big globe that runs off the left
 * of the screen, so the world feels like it continues past the frame. To reach
 * the true viewport edge from inside the Board's padded, max-width container we
 * use the full-bleed trick: an absolutely-positioned layer `w-screen` and
 * re-centered with `-translate-x-1/2`, then clipped, so its left edge lands on
 * the viewport's left edge no matter the container's padding.
 *
 * When a card opens (`open`) the globe slides off that left edge and fades, on
 * the same ~300ms curve the panel arrives on — from the same edge, into the same
 * space. One gesture: the world steps out and the app steps in. Closing
 * reverses it.
 *
 * Leaving is a CSS transform, so the canvas is still mounted and — left alone —
 * still drawing a globe parked off the screen at full rate, since the render
 * loop is JS and sees none of the CSS. Once the slide finishes we tell it to
 * stop; it resumes the moment the panel closes. Same principle as the `lg` gate
 * below: don't spend frames on a globe nobody can see.
 *
 * Desktop only, and genuinely so: the layer is `hidden` below `lg` for layout,
 * but CSS `hidden` still leaves the WebGL canvas mounted and spinning off-screen.
 * A phone should spend nothing on decoration it can't see, so the globe is also
 * gated behind the `lg` media query in JS — below it, nothing mounts at all.
 *
 * ## No WebGL
 *
 * Cobe needs a WebGL context and a desktop browser does not always have one —
 * blocklisted GPU, `webgl.disabled`, a remote desktop, headless Chrome without
 * `--enable-gpu`. There was no handling for that at all: `createGlobe` never
 * painted, the canvas never left `opacity-0` (it is only lifted on the first
 * painted frame), and the left ~45% of the product's FIRST screen was blank
 * paper with nothing in it and nothing said about it.
 *
 * `Globe` now reports the failure and we swap in `StaticGlobe` below — a
 * CSS-only disc, no canvas, no context. It fills the slot rather than leaving
 * it empty because this component **cannot** close the layout up: the space is
 * not ours. It is `--deck-gutter`, a grid track on `app-deck.tsx` derived from
 * `GLOBE_WIDTH` in `board-layout.ts`, and this layer is `fixed` + `-z-10` +
 * `pointer-events-none` — it reserves nothing and occupies nothing. Rendering
 * `null` here would delete the decoration and keep the hole, which is the bug,
 * not the fix. Collapsing the gutter needs the deck to know the globe is
 * absent; that is a change to `app-deck.tsx` and is not made here.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { Globe } from "@/components/ui/globe";
import { GLOBE_LEFT, GLOBE_WIDTH } from "@/components/board/board-layout";
import { cn } from "@/lib/utils";

const DESKTOP_QUERY = "(min-width: 1024px)"; // Tailwind's `lg`

/** ms the slide off the left edge takes — must match `duration-300` below. */
const SLIDE_MS = 300;

/**
 * True at the `lg` breakpoint and up. SSR-safe: the server snapshot is false, so
 * the globe is absent in the initial HTML and mounts after hydration on wide
 * screens — no mismatch, and no canvas ever created on a phone.
 */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(DESKTOP_QUERY);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

/**
 * True once the globe has finished leaving — `open`, plus the slide it takes to
 * get off the screen. Lagging the flag is the whole point: pause on the same
 * tick `open` flips and you'd freeze the globe mid-exit, which is the one moment
 * it's actually being watched. Going back the other way there's no lag at all,
 * so the world is already turning as it comes back in.
 *
 * It answers "is it off the screen", not "is a panel open", because that's what
 * the render loop is being asked. Scroll isn't part of it: the layer is `fixed`
 * and its offset is a constant, so short of the panel the globe is on screen for
 * as long as the Board is.
 */
function useOffScreen(open: boolean): boolean {
  const [gone, setGone] = useState(false);
  // Leaving is timed; coming back is not. Resuming during render (the sanctioned
  // "adjust state while rendering" pattern, same as `AppDrawer`) means the globe
  // is already drawing in the render that starts its slide back in, rather than
  // an effect's tick later — a beat that would show as a blank left edge.
  if (!open && gone) setGone(false);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setGone(true), SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [open]);
  return gone;
}

/**
 * What stands in for the globe when there is no WebGL to draw one with.
 *
 * Pure CSS: a dot grid clipped to a circle by `rounded-full`, faded out toward
 * the rim by a radial mask, over a soft off-centre shade so it reads as a
 * sphere lit from the same corner Cobe lights from (`theta: 0.25`). Built out
 * of `--ink` and `--paper` through `color-mix` so it re-tones with the skin
 * dice for free — the real globe has to be torn down and rebuilt to do that.
 *
 * Deliberately not a picture of the Earth. It is a decoration standing in for a
 * decoration, and a static world map would be a worse lie than an abstract
 * disc: it would imply the globe is there and simply not turning.
 */
function StaticGlobe(): React.JSX.Element {
  return (
    <div
      aria-hidden
      className="aspect-square w-full rounded-full"
      style={{
        backgroundImage: [
          // The dots — the map's stand-in. Two colours would be one too many.
          // The weights here were measured, not guessed: at 14% on a 13px grid
          // this was invisible in a screenshot of the real thing, which is a
          // fallback that has not fallen back. 30% on an 11px grid reads as a
          // sphere across the room and still sits under the cards.
          "radial-gradient(color-mix(in srgb, var(--ink) 30%, transparent) 1.1px, transparent 1.5px)",
          // The shade, off-centre to match the real globe's light.
          "radial-gradient(circle at 34% 30%, color-mix(in srgb, var(--ink) 8%, transparent), transparent 70%)",
        ].join(", "),
        backgroundSize: "11px 11px, 100% 100%",
        // Fades the dots out before the rim, so the disc has no hard edge to
        // read as a boxed circle in a column — the exact thing this file's
        // header says the globe is not.
        maskImage: "radial-gradient(circle at 50% 50%, #000 48%, transparent 80%)",
        WebkitMaskImage: "radial-gradient(circle at 50% 50%, #000 48%, transparent 80%)",
      }}
    />
  );
}

/**
 * The halo behind the sphere — what makes the globe's edge findable on a dark
 * ground.
 *
 * A dark skin gave the globe nowhere to end: base colour a few percent off the
 * paper, no rim, so the left half of the first screen was a dotted smudge with
 * no silhouette. Cobe now rims its own limb (`--globe-rim`, see `globe.tsx`),
 * and this is the outer half of the same effect — the bloom that spills past the
 * disc onto the paper, which Cobe's atmosphere is far too tight to give.
 *
 * ## Why a sibling div and not a filter on the canvas
 *
 * `filter: drop-shadow()` on the canvas would trace the sphere's real alpha for
 * free and need none of the geometry below. It would also re-run a ~100px blur
 * over an 820px surface on every one of the 30 frames a second this thing draws,
 * on the layer that is on screen for as long as the Board is. This div paints
 * once and then never again — the sphere's size is a constant, so the halo can
 * be one too.
 *
 * `inset-[10%]` is that constant: Cobe's sphere is `dot(b,b) <= 0.64` in a
 * -1..1 square, i.e. radius 0.8, so the disc is 80% of the canvas box and the
 * halo has to be inset 10% a side to sit on its edge rather than outside it.
 * Three shadows of one colour rather than one big blur, so the falloff has a
 * bright edge and a long tail instead of reading as a uniform grey doughnut.
 *
 * On light skins `--globe-glow` is `transparent` and this paints nothing.
 */
function GlobeHalo(): React.JSX.Element {
  return (
    <div
      aria-hidden
      // `-z-10` because it has to be BEHIND the sphere: a positioned element
      // paints over its static siblings by default, which put the inner half of
      // the bloom on top of the map instead of under it. Negative z-index
      // resolves inside the sliding layer above (which `will-change: translate`
      // already makes a stacking context), so this drops behind the canvas
      // without escaping the globe layer.
      className="pointer-events-none absolute inset-[10%] -z-10 rounded-full"
      style={{
        boxShadow: [
          // The tight layer is thinned, because all three stack at the limb and
          // three full-strength shadows there summed to a hard neon ring — the
          // loudest thing on the screen, on a decoration that sits behind the
          // cards. Thin the near one, keep the far ones, and the falloff reads
          // as air around a planet instead of a stroke around a circle.
          "0 0 24px color-mix(in srgb, var(--globe-glow) 45%, transparent)",
          "0 0 80px color-mix(in srgb, var(--globe-glow) 75%, transparent)",
          "0 0 170px var(--globe-glow)",
        ].join(", "),
      }}
    />
  );
}

export function BoardGlobe({
  open,
  centerY,
}: {
  open: boolean;
  /**
   * px from the top of the DECK SECTION to put the globe's equator on — the
   * wheel's center row, measured by the deck. The sphere's rim and the card arc
   * then bulge from the same line, which is the only way the two read as one
   * curve. Null before the deck has measured (and when it has no wheel to
   * measure), and the globe falls back to the middle of the viewport.
   */
  centerY: number | null;
}): React.JSX.Element {
  const isDesktop = useIsDesktop();
  const offScreen = useOffScreen(open);
  // Optimistic: assume the context is there and let `Globe` tell us it isn't.
  // One code path instead of two — a probe here would have to agree with the
  // one Cobe's own `createGlobe` performs, and it would still miss the case
  // where the context exists and construction throws anyway.
  const [webgl, setWebgl] = useState(true);

  return (
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
      <div
        className={cn(
          "flex items-center",
          // Tailwind v4 drives `-translate-x-*` through the CSS `translate`
          // property, not `transform`, so the transition and will-change name
          // `translate` or the slide would snap while only the fade animated.
          "transition-[translate,opacity] duration-300 ease-out will-change-[translate,opacity]",
          open ? "-translate-x-[115%] opacity-0" : "translate-x-0 opacity-100",
        )}
      >
        {/* Placed off `board-layout`, not by hand: the wheel and the open panel
            are both measured from this globe's right edge, so its position and
            width are shared constants rather than classes only this file knows. */}
        {isDesktop ? (
          <div className="relative" style={{ marginLeft: GLOBE_LEFT, width: GLOBE_WIDTH }}>
            {/* Behind whichever globe we draw, and behind BOTH of them — the
                fallback disc is just as invisible on Galaxy Dark as the real
                sphere was. `relative` above is only here to give it something
                to be absolute against. */}
            <GlobeHalo />
            {/* Same box either way — `GLOBE_LEFT`/`GLOBE_WIDTH` are what the
                deck's gutter and the panel's width are derived from, so the
                fallback has to be exactly the size the real globe would have
                been or the measurement everything else hangs off is a lie. */}
            {webgl ? (
              /* Parked off the left edge, it draws nothing. The canvas stays
                 mounted and keeps showing its last composited frame, so there is
                 nothing to rebuild when it comes back. */
              <Globe className="w-full" paused={offScreen} onUnavailable={() => setWebgl(false)} />
            ) : (
              <StaticGlobe />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
