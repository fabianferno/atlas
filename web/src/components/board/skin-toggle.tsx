"use client";

/**
 * The theme dice — prd.md §6, grown up.
 *
 * Flips `document.documentElement.dataset.skin`. That is the entire mechanism:
 * one attribute, and `globals.css` re-expresses the whole system in a different
 * material. No component re-renders, no manifest is re-read, and the agent is
 * never consulted — because the agent emits semantic A2UI and the CLIENT holds
 * the catalog. Rolling the skin while a generated app is on screen is the
 * shortest available proof of that property.
 *
 * It used to be a two-way tactile↔flat toggle. Now there are six skins and the
 * control is a dice: each press jumps to a random OTHER skin. The button shows
 * the skin the NEXT press lands you on, so pressing it on camera is a genuine
 * roll — "the agent has no idea what any of these look like."
 *
 * Agency stays legible in every skin — depth in the depth family, border weight
 * in the border family — because a skin that hid which apps can spend would be a
 * bug, not a theme.
 */
import { useCallback, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export const SKINS = [
  "tactile",
  "flat",
  "graph",
  "terminal",
  "blueprint",
  "vaporwave",
] as const;
export type Skin = (typeof SKINS)[number];

export const SKIN_STORAGE_KEY = "atlas.skin";
export const DEFAULT_SKIN: Skin = "tactile";

/** Proper label per skin, used on the button and in the title. */
const DISPLAY: Record<Skin, string> = {
  tactile: "Tactile",
  flat: "Flat",
  graph: "The Graph",
  terminal: "Terminal",
  blueprint: "Blueprint",
  vaporwave: "Vaporwave",
};

function isSkin(value: unknown): value is Skin {
  return typeof value === "string" && (SKINS as readonly string[]).includes(value);
}

export function applySkin(skin: Skin): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.skin = skin;
}

/** Pick a random skin that is NOT `current`. */
function rollNext(current: Skin): Skin {
  const others = SKINS.filter((s) => s !== current);
  return others[Math.floor(Math.random() * others.length)];
}

/**
 * The pre-paint script.
 *
 * Without this the first paint is always the default skin and then snaps to the
 * stored one — which on camera reads as a bug in the product rather than a
 * feature of it. Inlined in `<head>` so it runs before the body renders.
 *
 * The allow-list is generated from `SKINS` so it can never drift from the real
 * set. Deliberately tiny and failure-tolerant: a private-mode localStorage throw
 * must not take the page down over a cosmetic preference.
 */
export const SKIN_BOOT_SCRIPT = `try{var k=${JSON.stringify(
  SKINS,
)};var s=localStorage.getItem(${JSON.stringify(
  SKIN_STORAGE_KEY,
)});document.documentElement.dataset.skin=k.indexOf(s)>=0?s:${JSON.stringify(
  DEFAULT_SKIN,
)};}catch(e){document.documentElement.dataset.skin=${JSON.stringify(
  DEFAULT_SKIN,
)};}`;

/* ------------------------------------------------------------------ *
 * The DOM element IS the store.
 *
 * `document.documentElement.dataset.skin` is the single source of truth —
 * the boot script writes it before first paint and the dice writes it on
 * press, so React state that tracked it separately could only ever drift
 * from what is actually on screen. `useSyncExternalStore` reads it directly
 * and takes `DEFAULT_SKIN` on the server, which is also why this needs no
 * effect for the current skin and produces no hydration mismatch.
 * ------------------------------------------------------------------ */

const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of listeners) fn();
}

function getSnapshot(): Skin {
  const current = document.documentElement.dataset.skin;
  return isSkin(current) ? current : DEFAULT_SKIN;
}

function getServerSnapshot(): Skin {
  return DEFAULT_SKIN;
}

export function SkinToggle({ className }: { className?: string }) {
  // The button names the ACTIVE skin. `skin` has a stable server value
  // (`DEFAULT_SKIN`), so `useSyncExternalStore` swaps in the real stored skin
  // after hydration with no mismatch warning. The roll target is random and
  // client-only, so it is only ever computed inside the click handler — never
  // during render — which keeps this component fully hydration-safe.
  const skin = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const roll = useCallback(() => {
    const target = rollNext(getSnapshot());
    applySkin(target);
    try {
      localStorage.setItem(SKIN_STORAGE_KEY, target);
    } catch {
      // Private mode, quota, or a disabled store. The skin still applies for
      // this session — a cosmetic preference must not throw.
    }
    notify();
  }, []);

  const title = `Theme: ${DISPLAY[skin]}. Roll the dice for a random skin — same manifest, same A2UI document.`;

  return (
    <button
      type="button"
      onClick={roll}
      title={title}
      aria-label={title}
      className={cn(
        "btn shrink-0 px-2.5 py-1 text-[0.6875rem] uppercase tracking-[0.08em]",
        className,
      )}
    >
      <span aria-hidden className="mr-1.5">
        🎲
      </span>
      {DISPLAY[skin]}
    </button>
  );
}
