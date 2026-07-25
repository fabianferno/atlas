"use client";

/**
 * The mini-app deck — the Board's browsing surface.
 *
 * Your mini apps ride a vertical **card-wheel** (curve, tilt, blur, scroll,
 * drag) instead of a static grid. Scrolling only highlights the centered card;
 * clicking one slides its full runtime in as a drawer — from the right on
 * desktop, from the bottom on mobile. Deep links to `/a/[name]` still render the
 * same runtime full-width, so nothing here is load-bearing for sharing.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { myApps, tierCounts, useBoard } from "@/lib/store";
import { SectionHead } from "@/components/board/chrome";
import {
  WHEEL_CARD_EXPAND,
  WHEEL_CARD_HEIGHT,
  AppWheelCard,
} from "@/components/board/app-wheel-card";
import OptionWheel, { type WheelItem } from "@/components/board/option-wheel";
import { AppDrawer } from "@/components/board/app-drawer";

// Gap between cards. It survives the expansion: the wheel pushes neighbours out
// by exactly what the centered card grows, so this is the spacing everywhere,
// not just at rest.
//
// It has to clear the *rotated* corners, not the flat card. A 520px-wide card
// tilted by θ reaches (520/2)·sinθ past its own band at the deep corner, and θ
// grows a step per row — so the far rows eat the gap first. That overhang is why
// this is 40 and TILT below is shallow: together they keep the corners apart out
// to the edge of the mask instead of only around the centered card.
const ROW_GAP = 40;
/** Degrees between neighbouring rows. Shallow on purpose — see ROW_GAP. */
const TILT = 1.8;
/** How hard the curve pushes rows sideways as they leave the center. */
const CURVE = 2.2;
/** Rows of pitch the wheel is tall, on top of the centered card's extra height. */
const VISIBLE_ROWS = 3.8;
/** px — how wide a card lays out at most, before the wheel's travel reserve. */
const CARD_WIDTH = 520;
// Row pitch: a resting card plus that gap. The centered card grows past this and
// the wheel opens the room for it.
const ROW_HEIGHT = WHEEL_CARD_HEIGHT + ROW_GAP;

// px the furthest still-visible row reaches to the left, measured at the edge of
// the mask (about half the visible rows out, plus a card). Two terms, because a
// row both slides and turns: the wheel's own sideways travel (radius = pitch /
// tilt, x = radius · (1 - cos θ) · curve), plus the corner a rotated card swings
// out past its own edge (height/2 · sin θ). Derived rather than eyeballed so it
// stays honest if the tilt or curve move; the last few px are for the shadow,
// which paints outside the border box the two terms describe.
const TILT_RAD = (TILT * Math.PI) / 180;
const EDGE_ROW = VISIBLE_ROWS / 2 + 0.6;
const CURVE_TRAVEL = Math.ceil(
  (ROW_HEIGHT / TILT_RAD) * (1 - Math.cos(EDGE_ROW * TILT_RAD)) * CURVE +
    (WHEEL_CARD_HEIGHT / 2) * Math.sin(EDGE_ROW * TILT_RAD) +
    5,
);

export function AppDeck() {
  const board = useBoard();
  const apps = useMemo(() => myApps(board), [board]);
  const counts = tierCounts(board);

  // The centered card (wheel highlight) and the opened card (drawer). Kept
  // separate on purpose: scrolling moves the highlight, only a click opens.
  const [selected, setSelected] = useState(0);
  const [openName, setOpenName] = useState<string | null>(null);

  const items: WheelItem[] = useMemo(
    () =>
      apps.map((app, i) => ({
        key: app.manifest.name,
        node: <AppWheelCard app={app} active={i === selected} className="w-full" />,
      })),
    [apps, selected],
  );

  return (
    <section>
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
            className="relative mx-auto mt-3 sm:mx-0 [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_86%,transparent)]"
            style={{
              height: WHEEL_CARD_EXPAND + ROW_HEIGHT * VISIBLE_ROWS,
              // The box is the card width plus the reserve on both sides, so the
              // inset buys travel room instead of eating into the cards — they
              // still lay out 520 wide, the wheel is just wider than they are.
              maxWidth: CARD_WIDTH + CURVE_TRAVEL * 2,
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
          <p className="mono mt-2 text-center text-[0.625rem] text-[var(--muted-ink)]">
            scroll or drag to browse · click a card to open
          </p>
        </>
      )}

      <AppDrawer name={openName} open={openName !== null} onClose={() => setOpenName(null)} />
    </section>
  );
}
