"use client";

/**
 * Agency tier + policy, made ambient.
 *
 * prd.md §6 Rule 1: border weight encodes agency. Every panel in a running
 * mini app must agree on the tier, so it lives in context rather than being
 * threaded through `CatalogComponentProps` (which is a frozen contract and
 * deliberately does not carry it).
 *
 * This context is CLIENT-HELD. The agent cannot set it — that is the point.
 * A generated document cannot promote itself from readonly to autonomous.
 */

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import type { AgencyTier, Policy } from "@/lib/contracts/manifest";

export interface RuntimeContextValue {
  tier: AgencyTier;
  /** Present for monitor/autonomous. Used to clamp inputs at render time. */
  policy: Policy | null;
  /** Cumulative spend recorded against this mini app. */
  spentUsd: number;
  /** True while a subgraph subscription/substream is streaming. */
  live: boolean;
}

const DEFAULT: RuntimeContextValue = {
  tier: "readonly",
  policy: null,
  spentUsd: 0,
  live: false,
};

const RuntimeContext = createContext<RuntimeContextValue>(DEFAULT);

export function RuntimeProvider({
  tier = "readonly",
  policy = null,
  spentUsd = 0,
  live = false,
  children,
}: Partial<RuntimeContextValue> & { children: React.ReactNode }) {
  const value = useMemo<RuntimeContextValue>(
    () => ({ tier, policy, spentUsd, live }),
    [tier, policy, spentUsd, live],
  );
  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useRuntime(): RuntimeContextValue {
  return useContext(RuntimeContext);
}

export function useTier(): AgencyTier {
  return useContext(RuntimeContext).tier;
}

/* ── the clock ───────────────────────────────────────────────────────────────
 * Policy expiry is time-dependent, and `Date.now()` in a render body is both
 * impure and a hydration mismatch (the server's clock is not the browser's).
 * One shared external store, read through `useSyncExternalStore`: the server
 * snapshot is 0, so callers treat 0 as "clock not established" and skip the
 * expiry check rather than guessing. A policy that looks live for one frame is
 * harmless — the signer is what actually enforces expiry.
 *
 * It ticks every 30s so an expiry countdown ages without a timer per component.
 */
let clockValue = 0;
let clockTimer: ReturnType<typeof setInterval> | null = null;
const clockListeners = new Set<() => void>();

function clockSubscribe(cb: () => void): () => void {
  clockListeners.add(cb);
  if (clockTimer === null) {
    clockValue = Date.now();
    clockTimer = setInterval(() => {
      clockValue = Date.now();
      clockListeners.forEach((l) => l());
    }, 30_000);
    queueMicrotask(() => clockListeners.forEach((l) => l()));
  }
  return () => {
    clockListeners.delete(cb);
    if (clockListeners.size === 0 && clockTimer !== null) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

const readClock = () => clockValue;
const readClockOnServer = () => 0;

/** Current epoch ms, or 0 before the client clock is established. */
export function useNow(): number {
  return useSyncExternalStore(clockSubscribe, readClock, readClockOnServer);
}

/** The class that carries Rule 1. Nothing else may set a panel border width. */
export function tierPanelClass(tier: AgencyTier): string {
  if (tier === "autonomous") return "panel panel--autonomous";
  if (tier === "monitor") return "panel panel--monitor";
  return "panel";
}
