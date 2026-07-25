/**
 * The brand mark: a disc with an eight-point asterisk knocked out of it, and
 * one arm — the east one — running clear to the disc edge.
 *
 * Geometry is traced from logo.jpg (800px source, measured to the half-pixel)
 * and normalised to a 100-unit box:
 *   disc r 25.31 · bar width 4.125 · arm reach 15.125 · east arm reach 25.31
 * `scripts/generate-brand-icons.mjs` renders the raster icon set from the same
 * numbers, so the favicon and this component cannot drift apart.
 *
 * The asterisk is a mask cutout rather than a painted shape, so the mark is
 * two-tone by transparency: the disc takes `currentColor` and the arms show
 * whatever is behind them. That is what lets one component sit on both the
 * `graph` and `flat` skins without a per-skin variant.
 */
import { useId } from "react";

const R = 25.31; // disc radius
const HALF_W = 2.0625; // asterisk bar half-width
const REACH = 15.125; // arm half-length, all arms but the east one

const BAR = { x: 50 - HALF_W, y: 50 - REACH, width: HALF_W * 2, height: REACH * 2 };

export function BrandMark({ className, title }: { className?: string; title?: string }) {
  const maskId = useId();

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <mask id={maskId}>
        <circle cx="50" cy="50" r={R} fill="#fff" />
        <g fill="#000">
          <rect {...BAR} />
          <rect {...BAR} transform="rotate(45 50 50)" />
          <rect {...BAR} transform="rotate(-45 50 50)" />
          {/* The east arm overshoots to the disc edge — the one asymmetry in
              the mark, and the thing that keeps it from reading as a generic
              asterisk. Drawn last so it wins over the plain horizontal bar. */}
          <rect x={50 - REACH} y={50 - HALF_W} width={REACH + R} height={HALF_W * 2} />
        </g>
      </mask>
      <rect width="100" height="100" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}
