"use client";

/**
 * The mini-app deck — the Board's browsing surface.
 *
 * Every mini app on the board rides a vertical **card-wheel** (curve, tilt, blur, scroll,
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
import { allApps, isMine, isUnclaimed, tierCounts, useBoard, useBoardSweep } from "@/lib/store";
import { SectionHead } from "@/components/board/chrome";
import { SponsorMark } from "@/components/brand/sponsor-mark";
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
  // Puts a measurement behind the two figures every wheel card prints. Without
  // it the cards below show `seed-live.generated.json`'s build-time numbers, or
  // — once `useFigure` stopped letting them — nothing at all.
  useBoardSweep();
  /*
   * EVERY app, not `myApps()` — and the heading changed with it.
   *
   * This wheel used to render `myApps()` under the title "Your mini apps", where
   * "yours" meant `MiniApp.mine`, a boolean literal in `seed.ts` set on thirteen
   * of the sixteen bundled apps. The first screen of the product therefore said
   * *your* to a browser that had never connected a wallet, and went on saying it
   * after a logout. See the ownership note in `store.ts` for the fix; the part
   * that lands here is that the Board is a browsing surface, so it shows the
   * whole set and lets a card say whose it is.
   *
   * That also retires the denominator this heading used to carry (`13 of 16
   * here`), which existed only to disclose that the wheel was a subset. It is
   * not a subset any more, so the note states the count plainly and adds `N
   * yours` only when the signed-in reader actually holds some.
   */
  const apps = useMemo(() => allApps(board), [board]);
  const counts = tierCounts(board);
  /*
   * `board.apps.length` rather than `SEED_DECLARED_COUNT` from `seed.ts` on
   * purpose. The right count is what this browser can actually show you — seed
   * apps that survived the live overlay, plus anything published or forked here.
   * `SEED_DECLARED_COUNT` counts apps the snapshot may have DROPPED for want of
   * live data, which are on no surface at all; a number that includes them would
   * send a reader looking for cards that do not exist. Coverage of the seed set
   * is `LIVE_SEED_COUNT`/`SEED_DROPPED`'s job and belongs next to the registry's
   * own audit, not in a board heading.
   */
  const total = board.apps.length;
  /*
   * TWO counts, because the cards below draw two marks and one number cannot
   * stand for both. A single `N yours` read "1 yours" over a card labelled "made
   * here" — the heading claiming a signature the card was careful not to claim.
   * Same defect in miniature as the thing this whole change is about, so it gets
   * the same treatment: count what each word means, print only what is non-zero.
   */
  const owned = useMemo(
    () => board.apps.map((a) => (isMine(board, a) ? (isUnclaimed(board, a) ? "made" : "yours") : null)),
    [board],
  );
  const yoursCount = owned.filter((o) => o === "yours").length;
  const madeHereCount = owned.filter((o) => o === "made").length;

  // The centered card (wheel highlight) and the opened card (drawer). Kept
  // separate on purpose: scrolling moves the highlight, only a click opens.
  const [selected, setSelected] = useState(0);
  const [openName, setOpenName] = useState<string | null>(null);
  // Whether the wheel is currently taking scroll. The hint below says different
  // things for the two states, because "scroll to browse" is a lie in one of them.
  const [wheelEngaged, setWheelEngaged] = useState(false);

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
            // The wheel is everyone's apps now, so a card has to be able to say
            // it is yours. Computed here rather than in the card because the
            // answer depends on board state (the connected wallet), and the card
            // is otherwise a pure function of one app.
            owned={isMine(board, app) ? (isUnclaimed(board, app) ? "made-here" : "yours") : null}
            className="w-full"
          />
        ),
      })),
    [apps, selected, openName, board],
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
            /* The mark sits inside the sentence, on the words it belongs to.
               Every app on this deck was composed from a query The Graph
               answered, so the page heading is the one place the credit is a
               statement about the whole surface rather than about one row. */
            title={
              <>
                Explore mini apps on{" "}
                <SponsorMark of="graph" size={17} className="mx-0.5 -translate-y-[2px]" /> The Graph
              </>
            }
            note={[
              `${total} here`,
              // Only when there are some. "0 yours" is true but it reads as a
              // prompt to fix something, and there is nothing to fix — a reader
              // who has not forked anything owns nothing, which is the normal
              // state of this screen and not a deficiency.
              yoursCount > 0 ? `${yoursCount} yours` : null,
              madeHereCount > 0 ? `${madeHereCount} made here` : null,
              `${counts.autonomous} autonomous · ${counts.monitor} monitor · ${counts.readonly} read only`,
            ]
              .filter(Boolean)
              .join(" · ")}
            right={
              <Link
                href="/registry"
                className="mono text-[0.6875rem] uppercase tracking-[0.08em] underline underline-offset-2"
              >
                Registry
              </Link>
            }
          />

          {/* Reached only if the board holds nothing at all — every bundled app
              dropped from the live snapshot, or storage cleared mid-session. It
              used to read "nothing published yet", which was the empty state for
              a wheel scoped to you; this one is scoped to everything, so an empty
              wheel is a missing board, not an empty portfolio. */}
          {apps.length === 0 ? (
            <p className="mono py-8 text-center text-xs text-[var(--muted-ink)]">
              no mini apps on this board —{" "}
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
                  // One detent click per row the wheel crosses. The component
                  // throttles it to 70ms apart, so a fast flick reads as a run
                  // of ticks slowing to a stop rather than a burst of noise.
                  soundUrl="/wheel-tick.wav"
                  soundVolume={0.7}
                  onChange={(index) => setSelected(index)}
                  onEngagedChange={setWheelEngaged}
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
                {openName !== null
                  ? "still scrollable — click another card to switch"
                  : wheelEngaged
                    ? "wheel has the scroll — Esc, or click away, to scroll the page"
                    : "click the wheel to turn it · click a card to open"}
              </p>
            </>
          )}
        </div>
      </div>

      <AppDrawer name={openName} open={openName !== null} onClose={() => setOpenName(null)} />
    </section>
  );
}
