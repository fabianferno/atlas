"use client";

/**
 * The theme swap — prd.md §6.
 *
 * Flips `document.documentElement.dataset.skin`. That is the entire mechanism:
 * one attribute, and `globals.css` re-expresses the whole system in a different
 * material. No component re-renders, no manifest is re-read, and the agent is
 * never consulted — because the agent emits semantic A2UI and the CLIENT holds
 * the catalog. Swapping the skin while a generated app is on screen is the
 * shortest available proof of that property.
 *
 * Which is also the reason this control is deliberately NOT a nice piece of
 * product design. It exists to be pressed on camera at 1:05 while a live
 * autonomous app is rendered, so that the same manifest is visibly the same
 * manifest in both skins. Say it out loud: "the agent has no idea what this
 * looks like."
 *
 * Agency stays legible in both skins — depth in `tactile`, border weight in
 * `flat` — because a skin that hid which apps can spend would be a bug, not a
 * theme.
 */
import { useCallback, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export const SKINS = ["tactile", "flat"] as const;
export type Skin = (typeof SKINS)[number];

export const SKIN_STORAGE_KEY = "graphminis.skin";
export const DEFAULT_SKIN: Skin = "tactile";

/** Short label for the control. The *other* skin — what pressing it gets you. */
const NEXT_LABEL: Record<Skin, string> = {
  tactile: "Flat",
  flat: "Tactile",
};

const TITLE: Record<Skin, string> = {
  tactile: "Switch to the flat skin — same manifest, same A2UI document",
  flat: "Switch back to the tactile skin — same manifest, same A2UI document",
};

function isSkin(value: unknown): value is Skin {
  return typeof value === "string" && (SKINS as readonly string[]).includes(value);
}

export function applySkin(skin: Skin): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.skin = skin;
}

/**
 * The pre-paint script.
 *
 * Without this the first paint is always the default skin and then snaps to the
 * stored one — which on camera reads as a bug in the product rather than a
 * feature of it. Inlined in `<head>` so it runs before the body renders.
 *
 * Deliberately tiny and failure-tolerant: a private-mode localStorage throw must
 * not take the page down over a cosmetic preference.
 */
export const SKIN_BOOT_SCRIPT = `try{var s=localStorage.getItem(${JSON.stringify(
  SKIN_STORAGE_KEY,
)});document.documentElement.dataset.skin=(s==="flat"||s==="tactile")?s:${JSON.stringify(
  DEFAULT_SKIN,
)};}catch(e){document.documentElement.dataset.skin=${JSON.stringify(DEFAULT_SKIN)};}`;

/* ------------------------------------------------------------------ *
 * The DOM element IS the store.
 *
 * `document.documentElement.dataset.skin` is the single source of truth —
 * the boot script writes it before first paint and the toggle writes it on
 * press, so React state that tracked it separately could only ever drift
 * from what is actually on screen. `useSyncExternalStore` reads it directly
 * and takes `DEFAULT_SKIN` on the server, which is also why this needs no
 * effect and produces no hydration mismatch.
 * ------------------------------------------------------------------ */

const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot(): Skin {
  const current = document.documentElement.dataset.skin;
  return isSkin(current) ? current : DEFAULT_SKIN;
}

function getServerSnapshot(): Skin {
  return DEFAULT_SKIN;
}

export function SkinToggle({ className }: { className?: string }) {
  const skin = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next: Skin = getSnapshot() === "tactile" ? "flat" : "tactile";
    applySkin(next);
    try {
      localStorage.setItem(SKIN_STORAGE_KEY, next);
    } catch {
      // Private mode, quota, or a disabled store. The skin still applies for
      // this session — a cosmetic preference must not throw.
    }
    for (const fn of listeners) fn();
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      title={TITLE[skin]}
      aria-label={TITLE[skin]}
      className={cn(
        "btn shrink-0 px-2.5 py-1 text-[0.6875rem] uppercase tracking-[0.08em]",
        className,
      )}
    >
      {NEXT_LABEL[skin]}
    </button>
  );
}
