"use client";

import type { MiniApp } from "@/lib/seed";
import { KV, SectionHead } from "@/components/board/chrome";
import { fmtNum, fmtUsd } from "@/lib/store";

export function UsagePanel({ app }: { app: MiniApp }) {
  const m = app.manifest;
  return (
    <section className="panel p-3">
      <SectionHead title="Usage" />
      <dl className="cells mt-2">
        <KV k="Runs" v={fmtNum(app.stats.runs)} />
        <KV k="Forks" v={fmtNum(app.stats.forks)} />
        {/* `valueTransactedUsd` is GONE from this panel, deliberately.
            Nothing in the system writes it any more: the client-side
            ticker that used to set it — from invented swap amounts, equal
            to `spentUsd`, which made one guess look like two independent
            measurements — has been deleted, and no server route reports
            notional volume separately from spend-against-cap. A row that
            can only ever read $0.00 is not an empty state, it is a claim
            that nothing has moved, and for an app that really did sign a
            transaction that would be false. Spend-against-cap is real and
            is reported once, in "What it is allowed to do", where the cap
            it is metered against also lives. prd.md §12 wants total value
            transacted on registry cards; measuring it is unbuilt work, not
            a formatting problem. */}
        {/* Not earnings. There is no x402 facilitator and no payment path
            in this build — prd.md §12 specifies the outbound leg and the
            README lists it under "Not in scope" as display-only. So this
            row states the price the creator SET, and says plainly that
            nothing has ever been collected against it. `stats.earnedUsd`
            is not rendered at all; it has no writer. */}
        <KV
          k="Creator price"
          v={
            m.pricing?.x402.enabled
              ? `${fmtUsd(m.pricing.x402.priceUsd)} per run — configured, never charged`
              : "free"
          }
        />
      </dl>
      <p className="mt-2 text-[0.6875rem] leading-snug text-[var(--muted-ink)]">
        Runs and forks on the bundled apps are seeded texture — there is no community here
        yet, and a run you press is counted on top of that seed. No payment rail exists, so
        no creator has been paid.
      </p>
    </section>
  );
}
