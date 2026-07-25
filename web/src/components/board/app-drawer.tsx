"use client";

/**
 * A running mini app, slid in over the board.
 *
 * The board stays put; the app arrives as a surface on top of it. On a wide
 * screen that surface is a right-hand panel (~60vw); on a phone it is a bottom
 * sheet you can throw back down with your thumb. Either way the runtime inside
 * is the same one the full-page route mounts, so nothing about the app changes
 * — only its container does.
 *
 * The container never unmounts the runtime mid-animation. `name` may go null
 * between selections and `open` may go false before the slide-out finishes, so
 * we hold the last non-null name and keep the panel in the tree until the
 * transform settles. Unmounting early would flash the runtime's own
 * loading / "no mini app" states through the closing gap.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AppRuntime } from "@/components/board/app-runtime";
import { cn } from "@/lib/utils";

const CLOSE_MS = 320;
const DESKTOP_QUERY = "(min-width: 640px)";
const DRAG_DISMISS_PX = 120;
const FLICK_VELOCITY = 0.6; // px per ms — a quick throw dismisses regardless of distance

/**
 * True once mounted on the client. Portals need `document.body`, which does not
 * exist during SSR, so we render nothing until this flips. `useSyncExternalStore`
 * gives a stable server snapshot (false) and a client snapshot (true) without
 * an effect that sets state.
 */
function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * True when the viewport is at least the `sm` breakpoint. SSR-safe: the server
 * snapshot is false (mobile-first), the client tracks `matchMedia`. The closed
 * transform depends on this — a right-panel hides along X, a sheet along Y — so
 * the two layouts carry genuinely different transforms rather than fighting over
 * one set of responsive classes.
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

export function AppDrawer({
  name,
  open,
  onClose,
}: {
  name: string | null;
  open: boolean;
  onClose: () => void;
}): React.JSX.Element | null {
  const isDesktop = useIsDesktop();
  const mounted = useMounted();

  // The last app we were actually asked to show. Held as state and advanced
  // during render (the sanctioned "adjust state while rendering" pattern) so it
  // survives `name` going null and the slide-out — the runtime then stays
  // mounted with real content the whole way, no effect required.
  const [shownName, setShownName] = useState<string | null>(name);
  if (name && name !== shownName) setShownName(name);

  // Keep the panel in the DOM through the close transition. `open` drives the
  // transform; `rendered` drives presence. It turns on in the same render `open`
  // does (adjusting state during render, the sanctioned pattern) and turns off
  // ~CLOSE_MS after `open` goes false, from a timer callback.
  const [rendered, setRendered] = useState(open);
  if (open && !rendered) setRendered(true);
  useEffect(() => {
    if (open) return;
    const t = window.setTimeout(() => setRendered(false), CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Live drag offset for the mobile sheet, in px down from the open position.
  // Null means "not dragging" — the sheet then obeys the CSS transform classes.
  const [dragY, setDragY] = useState<number | null>(null);
  const dragState = useRef<{ id: number; startY: number; lastY: number; lastT: number } | null>(null);

  // Escape closes while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Body scroll-lock while open. Restore whatever was there before.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Focus lifecycle. On open, remember what was focused and move focus into the
  // panel once it has painted; on close, hand focus back. Ref writes and
  // `.focus()` are not state updates, so this stays out of the render loop.
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null;
      const id = window.requestAnimationFrame(() => panelRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
    const prev = restoreFocusRef.current;
    restoreFocusRef.current = null;
    prev?.focus?.();
  }, [open]);

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isDesktop) return; // drag-to-dismiss is a phone gesture only
      e.currentTarget.setPointerCapture(e.pointerId);
      dragState.current = { id: e.pointerId, startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp };
      setDragY(0);
    },
    [isDesktop],
  );

  const onHandlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragState.current;
    if (!s || s.id !== e.pointerId) return;
    s.lastY = e.clientY;
    s.lastT = e.timeStamp;
    setDragY(Math.max(0, e.clientY - s.startY));
  }, []);

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = dragState.current;
      if (!s || s.id !== e.pointerId) return;
      dragState.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // capture may already be gone; nothing to release
      }
      const distance = Math.max(0, e.clientY - s.startY);
      const dt = e.timeStamp - s.lastT;
      const velocity = dt > 0 ? (e.clientY - s.lastY) / dt : 0;
      // Past the threshold, or thrown down fast enough, dismisses. Either way the
      // inline offset clears: on dismiss the panel slides out via its class
      // transform, otherwise it springs back to the open position.
      setDragY(null);
      if (distance > DRAG_DISMISS_PX || velocity > FLICK_VELOCITY) onClose();
    },
    [onClose],
  );

  if (!mounted || (!open && !rendered)) return null;

  // Closed transform differs by layout: a desktop panel parks off the right
  // edge (X); a phone sheet drops below the bottom edge (Y). Open is the same
  // GPU-friendly identity in both. The panel floats inside a margin, so the
  // closed offset is its own size *plus* that margin — otherwise a sliver of
  // the floating edge would peek back onto the screen. While dragging the sheet,
  // an inline transform takes over so the surface tracks the finger in real time.
  const closedTransform = isDesktop
    ? "translate3d(calc(100% + 1rem),0,0)"
    : "translate3d(0,calc(100% + 0.5rem),0)";
  const dragging = dragY !== null;
  const panelStyle: React.CSSProperties = dragging
    ? { transform: `translate3d(0,${dragY}px,0)`, transition: "none" }
    : { transform: open ? "translate3d(0,0,0)" : closedTransform };

  return createPortal(
    <div className="fixed inset-0 z-50" aria-hidden={!open}>
      {/* Scrim: lighter on desktop where the board still shows, darker on mobile. */}
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-300 ease-out",
          "bg-black/45 sm:bg-black/20",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={shownName ?? "Mini app"}
        tabIndex={-1}
        style={panelStyle}
        className={cn(
          "fixed flex flex-col overflow-hidden outline-none",
          "bg-[var(--paper)] shadow-[var(--elev-3)]",
          "transition-transform duration-300 ease-out will-change-transform",
          // Mobile: a floating bottom sheet inset from the edges.
          "inset-x-2 bottom-2 h-[86dvh] rounded-2xl border border-hairline",
          // Desktop: a floating right-hand panel (~58vw, capped), margin on all sides.
          "sm:inset-x-auto sm:right-4 sm:top-4 sm:bottom-4 sm:h-auto sm:w-[58vw] sm:max-w-[860px] sm:rounded-2xl sm:border",
        )}
      >
        <header className="relative shrink-0 border-b border-hairline shadow-[inset_0_-1px_0_var(--bevel-hi)]">
          {/* Drag handle — the grab target for the sheet. Inert on desktop. */}
          <div
            className="flex touch-none justify-center pt-2 pb-1 sm:hidden"
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <span className="h-1.5 w-10 rounded-full bg-[var(--muted-ink)]/40" aria-hidden />
          </div>

          <div className="flex items-center justify-between gap-3 px-3 pb-2 sm:px-4 sm:py-3">
            <p className="mono truncate text-[0.6875rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
              {shownName ?? "Mini app"}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="btn press grid h-8 w-8 shrink-0 place-items-center p-0"
            >
              <ChevronDown className="h-4 w-4 sm:hidden" aria-hidden />
              <ChevronRight className="hidden h-4 w-4 sm:block" aria-hidden />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {shownName ? <AppRuntime name={shownName} /> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
