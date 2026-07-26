"use client";

/**
 * A Cobe globe, tuned to the active skin.
 *
 * Cobe paints a WebGL sphere of dotted continents. It has no CSS surface — every
 * colour is a constructor argument and cannot change on a live instance — so the
 * only way to re-theme it is to tear the globe down and build a new one. We do
 * exactly that, keyed on the skin: a `MutationObserver` watches
 * `document.documentElement.dataset.skin` (the single source of truth the skin
 * dice writes) and forces a rebuild, reading the fresh `--paper`/`--ink` tokens
 * so the globe harmonises with whichever material the page is wearing.
 *
 * The rebuild is the ONLY thing keyed on skin. Resize is cheap and continuous —
 * a `ResizeObserver` writes the live pixel size into a ref, and the render loop
 * reads it every frame — so dragging the window never re-inits the globe, only
 * changing the skin does.
 *
 * ## When there is no WebGL
 *
 * There was no answer to this until it was audited. Cobe needs a WebGL context;
 * without one `createGlobe` never paints, and since the canvas below starts at
 * `opacity-0` and is only lifted to 1 on the first painted frame, the failure
 * mode was an invisible canvas — on the Board that is the left ~45% of the
 * first screen of the product, blank paper with no explanation, on the screen
 * that gets demoed live. So this component now REPORTS the failure
 * (`onUnavailable`) instead of silently drawing nothing, and the caller decides
 * what to put in the hole. It stays the caller's decision because this
 * component knows nothing about the space it was given.
 */
import createGlobe from "cobe";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/**
 * Frames per second to draw at, and the gap that enforces it.
 *
 * The globe turns about a degree a second. Half the frames carry that just as
 * well as all of them, and each one skipped is a whole sphere not rasterised —
 * the layer is `fixed`, so this runs for as long as the Board is open and is the
 * larger saving by far.
 *
 * The threshold sits a few ms under the 33.3ms budget on purpose: on a 60Hz
 * display the deltas that should draw land exactly ON 33.3, and a strict compare
 * rounds enough of them out to drop the globe to 20fps.
 */
const TARGET_FPS = 30;
const FRAME_MS = 1000 / TARGET_FPS - 4;

/**
 * Radians of spin per millisecond — the old per-frame nudge (0.0032) divided by
 * a 60Hz frame, so the pace is unchanged from when this was frame-counted.
 *
 * Per ms rather than per frame because a frame is not a fixed amount of time: a
 * per-frame step spun this globe at double speed on a 120Hz display and at
 * whatever the throttle left on a busy one. Wall-clock is the thing the eye is
 * actually judging.
 */
const PHI_PER_MS = 0.0032 / (1000 / 60);

/** RGB in 0..1, the space Cobe wants. */
type RGB = [number, number, number];

/** Parse a `#RRGGBB` token into 0..1 RGB. Falls back to mid-grey on anything odd. */
function hexToRgb01(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0.5, 0.5, 0.5];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Linear blend from a toward b by t (0..1). */
function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Perceptual-ish luminance, enough to tell a dark skin from a light one. */
function luminance([r, g, b]: RGB): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The palette Cobe should render in for the current skin, derived from the two
 * ground tokens. On a light skin the globe is a faint darkening of the paper; on
 * a dark skin it's a tone lifted off the ground toward the ink. Either way the
 * glow melts into the background rather than ringing it.
 */
function skinPalette(): {
  dark: number;
  baseColor: RGB;
  markerColor: RGB;
  glowColor: RGB;
  mapBrightness: number;
} {
  const styles = getComputedStyle(document.documentElement);
  const paper = hexToRgb01(styles.getPropertyValue("--paper"));
  const ink = hexToRgb01(styles.getPropertyValue("--ink"));
  const isDark = luminance(paper) < 0.5;
  return {
    dark: isDark ? 1 : 0,
    // Base sits almost on the paper so the sphere barely fills — what you see is
    // the dotted map and a faint rim, not a shaded 3D ball. A hair off paper on
    // light skins, a little more lifted on dark ones so the globe still reads.
    baseColor: isDark ? mix(paper, ink, 0.18) : mix(paper, ink, 0.02),
    markerColor: ink,
    glowColor: paper,
    // On a near-paper base the dots have to be pushed dark to carry the map.
    mapBrightness: isDark ? 5 : 3,
  };
}

