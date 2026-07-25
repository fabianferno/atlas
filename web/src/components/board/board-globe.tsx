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
 * Desktop only, and genuinely so: the layer is `hidden` below `lg` for layout,
 * but CSS `hidden` still leaves the WebGL canvas mounted and spinning off-screen.
 * A phone should spend nothing on decoration it can't see, so the globe is also
 * gated behind the `lg` media query in JS — below it, nothing mounts at all.
 */
import { useSyncExternalStore } from "react";
import { Globe } from "@/components/ui/globe";
import { cn } from "@/lib/utils";

const DESKTOP_QUERY = "(min-width: 1024px)"; // Tailwind's `lg`

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

export function BoardGlobe({ open }: { open: boolean }): React.JSX.Element {
  const isDesktop = useIsDesktop();

  return (
    // Full-bleed and full-HEIGHT: fixed to the viewport so the globe gets the
    // whole 100vh to live in, not just the short card section — otherwise it's
    // cropped top and bottom by a box smaller than itself. `w-screen` + the
    // centering translate put its left edge on the viewport's left edge despite
    // the Board's padded, max-width container; `-z-10` keeps it behind all the
    // content (which paints over the paper), and it's clipped so the overhang
    // leaves the screen instead of adding a scrollbar.
    <div
      aria-hidden
      className="pointer-events-none fixed left-1/2 top-0 -z-10 hidden h-screen w-screen -translate-x-1/2 items-center overflow-hidden lg:flex"
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
        {/* Negative margin pulls the globe past the left edge so it's cut by the
            frame — the world continues off-screen rather than sitting in a box.
            Sized and shifted so its right edge sits up against the wheel. */}
        {isDesktop ? <Globe className="ml-[2vw] w-[min(58vw,820px)]" /> : null}
      </div>
    </div>
  );
}
