/**
 * Every mini app gets its own face.
 *
 * Depth already tells you what an app can *do*. It says nothing about what the
 * app *watches* — so a screen of fifteen cards in identical chrome still reads
 * as a wall of text you have to parse title-first. The glyph closes that gap: a
 * molded keycap in the corner of each card, picked from the app's subject. A
 * bridge watcher never looks like a yield rotator, and two DEX apps look alike
 * because they are alike.
 *
 * Rule 2 holds — the mark is ink on plastic, never a colour. Colour still means
 * one thing each, and "this app is about NFTs" is not one of them.
 *
 * The pick is deterministic and total. Subject keywords come first because they
 * carry real meaning, category next, and a stable hash of the name last — so an
 * app described in the Studio thirty seconds ago gets its own mark immediately,
 * and keeps that mark for good.
 */
import {
  Activity,
  ArrowLeftRight,
  ArrowUpFromLine,
  Binoculars,
  ChartCandlestick,
  ChartColumn,
  ChartLine,
  ChartNetwork,
  CircleDot,
  Coins,
  Compass,
  Copy,
  Crosshair,
  Fuel,
  Gauge,
  Gem,
  HeartPulse,
  Landmark,
  Layers,
  Network,
  Orbit,
  Repeat,
  Route,
  SatelliteDish,
  Scale,
  ShieldCheck,
  Split,
  Target,
  TrendingDown,
  Trophy,
  Waves,
  Wrench,
} from "lucide-react";
import type { Manifest } from "@/lib/contracts/manifest";
import { cn } from "@/lib/utils";

type Glyph = React.ComponentType<{ className?: string; strokeWidth?: number; size?: number }>;

/**
 * Subject → mark. First hit wins, so the specific has to sit above the generic:
 * a perp *deleverage* guard is about leverage coming down, not about perps, and
 * a *bridge outflow* alarm is about value leaving, not about bridges.
 */
const BY_SUBJECT: [RegExp, Glyph][] = [
  [/copy|mirror/, Copy],
  [/whale/, Waves],
  [/gas|rebate|claim/, Fuel],
  [/deleverage|leverage/, TrendingDown],
  // A guard *acts* on a health factor, so it sits above the watcher that only
  // reads one — otherwise every app that says "health factor" gets one mark.
  [/guard|shield|protect/, ShieldCheck],
  [/rotat|rebalance/, Repeat],
  [/health.?factor/, HeartPulse],
  [/diverg/, Split],
  [/oracle|price.?feed|stale/, SatelliteDish],
  [/outflow|drain/, ArrowUpFromLine],
  [/bridge/, ArrowLeftRight],
  [/nft/, Gem],
  [/leaderboard|\brank/, Trophy],
  [/tvl/, Layers],
  [/perp|futures|open.?interest/, ChartCandlestick],
  [/option/, Scale],
  [/dex.?aggregator|aggregator/, Route],
  [/dex|swap|amm|volume/, ChartColumn],
  [/yield|apy|vault|stablecoin/, Coins],
  [/lending|cdp|borrow|collateral/, Landmark],
  [/network|block|validator/, Network],
];

/** Category → mark, for an app whose subject we could not name. */
const BY_CATEGORY: Record<string, Glyph> = {
  analytics: ChartLine,
  risk: Gauge,
  flow: Activity,
  trading: Crosshair,
  yield: Coins,
  ops: Wrench,
};

/**
 * Last resort. Nothing here overlaps the tables above, so an unrecognised app
 * still lands on a mark no recognised app is already using.
 */
const FALLBACK: Glyph[] = [
  Orbit,
  CircleDot,
  Binoculars,
  Compass,
  Target,
  ChartNetwork,
];

/** FNV-1a, trimmed. Any stable hash does — this one is short and has no deps. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function glyphFor(m: Manifest): Glyph {
  const subject = `${m.name} ${m.tags.join(" ")} ${m.title} ${m.intent}`.toLowerCase();
  for (const [pattern, glyph] of BY_SUBJECT) if (pattern.test(subject)) return glyph;
  return BY_CATEGORY[m.category] ?? FALLBACK[hash(m.name) % FALLBACK.length];
}

/**
 * The keycap. Same plastic as everything else — hairline edge, catch-light on
 * the top lip, a shadow under it — so it reads as moulded into the card rather
 * than printed on top of one.
 */
export function AppGlyph({
  manifest,
  size = 24,
  className,
}: {
  manifest: Manifest;
  size?: number;
  className?: string;
}): React.JSX.Element {
  const Mark = glyphFor(manifest);
  return (
    <span
      className={cn("grid shrink-0 place-items-center border border-hairline", className)}
      style={{
        width: size,
        height: size,
        borderRadius: "calc(var(--radius) * 0.42)",
        background: "var(--card-b)",
        boxShadow: "inset 0 1px 0 var(--bevel-hi), var(--elev-1)",
        color: "var(--ink)",
      }}
      // The title beside it says the same thing in words. This is for the eye.
      aria-hidden
    >
      {/*
        Picked, not built: every mark is a module constant, so `Mark` holds the
        same identity across renders and the subtree is never remounted. The
        lint rule can only see a call returning a component and assumes the
        worse case.
      */}
      {/* eslint-disable-next-line react-hooks/static-components */}
      <Mark className="block" size={Math.round(size * 0.58)} strokeWidth={1.75} />
    </span>
  );
}
