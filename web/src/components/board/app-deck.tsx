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
import { APP_CARD_HEIGHT, AppCardFace } from "@/components/board/app-card-face";
import OptionWheel, { type WheelItem } from "@/components/board/option-wheel";
import { AppDrawer } from "@/components/board/app-drawer";

// Row pitch: the fixed card height plus a little breathing room, so the wheel
// spaces cards evenly and the curve reads without cards touching.
const ROW_HEIGHT = APP_CARD_HEIGHT + 20;

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
        node: <AppCardFace app={app} active={i === selected} className="h-full w-full" />,
      })),
    [apps, selected],
  );

  return (
    <section>
      <SectionHead
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
          nothing published yet — describe something above
        </p>
      ) : (
        <>
          {/*
            The wheel needs a fixed height to curve within. It shows roughly
            five rows of pitch; the mask fades the top and bottom so cards
            arrive and leave softly rather than clipping at a hard edge.
          */}
          <div
            className="relative mt-3 [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]"
            style={{ height: ROW_HEIGHT * 3.2 }}
          >
            <OptionWheel
              items={items}
              rowHeight={ROW_HEIGHT}
              defaultSelected={0}
              loop
              onChange={(index) => setSelected(index)}
              onItemClick={(_index, key) => setOpenName(key)}
              className="mx-auto max-w-[520px] sm:mx-0"
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