/**
 * Subscribe to skin changes. The DOM attribute is the store (same pattern as the
 * skin dice), so a `MutationObserver` on it is the honest way to know the palette
 * moved, regardless of who moved it — the boot script, the dice, anything.
 */
function subscribeSkin(onChange: () => void): () => void {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-skin"] });
  return () => obs.disconnect();
}

function getSkin(): string {
  return document.documentElement.dataset.skin ?? "tactile";
}

/**
 * Cached answer to "can this browser give Cobe a context at all".
 *
 * Cached because the probe creates a context, and browsers cap how many live
 * ones a document may hold — asking repeatedly is the kind of thing that
 * *causes* the failure it is testing for. The answer cannot change within a
 * page load anyway.
 */
let webglProbe: boolean | null = null;

/**
 * True when a WebGL context is obtainable. Probed exactly the way Cobe asks for
 * one — `webgl2` first, then `webgl` — because a probe that tests something
 * else is a probe that can disagree with the thing it is standing in for.
 * Trying both on one throwaway canvas is safe: a `getContext` that returns null
 * creates nothing, so the second call is not competing with the first.
 *
 * Returns false rather than throwing on the machines this exists for: software
 * rendering disabled, a blocklisted GPU, a lost context, `webgl.disabled` in
 * Firefox, headless Chrome without `--enable-gpu`, and remote desktops.
 * `getContext` can also throw outright, so the whole thing is wrapped.
 *
 * Module-private on purpose. Callers get the answer through `onUnavailable`
 * rather than by probing themselves, so there is one verdict per page and no
 * way for a caller's probe to disagree with the one that actually gated the
 * build. (It also keeps this file exporting nothing but a component, which is
 * what Fast Refresh wants.)
 */
function isWebglAvailable(): boolean {
  if (webglProbe !== null) return webglProbe;
  try {
    const probe = document.createElement("canvas");
    webglProbe = Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    webglProbe = false;
  }
  return webglProbe;
}

