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
 */
import createGlobe from "cobe";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

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

export function Globe({ className }: { className?: string }): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Reading the skin through the store gives us a value that CHANGES when the
  // dice rolls, so the effect below re-runs and rebuilds the globe in the new
  // palette. Server snapshot is the default skin — the canvas is client-only, so
  // there's no mismatch to worry about.
  const skin = useSyncExternalStore(subscribeSkin, getSkin, () => "tactile");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    let side = 0;
    let globe: ReturnType<typeof createGlobe> | null = null;

    function build(nextSide: number): void {
      side = nextSide;
      globe?.destroy();
      globe = createGlobe(canvas!, {
        devicePixelRatio: dpr,
        width: side * dpr,
        height: side * dpr,
        phi,
        theta: 0.25,
        dark: palette.dark,
        // Near-zero, so the sphere isn't lit from one side into a shaded ball — it
        // reads flat, the way a faint dotted map on paper should.
        diffuse: 0.15,
        mapSamples: 40000,
        mapBrightness: palette.mapBrightness,
        baseColor: palette.baseColor,
        markerColor: palette.markerColor,
        glowColor: palette.glowColor,
        markers: [],
      });
    }

    build(Math.round(canvas.getBoundingClientRect().width) || 1);

    // Rebuild only when the rounded CSS width actually moves — resize fires a lot,
    // and each rebuild is a full WebGL re-init we don't want per pixel.
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w && w !== side) build(w);
    });
    ro.observe(canvas);

    // Cobe v2 has no internal loop — each `update()` draws one frame, so the caller
    // owns the clock. We nudge phi for the slow spin and trip the fade-in on the
    // first painted frame (a WebGL canvas is black until then).
    raf = requestAnimationFrame(function frame() {
      globe?.update({ phi });
      phi += 0.0032;
      if (!painted) {
        painted = true;
        canvas.style.opacity = "1";
      }
      raf = requestAnimationFrame(frame);
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
