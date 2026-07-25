"use client";

/**
 * Tags and semantic colour (prd.md §6 Rule 2).
 *
 * Five accents, one meaning each. `spend` is violet and appears ONLY when
 * value leaves a wallet — it is not available as a decorative tone by accident,
 * you have to ask for it by name.
 */

import { cn } from "@/lib/utils";

export type Tone = "neutral" | "live" | "gain" | "loss" | "risk" | "spend";

/** Text colour per tone. */
export const toneText: Record<Tone, string> = {
  neutral: "text-ink",
  live: "text-live",
  gain: "text-gain",
  loss: "text-loss",
  risk: "text-[color:var(--risk)]",
  spend: "text-spend",
};

/** Solid fill per tone, for the few places a tag is filled. */
const toneFill: Record<Tone, string> = {
  neutral: "bg-ink text-white",
  live: "bg-live text-white",
  gain: "bg-gain text-white",
  loss: "bg-loss text-white",
  risk: "bg-[var(--risk)] text-ink",
  spend: "bg-spend text-white",
};

/** Raw CSS colour per tone — for SVG fill/stroke where classes are awkward. */
export const toneVar: Record<Tone, string> = {
  neutral: "var(--ink)",
  live: "var(--live)",
  gain: "var(--gain)",
  loss: "var(--loss)",
  risk: "var(--risk)",
  spend: "var(--spend)",
};

export function Tag({
  tone = "neutral",
  filled = false,
  className,
  children,
}: {
  tone?: Tone;
  filled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "tag inline-flex items-center gap-1 whitespace-nowrap",
        filled ? toneFill[tone] : toneText[tone],
        !filled && tone !== "neutral" && "border-current",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Streaming indicator. Only ever means "a subscription is open right now".
 *
 * That docstring was true and the one caller below broke it — `TierTag` rendered
 * this on every `monitor`-tier chip, so the mark asserted an open subscription
 * from a tier label alone. Nothing subscribes except `watchBlocks` in `store.ts`,
 * and only for the seconds a bounded run lasts.
 *
 * This is a second, independent `LiveDot` — `chrome.tsx` has the board's. Two
 * definitions is why the constraint above could rot in one of them without the
 * other noticing; they should be consolidated into `chrome.tsx`, which is also
 * where `ArmedLamp` now lives. Left in place for now because the catalog's
 * `brutal/` primitives are deliberately self-contained (the renderer draws
 * agent-supplied documents and does not reach into board chrome), so merging them
 * is a real refactor rather than a rename.
 */
export function LiveDot({ className }: { className?: string }) {
  return <span aria-hidden className={cn("live-dot inline-block shrink-0", className)} />;
}

/**
 * The tier chip used in headers and the demo grid.
 *
 * `monitor` used to carry a `LiveDot`. A tier is configuration, not activity: an
 * app is `monitor` because of what it is allowed to do, which says nothing about
 * whether a block is arriving. §6 Rule 2 reserves `--live` for live, so the chip
 * keeps the live *tone* — monitor is the tier the live accent belongs to — without
 * the pulsing lamp that claims a stream.
 */
export function TierTag({ tier }: { tier: "readonly" | "monitor" | "autonomous" }) {
  if (tier === "autonomous") {
    return (
      <Tag tone="neutral" filled>
        autonomous
      </Tag>
    );
  }
  if (tier === "monitor") {
    return <Tag tone="live">monitor</Tag>;
  }
  return <Tag>readonly</Tag>;
}