export function Globe({
  className,
  paused = false,
  onUnavailable,
}: {
  className?: string;
  /**
   * Stop drawing. For when the globe is off screen — CSS that moves it away or
   * fades it out costs the compositor nothing to skip, but the render loop below
   * is JS driving WebGL and knows nothing about either, so it keeps rasterising
   * a sphere nobody can see, at up to 1230² px a frame. Paused is the caller
   * saying so.
   *
   * The loop keeps its `requestAnimationFrame` slot rather than being torn down
   * and rebuilt: an empty callback is free, whereas a rebuild means a fresh
   * `createGlobe` — the dot map regenerated — which is exactly the hitch you'd
   * see on reopening. Phi holds where it stopped, so the spin resumes rather
   * than jumping.
   */
  paused?: boolean;
  /**
   * Called once when this globe cannot be drawn — no WebGL context, or
   * `createGlobe` threw on the way up. Both happen, and they are not the same
   * event: the first is a browser that never had a context to give, the second
   * is a context that came back and then failed on shader compile or a lost
   * device, which no up-front probe can predict. The caller is expected to stop
   * rendering this component and put something else in the space; until it
   * does, the canvas is a correctly-sized invisible box, which is the bug this
   * callback exists to end.
   */
  onUnavailable?: () => void;
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Held in a ref for the same reason `paused` is: the effect below builds the
  // globe, and re-running it because a parent passed a fresh arrow literal
  // would rebuild a WebGL context on every parent render.
  const onUnavailableRef = useRef(onUnavailable);
  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);
  // Mirrored into a ref so pausing doesn't re-run the effect below — that effect
  // builds the globe, and rebuilding it is the cost we're avoiding.
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  // Reading the skin through the store gives us a value that CHANGES when the
  // dice rolls, so the effect below re-runs and rebuilds the globe in the new
  // palette. Server snapshot is the default skin — the canvas is client-only, so
  // there's no mismatch to worry about.
  const skin = useSyncExternalStore(subscribeSkin, getSkin, () => "tactile");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Ask before building. Cheaper than catching the failure, and it keeps the
    // common no-WebGL case from ever creating a context we'd have to tear down.
    if (!isWebglAvailable()) {
      onUnavailableRef.current?.();
      return;
    }

    // Capped at 1.5 rather than 2: the framebuffer is this squared, so the step
    // from 2 costs 44% of every frame's fill. What it buys is sharper edges on
    // dots drawn at `diffuse: 0.15` a hair off the paper colour — detail this
    // globe is deliberately too faint to show.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const palette = skinPalette();

    // Cobe v2 fixes width/height at construction — `update()` only carries phi,
    // theta, and markers, so a live resize is impossible; the resolution has to be
    // baked in when the globe is built. So we (re)build to the current square side
    // and, on a real width change, tear the globe down and build a fresh one. The
    // phi carries across the rebuild so the spin doesn't jump back to the prime
    // meridian when the window is dragged.
    let phi = 0;
    let painted = false;
    let raf = 0;
    // Timestamp of the last DRAWN frame, 0 before there is one. The gap since
    // decides both whether to draw and how far to turn.
    let lastDrawn = 0;
    let side = 0;
    let globe: ReturnType<typeof createGlobe> | null = null;

    // Wrapped, because a passing probe is not a promise: `createGlobe` compiles
    // shaders and allocates a framebuffer, and it THROWS rather than returning
    // null when either fails — on a lost context, a driver that refuses the
    // program, or a size the GPU won't allocate. Unhandled, that threw straight
    // out of the effect and took the Board's render down with it; caught and
    // left alone, it would have been the same invisible canvas as no-WebGL at
    // all. So it reports, exactly like the probe does, and the caller replaces
    // us. `globe` stays null, which every call site below already guards on.
    function build(nextSide: number): void {
      side = nextSide;
      globe?.destroy();
      try {
        globe = buildGlobe();
      } catch {
        globe = null;
        onUnavailableRef.current?.();
      }
    }

    function buildGlobe(): ReturnType<typeof createGlobe> {
      return createGlobe(canvas!, {
        devicePixelRatio: dpr,
        width: side * dpr,
        height: side * dpr,
        phi,
        theta: 0.25,
        dark: palette.dark,
        // Near-zero, so the sphere isn't lit from one side into a shaded ball — it
        // reads flat, the way a faint dotted map on paper should.
        diffuse: 0.15,
        // The continents are drawn from this many sampled dots. 40000 was resolving
        // coastline the palette then washes out — see `skinPalette`, where the base
        // sits 2% off the paper — so it was detail paid for and not delivered.
        mapSamples: 16000,
        mapBrightness: palette.mapBrightness,
        baseColor: palette.baseColor,
        markerColor: palette.markerColor,
        glowColor: palette.glowColor,
        markers: [],
      });
    }

    build(Math.round(canvas.getBoundingClientRect().width) || 1);
    // Nothing to observe or animate if the first build failed — `build` has
    // already reported it, and starting a `requestAnimationFrame` loop that
    // draws nothing forever is how this used to look like it was working.
    if (!globe) return;

    // Rebuild only when the rounded CSS width actually moves — resize fires a lot,
    // and each rebuild is a full WebGL re-init we don't want per pixel.
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w && w !== side) build(w);
    });
    ro.observe(canvas);

    // Cobe v2 has no internal loop — each `update()` draws one frame, so the caller
    // owns the clock, at `TARGET_FPS` rather than the display's rate. We advance
    // phi by the time actually elapsed and trip the fade-in on the first painted
    // frame (a WebGL canvas is black until then).
    raf = requestAnimationFrame(function frame(now) {
      // Next frame first, so a paused loop can bail out below and still be here
      // when it resumes.
      raf = requestAnimationFrame(frame);
      if (pausedRef.current) return;

      const elapsed = now - lastDrawn;
      if (elapsed < FRAME_MS) return;
      lastDrawn = now;

      // Clamped, because `elapsed` is meaningless twice: on the very first frame
      // it's the whole time since the page loaded, and on the first frame after a
      // pause it's however long the panel was open. Unclamped, either would
      // whip the globe round to a new longitude in one step.
      phi += PHI_PER_MS * Math.min(elapsed, FRAME_MS * 2);
      globe?.update({ phi });
      if (!painted) {
        painted = true;
        canvas.style.opacity = "1";
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      globe?.destroy();
    };
  }, [skin]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("aspect-square w-full opacity-0 transition-opacity duration-700", className)}
      aria-hidden
    />
  );
}
