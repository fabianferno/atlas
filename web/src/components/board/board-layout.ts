/**
 * Where the Board's three pieces sit: the globe, the mini-app wheel, and the
 * panel that takes the globe's place when a card opens.
 *
 * They have to agree on one measurement — the globe's right edge — and they
 * cannot agree by eye. The globe is anchored to the VIEWPORT's left edge while
 * the wheel lives inside a centered, max-width container, so a fixed gutter
 * drifts: it used to leave the cards overlapping the globe at 1280 and 400px
 * clear of it at 2560. Everything here is derived from that edge instead, so
 * the wheel sits one grid gap off the globe at every width from `lg` up.
 *
 * The CSS strings are expressions, not numbers, because the answer depends on
 * the viewport at paint time. They assume the Board's container — `mx-auto
 * max-w-[1400px] px-5` on `page.tsx` — and have to move with it.
 */
import { WHEEL_CARD_HEIGHT } from "@/components/board/app-wheel-card";

/** px — gap between the deck grid's columns, and between its rows when stacked. */
export const GRID_GAP = 24;

// Gap between cards. It survives the expansion: the wheel pushes neighbours out
// by exactly what the centered card grows, so this is the spacing everywhere,
// not just at rest.
//
// It has to clear the *rotated* corners, not the flat card. A 560px-wide card
// tilted by θ reaches (560/2)·sinθ past its own band at the deep corner, and θ
// grows a step per row — so the far rows eat the gap first. That overhang is why
// this is 40 and TILT below is shallow: together they keep the corners apart out
// to the edge of the mask instead of only around the centered card.
const ROW_GAP = 40;
/** Degrees between neighbouring rows. Shallow on purpose — see ROW_GAP. */
export const TILT = 2.4;
/**
 * How hard the curve pushes rows sideways as they leave the center.
 *
 * The wheel's true radius (`rowHeight / tilt`) is enormous at a tilt this
 * shallow, so its honest sideways travel is a few px per row — a wheel you have
 * to be told about. This multiplies that travel to make the arc visible without
 * touching the tilt, which is what keeps a resting card's one line of text flat
 * enough to read. Raise it and the reserve below grows to match, so rows keep
 * swinging into their own margin rather than into the clip.
 */
export const CURVE = 6.6;
/** Rows of pitch the wheel is tall, on top of the centered card's extra height. */
export const VISIBLE_ROWS = 5;
/** px — how wide a card lays out at most, before the wheel's travel reserve. */
export const CARD_WIDTH = 560;
/** px — the wheel's row pitch: a resting card plus that gap. The centered card
 *  grows past this and the wheel opens the room for it. */
export const ROW_HEIGHT = WHEEL_CARD_HEIGHT + ROW_GAP;

// px the furthest still-visible row reaches to the left, measured at the edge of
// the mask (about half the visible rows out, plus a card). Two terms, because a
// row both slides and turns: the wheel's own sideways travel (radius = pitch /
// tilt, x = radius · (1 - cos θ) · curve), plus the corner a rotated card swings
// out past its own edge (height/2 · sin θ). Derived rather than eyeballed so it
// stays honest if the tilt or curve move; the last few px are for the shadow,
// which paints outside the border box the two terms describe.
const TILT_RAD = (TILT * Math.PI) / 180;
const EDGE_ROW = VISIBLE_ROWS / 2 + 0.6;
export const CURVE_TRAVEL = Math.ceil(
  (ROW_HEIGHT / TILT_RAD) * (1 - Math.cos(EDGE_ROW * TILT_RAD)) * CURVE +
    (WHEEL_CARD_HEIGHT / 2) * Math.sin(EDGE_ROW * TILT_RAD) +
    5,
);

/**
 * px — how wide the wheel's box lays out at most: a full card plus the reserve
 * on both sides. The cards still lay out `CARD_WIDTH` wide; the box is simply
 * wider than they are, so the arc is bought out of its own margin. The deck's
 * middle column is sized to this, or the column would cap the box and the
 * reserve would come out of the cards instead.
 */
export const WHEEL_BOX_WIDTH = CARD_WIDTH + CURVE_TRAVEL * 2;

/** How far the globe's left edge sits in from the viewport's — it runs off the
 *  screen, so this is a nudge, not a margin. */
export const GLOBE_LEFT = "2vw";
/** The globe's own width. Capped: past ~1400px of sphere it stops reading as a
 *  detail of the page and starts being the page. */
export const GLOBE_WIDTH = "min(58vw, 820px)";
/** The globe's right edge in viewport coordinates, as a raw sum — wrap it in
 *  `calc()` to use it. Everything else on the Board is measured off this. */
const GLOBE_RIGHT = `${GLOBE_LEFT} + ${GLOBE_WIDTH}`;

/** The Board container's left inset: what `mx-auto max-w-[1400px] px-5` leaves
 *  between the viewport edge and the deck grid. Ignores scrollbar width, which
 *  is 0 on overlay-scrollbar platforms and a few px elsewhere — well inside the
 *  gap this is used to size. */
const CONTENT_LEFT = "max(0px, (100vw - 1400px) / 2) + 1.25rem";

/**
 * px the wheel is allowed to ride over the globe's right edge.
 *
 * The two are not neighbours in a row, they're layers: the globe paints behind
 * everything (`-z-10`) and the cards over it, so a hard gap between them reads
 * as two unrelated objects sharing a screen. Overlapping the rim by this much
 * puts the deck *on* the world instead of beside it, which is the whole picture,
 * and the far rows — already curving left, blurred and faded — carry it further
 * without anyone having to aim them.
 */
const DECK_OVERLAP = 84;

/**
 * Width of the deck grid's left cell — the spacer the globe shows through.
 *
 * Sized so the CENTERED card's left edge lands `DECK_OVERLAP` inside the globe's
 * right edge (less one `GRID_GAP`, which the grid puts back): the cell ends
 * `CURVE_TRAVEL` early because the wheel starts its rows that far inside its own
 * box — the reserve they drift into as they leave center.
 *
 * Clamped at 0 rather than allowed to go negative: a negative track invalidates
 * the whole `grid-template-columns` declaration, which would drop the Board to
 * one column. It only bites past ~3000px, where a viewport-anchored globe and a
 * 1400px centered container simply cannot be brought together.
 */
export const DECK_GUTTER = `max(0px, calc(${GLOBE_RIGHT} - ${CURVE_TRAVEL + DECK_OVERLAP}px - (${CONTENT_LEFT})))`;

/** px — the margin the open panel floats inside, left and right. */
const PANEL_MARGIN = 16;
/**
 * Width of the open app panel, which fills the space the globe vacates.
 *
 * Its right edge stops `PANEL_MARGIN` short of the wheel's box — not of the
 * resting cards, because the far rows swing left into that box and the panel
 * paints above them. Same edge, same derivation: box left is
 * `globe right − CURVE_TRAVEL + GRID_GAP`, and the panel gives up a margin at
 * each end of that.
 */
export const PANEL_WIDTH = `calc(${GLOBE_RIGHT} - ${CURVE_TRAVEL + DECK_OVERLAP - GRID_GAP + PANEL_MARGIN * 2}px)`;
