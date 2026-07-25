"use client";

/**
 * The mini-app deck — the Board's browsing surface.
 *
 * Your mini apps ride a vertical **card-wheel** (curve, tilt, blur, scroll,
 * drag) instead of a static grid. Scrolling only highlights the centered card;
 * clicking one slides its full runtime in as a drawer — from the left on
 * desktop, into the space the globe vacates, and from the bottom on mobile.
 *
 * On a wide screen the wheel keeps turning while the panel is open, and the
 * open card wears a ring so the deck reads as the panel's table of contents:
 * click another row and the panel swaps to it, no closing required. Deep links
 * to `/a/[name]` still render the same runtime full-width, so nothing here is
 * load-bearing for sharing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { myApps, tierCounts, useBoard } from "@/lib/store";
import { SectionHead } from "@/components/board/chrome";
import { WHEEL_CARD_EXPAND, AppWheelCard } from "@/components/board/app-wheel-card";
import OptionWheel, { type WheelItem } from "@/components/board/option-wheel";
import { AppDrawer } from "@/components/board/app-drawer";
import { BoardGlobe } from "@/components/board/board-globe";
import {
  CURVE,
  CURVE_TRAVEL,
  DECK_GUTTER,
  GRID_GAP,
  ROW_HEIGHT,
  TILT,
  VISIBLE_ROWS,
  WHEEL_BOX_WIDTH,
} from "@/components/board/board-layout";

export function AppDeck() {
  const board = useBoard();
  const apps = useMemo(() => myApps(board), [board]);
  const counts = tierCounts(board);

  // The centered card (wheel highlight) and the opened card (drawer). Kept
  // separate on purpose: scrolling moves the highlight, only a click opens.
  const [selected, setSelected] = useState(0);
  const [openName, setOpenName] = useState<string | null>(null);

  // Where the wheel's center row sits, so the globe can put its equator on the
  // same line. Measured rather than assumed: the wheel's distance from the top
  // of the page is the sum of the top bar, the section heading and the mask —
  // whereas the globe is centered on the VIEWPORT, so the two only agreed at one
  // window height and drifted apart from there. Page coordinates (rect + scroll)
  // rather than viewport ones, because the globe is fixed and this is measured
  // whenever the layout changes, not on every scroll.
  const wheelRef = useRef<HTMLDivElement>(null);
  const [wheelCenterY, setWheelCenterY] = useState<number | null>(null);
  const measureWheel = useCallback(() => {
    const el = wheelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setWheelCenterY(r.top + window.scrollY + r.height / 2);
  }, []);
  useEffect(() => {
    measureWheel();
    const el = wheelRef.current;
    if (!el) return;
    // The box changes height with nothing but its own constants, but it MOVES
    // with anything above it — a wrapped heading at a narrow width, say — so the
    // observer watches the box and the window both.
    const ro = new ResizeObserver(measureWheel);
    ro.observe(el);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [measureWheel, apps.length]);

  const items: WheelItem[] = useMemo(
    () =>
      apps.map((app, i) => ({
        key: app.manifest.name,
        node: (
          <AppWheelCard
            app={app}
            active={i === selected}
            open={app.manifest.name === openName}
            className="w-full"
          />
        ),
      })),
    [apps, selected, openName],
  );

  return (
    <section className="relative">
      {/*
        The Board is a split: a full-bleed globe holds the left (painted behind,
        anchored to the viewport edge), the mini-app wheel beside it. The grid's
        left cell is a spacer the globe shows through, and it is *measured off
        the globe's right edge* rather than guessed at in vw — see `DECK_GUTTER`
        in `board-layout.ts` for why a fixed gutter drifts. Leftover space sits
        on the right so the wheel stays next to the globe instead of flush
        against the far edge. On a narrow screen the spacer collapses and the
        globe never mounts — the wheel takes the full width.

        Nothing here moves when a card opens. The panel takes the left cell —
        the globe's cell — and `AppDrawer` sizes itself to stop short of this
        wheel rather than asking the wheel to step aside, off the same globe
        edge (`PANEL_WIDTH`). Change the gutter and the panel follows.
      */}
      <BoardGlobe open={openName !== null} centerY={wheelCenterY} />

      <div
        className="relative z-10 grid grid-cols-1 items-center lg:grid-cols-[minmax(0,var(--deck-gutter))_minmax(0,var(--deck-wheel))_1fr]"
        style={{
          gap: GRID_GAP,
          ["--deck-gutter" as string]: DECK_GUTTER,
          ["--deck-wheel" as string]: `${WHEEL_BOX_WIDTH}px`,
        }}
      >
        <div aria-hidden className="hidden lg:block" />

        <div className="min-w-0">
          {/* Leads the Board, so it carries the page heading. */}
          <SectionHead
            as="h1"
            title="Your mini apps"
            note={`${counts.autonomous} autonomous · ${counts.monitor} monitor · ${counts.readonly} read only`}
            right={
              <Link
                href="/registry"
                className="mono text-[0.6875rem] uppercase tracking-[0.08em] underline underline-offset-2"
              >
                Registry
              </Link>
            }
          />

          {apps.length === 0 ? (
            <p className="mono py-8 text-center text-xs text-[var(--muted-ink)]">
              nothing published yet —{" "}
              <Link href="/registry" className="underline underline-offset-2">
                describe one in the Studio
              </Link>
            </p>
          ) : (
            <>
              {/*
                The wheel needs a fixed height to curve within: the grown centered
                card plus about two resting rows either side of it. The mask fades
                the top and bottom so cards arrive and leave softly rather than
                clipping at a hard edge.
              */}
              <div
                ref={wheelRef}
                className="relative mx-auto mt-3 lg:mx-0 [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_86%,transparent)]"
                style={{
                  height: WHEEL_CARD_EXPAND + ROW_HEIGHT * VISIBLE_ROWS,
                  maxWidth: WHEEL_BOX_WIDTH,
                }}
              >
                <OptionWheel
                  items={items}
                  rowHeight={ROW_HEIGHT}
                  activeExtra={WHEEL_CARD_EXPAND}
                  defaultSelected={0}
                  // A shallow tilt flattens the curve's radius, so `curve` is turned
                  // up to buy the sideways travel back. Net effect: rows still swing
                  // away from you, they just don't stand on their corners doing it.
                  tilt={TILT}
                  curve={CURVE}
                  // The curve pushes rows left, and the wheel clips to its own box —
                  // which is a panel edge here, not the viewport, so a card sliding
                  // out would be sliced mid-card rather than leaving the screen.
                  // Inset reserves the travel inside the box: rows start this far in
                  // and drift into their own margin, never into the clip.
                  inset={CURVE_TRAVEL}
                  // Softer than the defaults: a resting card is one line of title, so
                  // it has to stay readable at a distance for the wheel to be worth
                  // scrolling. The falloff separates depth, it doesn't hide anything.
                  blur={0.5}
                  fade={0.2}
                  minOpacity={0.3}
                  loop
                  onChange={(index) => setSelected(index)}
                  onItemClick={(_index, key) => setOpenName(key)}
                  className="h-full w-full"
                />
              </div>
              {/* "still live" used to sit in the second branch. It was about the
                  wheel staying interactive while the panel is open, but §6's
                  Rule 2 makes "live" mean one thing — a subscription is open
                  right now — and no card on this board is subscribed to
                  anything. The word the sentence actually needed was "open". */}
              <p className="mono mt-2 text-center text-[0.625rem] text-[var(--muted-ink)]">
                {openName === null
                  ? "scroll or drag to browse · click a card to open"
                  : "still scrollable — click another card to switch"}
              </p>
            </>
          )}
        </div>
      </div>

      <AppDrawer name={openName} open={openName !== null} onClose={() => setOpenName(null)} />
    </section>
  );
}
