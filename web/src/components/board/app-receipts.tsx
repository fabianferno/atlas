"use client";

import type { RunOutcome, WatchOutcome } from "@/lib/store";

/** A one-line result of a round trip that actually happened. */
export function Receipt({ tone, text }: { tone: "live" | "risk" | "loss" | "wait"; text: string }) {
  return (
    <p
      className="mono text-[0.6875rem] leading-snug"
      style={{ color: tone === "wait" ? "var(--muted-ink)" : `var(--${tone})` }}
    >
      {text}
    </p>
  );
}

/**
 * What a run actually returned.
 *
 * `live: false` is the case this exists for. `lib/kit/gateway.ts` puts it
 * bluntly — a demo that can't tell you whether it is live is worse than one that
 * is not — so a fixture answer is labelled as a fixture answer in the same line
 * that reports the row count, not in a footnote somewhere else. And `ok: false`
 * never renders as a run: no rows, no cost, no elapsed time, just the error the
 * server gave.
 */
export function runReceipt(out: RunOutcome): { tone: "live" | "risk" | "loss"; text: string } {
  if (!out.ok) {
    return { tone: "loss", text: `run failed — ${out.error ?? "no reason given"} · nothing was re-queried` };
  }
  const facts =
    `${out.rows} row${out.rows === 1 ? "" : "s"} · ${out.sourcesHealthy} of ${out.sourcesQueried} deployments answered` +
    ` · $${out.costUsd.toFixed(4)} attributed · ${out.elapsedMs}ms`;
  return out.live
    ? { tone: "live", text: `live — ${facts}` }
    : {
        tone: "risk",
        text: `FIXTURES — ${facts}. The gateway is not keyed, so no deployment was queried and these numbers describe bundled data.`,
      };
}

/**
 * What a bounded Substreams run actually returned.
 *
 * Three failures, three different sentences, because they mean three different
 * things and collapsing them into "nothing happened" is the lie:
 *
 *   unavailable — no SUBSTREAMS_API_TOKEN. The capability is unconfigured and
 *                 nothing was ever attempted. A 409, not a fault.
 *   ok: false   — the subscription was attempted and the endpoint answered. At
 *                 the time of writing that answer is
 *                 `[resource_exhausted] Concurrent stream limit exceeded
 *                 (active sessions: 2/2)` — an account-wide free-tier cap
 *                 saturated by sessions outside this process. That is real,
 *                 informative, and must read as a real failure of a real call.
 *                 A seed app whose `data.stream.package` is a name rather than
 *                 an `.spkg` URL fails here too, at URL parse; the reason is
 *                 shown verbatim rather than smoothed into "stream error".
 *   ok: true    — blocks were consumed. Reported as a bounded run, never as a
 *                 standing subscription: `/api/stream` consumes N blocks and
 *                 returns, and the header of that route explains why an
 *                 unbounded one would be a lie in serverless.
 */
export function watchReceipt(out: WatchOutcome): { tone: "live" | "risk" | "loss"; text: string } {
  if (out.unavailable) {
    return {
      tone: "risk",
      text: `Substreams is not configured — ${out.error ?? "no token"}. No subscription was opened and no block was evaluated; triggers fall back to interval polling.`,
    };
  }
  if (!out.ok) {
    // "no blocks consumed", then the server's reason verbatim. The store already
    // prefixes the route's own "Subscription failed" onto the detail, so adding a
    // second "failed" of our own just buries the part that identifies the cause.
    return {
      tone: "loss",
      text: `no blocks consumed — ${out.error ?? "no reason given"}`,
    };
  }
  return {
    tone: "live",
    text:
      `${out.blocks} block${out.blocks === 1 ? "" : "s"} consumed via ${out.mode} · ` +
      `${out.fired} trigger${out.fired === 1 ? "" : "s"} fired. Bounded run — it has returned and is no longer subscribed.`,
  };
}
