"use client";

/**
 * The grid of your mini apps, sorted by tier.
 *
 * This is where Rule 1 pays off: scan fifteen cards and the chrome weight tells
 * you which ones hold wallets before you have read a single word.
 */
import Link from "next/link";
import type { MiniApp } from "@/lib/seed";
import { TIER_BLURB, TIER_LABEL } from "@/lib/seed";
import { fmtNum, fmtUsd, myApps, tierCounts, useBoard } from "@/lib/store";
import { Fig, Label, LiveDot, SectionHead, TierTag, panelClass } from "@/components/board/chrome";

export function AppGrid() {
  const board = useBoard();
  const apps = myApps(board);
  const counts = tierCounts(board);

  return (
    <section>
      <SectionHead
        title="Your mini apps"
        note={`${counts.autonomous} autonomous · ${counts.monitor} monitor · ${counts.readonly} read only`}
        right={
          <Link href="/registry" className="mono text-[0.6875rem] uppercase tracking-[0.08em] underline underline-offset-2">
            Registry
          </Link>
        }
      />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {apps.map((app, i) => (
          <AppCard key={app.manifest.name} app={app} index={i} />
        ))}
      </div>
      {apps.length === 0 ? (
        <p className="mono py-8 text-center text-xs text-[var(--muted-ink)]">
          nothing published yet — describe something above
        </p>
      ) : null}
    </section>
  );
}

export function AppCard({ app, index, href }: { app: MiniApp; index: number; href?: string }) {
  const m = app.manifest;
  const tier = m.agency.tier;
  const halted = m.agency.policy.halted;
  const spentPct = m.agency.policy.maxSpendUsd > 0 ? app.stats.spentUsd / m.agency.policy.maxSpendUsd : 0;

  return (
    <Link
      href={href ?? `/a/${m.name}`}
      className={panelClass(tier, "raise press snap-in flex min-w-0 flex-col no-underline")}
      style={{ ["--i" as string]: Math.min(index, 8) } as React.CSSProperties}
    >
      {tier === "autonomous" ? (
        <div className="policy-strip">
          <span>wallet</span>
          <span className="fig normal-case">{m.agency.policy.wallet ? `${m.agency.policy.wallet.slice(0, 6)}…${m.agency.policy.wallet.slice(-4)}` : "not funded"}</span>
          <span className="opacity-50">·</span>
          <span>cap</span>
          <span className="fig normal-case">{fmtUsd(m.agency.policy.maxSpendUsd)}</span>
          <span className="opacity-50">·</span>
          <span>per tx</span>
          <span className="fig normal-case">{fmtUsd(m.agency.policy.maxPerTxUsd)}</span>
          {halted ? (
            <span className="ml-auto" style={{ color: "var(--loss)" }}>
              halted
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="display min-w-0 text-[0.8125rem] leading-tight">{m.title}</h3>
          {app.running && !halted ? <LiveDot label="" /> : null}
        </div>

        <p className="mono mt-1 truncate text-[0.625rem] text-[var(--muted-ink)]">
          {m.identity.ens ?? `${m.name}.graphminis.eth`}
        </p>

        <p className="mt-2 line-clamp-2 text-xs leading-snug text-[var(--muted-ink)]">{m.intent}</p>

        <div className="mb-3 mt-3 flex flex-wrap items-center gap-1.5">
          <TierTag tier={tier} />
          {m.data.networks.slice(0, 2).map((n) => (
            <span key={n} className="mono text-[0.5625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
              {n.replace("-one", "")}
            </span>
          ))}
        </div>

        <dl className="cells mt-auto border-t border-[var(--hairline)] pt-2">
          <Row k="Runs" v={fmtNum(app.stats.runs)} />
          <Row k="Sources live" v={`${app.stats.sourcesHealthy} / ${app.stats.sourcesQueried}`} />
          {tier === "autonomous" ? (
            <Row k="Spent" v={fmtUsd(app.stats.spentUsd)} accent={app.stats.spentUsd > 0 ? "spend" : "ink"} />
          ) : (
            <Row k="Cost per run" v={`$${app.stats.costPerRunUsd.toFixed(3)}`} />
          )}
        </dl>

        {tier === "autonomous" ? (
          <div className="mt-2 h-1.5 w-full" style={{ background: "var(--hairline)" }}>
            <div className="h-full" style={{ width: `${Math.min(100, spentPct * 100)}%`, background: "var(--spend)" }} />
          </div>
        ) : null}
      </div>
    </Link>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: "spend" | "ink" }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <dt className="mono text-[0.625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">{k}</dt>
      <dd>
        <Fig className="text-[0.6875rem] font-medium" accent={accent}>
          {v}
        </Fig>
      </dd>
    </div>
  );
}

/** The tier legend. Says out loud what the chrome is already saying. */
export function TierLegend() {
  return (
    <div className="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
      <Label>Border weight is agency</Label>
      {(["readonly", "monitor", "autonomous"] as const).map((tier) => (
        <span key={tier} className="flex items-center gap-1.5">
          <span
            className="h-3 w-5 border-rule bg-[var(--card-b)]"
            style={{ borderWidth: tier === "autonomous" ? "5px" : tier === "monitor" ? "2.5px" : "1.5px" }}
            aria-hidden
          />
          <span className="mono text-[0.625rem] uppercase tracking-[0.06em]">{TIER_LABEL[tier]}</span>
          <span className="hidden text-[0.6875rem] text-[var(--muted-ink)] sm:inline">{TIER_BLURB[tier]}</span>
        </span>
      ))}
    </div>
  );
}
