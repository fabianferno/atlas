"use client";

/**
 * A running mini app, slid into the board's left half.
 *
 * The app takes the globe's side. That is the whole idea: at rest the left is a
 * globe and the wheel sits beside it; open a card and the globe leaves to the
 * left while the app arrives from the same edge, filling exactly the space the
 * globe gave up. The wheel never moves and is never covered — it stays live on
 * the right with the open card ringed, so the deck reads as a table of contents
 * for the panel and you can flick to the next app without closing this one.
 *
 * That is why this is NOT a modal on a wide screen. No scrim, no scroll lock,
 * no `aria-modal`: those all exist to make the rest of the page inert, and the
 * rest of the page is the point. On a phone there is no room for a split, so it
 * degrades to what it always was — a bottom sheet you can throw back down with
 * your thumb, scrim and all, genuinely modal.
 *
 * The runtime inside is the same one the full-page route mounts, so nothing
 * about the app changes — only its container does.
 *
 * The container never unmounts the runtime mid-animation. `name` may go null
 * between selections and `open` may go false before the slide-out finishes, so
 * we hold the last non-null name and keep the panel in the tree until the
 * transform settles. Unmounting early would flash the runtime's own
 * loading / "no mini app" states through the closing gap.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { AppRuntime } from "@/components/board/app-runtime";
import { McpButton } from "@/components/board/mcp-button";
import { ShareButton } from "@/components/board/share-button";
import { PANEL_WIDTH } from "@/components/board/board-layout";
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
 * snapshot is false (mobile-first), the client tracks `matchMedia`. Three things
 * hang off it, and all three are the same question — is this a side panel or a
 * sheet? The closed transform (out the left edge along X, or down along Y), the
 * modal behaviours (scrim, scroll lock, focus capture, `aria-modal`), and which
 * way the close chevron points.
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

  // Body scroll-lock, for the sheet only. The side panel leaves the board
  // scrollable on purpose — the wheel beside it has to stay usable.
  useEffect(() => {
    if (!open || isDesktop) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isDesktop]);

  // Focus lifecycle, also sheet-only. Pulling focus out of the wheel would take
  // its arrow keys with it, and beside a non-modal panel the wheel is still
  // something you are steering. On the sheet the board is inert, so focus moves
  // in on open and is handed back on close. Ref writes and `.focus()` are not
  // state updates, so this stays out of the render loop.
  useEffect(() => {
    if (isDesktop) return;
    if (open) {
      restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null;
      const id = window.requestAnimationFrame(() => panelRef.current?.focus());
      return () => window.cancelAnimationFrame(id);
    }
    const prev = restoreFocusRef.current;
    restoreFocusRef.current = null;
    prev?.focus?.();
  }, [open, isDesktop]);

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

  // Closed transform differs by layout: a desktop panel parks off the LEFT edge
  // (X), the same edge the globe leaves by; a phone sheet drops below the bottom
  // edge (Y). Open is the same GPU-friendly identity in both. The panel floats
  // inside a margin, so the closed offset is its own size *plus* that margin —
  // otherwise a sliver of the floating edge would peek back onto the screen.
  // While dragging the sheet, an inline transform takes over so the surface
  // tracks the finger in real time.
  const closedTransform = isDesktop
    ? "translate3d(calc(-100% - 1rem),0,0)"
    : "translate3d(0,calc(100% + 0.5rem),0)";
  const dragging = dragY !== null;
  const panelStyle: React.CSSProperties = dragging
    ? { transform: `translate3d(0,${dragY}px,0)`, transition: "none" }
    : { transform: open ? "translate3d(0,0,0)" : closedTransform };

  return createPortal(
    // The layer itself must not eat clicks — beside a non-modal panel every
    // pixel it does not cover belongs to the board. Only the panel (and the
    // sheet's scrim) opt back in.
    <div className="pointer-events-none fixed inset-0 z-50" aria-hidden={!open}>
      {/* Scrim, sheet only. A side panel that dimmed the wheel would be telling
          you not to touch the thing it was put there to sit beside. */}
      <div
        className={cn(
          "pointer-events-auto absolute inset-0 bg-black/45 transition-opacity duration-300 ease-out sm:hidden",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />

      <div
        ref={panelRef}
        role="dialog"
        // Modal on the sheet, where the board really is inert; not on the side
        // panel, where claiming it would hide a live wheel from a screen reader.
        aria-modal={isDesktop ? undefined : true}
        aria-label={shownName ?? "Mini app"}
        tabIndex={-1}
        style={{ ...panelStyle, ["--panel-w" as string]: PANEL_WIDTH }}
        className={cn(
          "pointer-events-auto fixed flex flex-col overflow-hidden outline-none",
          "bg-[var(--paper)] shadow-[var(--elev-3)]",
          "transition-transform duration-300 ease-out will-change-transform",
          // Mobile: a floating bottom sheet inset from the edges.
          "inset-x-2 bottom-2 h-[86dvh] rounded-2xl border border-hairline",
          // Tablet: a left-hand panel wide enough to be worth reading. The wheel
          // is behind it at this size — there is no room to show both.
          //
          // It starts below the sticky top bar (45px) rather than at the top of
          // the viewport. A modal could sit over the nav because nothing behind
          // it was reachable anyway; this one is a pane of the board, and the
          // board's nav and its halt-everything button have to stay clickable
          // the whole time an app is running.
          "sm:inset-x-auto sm:left-4 sm:top-[3.8125rem] sm:bottom-4 sm:h-auto sm:w-[58vw] sm:rounded-2xl sm:border",
          // Desktop: narrowed to stop short of the wheel. The width comes from
          // `PANEL_WIDTH`, measured off the same globe edge the deck's gutter
          // is — so the panel stays clear of the wheel at every width from 1024
          // up instead of only at the ones a vw guess happened to suit.
          "lg:w-[var(--panel-w)]",
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
            <div className="flex shrink-0 items-center gap-2">
              {/* Two ways to take this app with you: the URL a person opens,
                  and the endpoint an agent connects to. Both sit beside close
                  because they are window chrome, not app content. */}
              <McpButton name={shownName} />
              <ShareButton name={shownName} />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="btn press grid h-8 w-8 shrink-0 place-items-center p-0"
              >
                {/* Points the way out: down for the sheet, back to the left edge
                    for the panel. */}
                <ChevronDown className="h-4 w-4 sm:hidden" aria-hidden />
                <ChevronLeft className="hidden h-4 w-4 sm:block" aria-hidden />
              </button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {shownName ? <AppRuntime name={shownName} variant="drawer" /> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
