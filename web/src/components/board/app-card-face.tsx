import type { MiniApp } from "@/lib/seed";
import { fmtNum, fmtUsd } from "@/lib/store";
import { Fig, LiveDot, TierTag, panelClass } from "@/components/board/chrome";
import { cn } from "@/lib/utils";

/** Uniform fixed height (px) of a card face — the wheel uses this as its rowHeight base. */
export const APP_CARD_HEIGHT = 172;

/**
 * The presentational card face for a mini app. No navigation — the visual only.
 *
 * This is where Rule 1 pays off: scan fifteen cards and the chrome weight tells
 * you which ones hold wallets before you have read a single word.
 */
export function AppCardFace({
  app,
  active,
  className,
  style,
}: {
  app: MiniApp;
  active?: boolean;
  className?: string;
  style?: React.CSSProperties;
}): React.JSX.Element {
  const m = app.manifest;
  const tier = m.agency.tier;
  const halted = m.agency.policy.halted;
  const spentPct = m.agency.policy.maxSpendUsd > 0 ? app.stats.spentUsd / m.agency.policy.maxSpendUsd : 0;

  return (
    <div
      className={panelClass(
        tier,
        cn(
          "box-border flex min-w-0 flex-col overflow-hidden",
          active ? "ring-1 ring-[var(--action)]/40 shadow-[var(--elev-2)]" : "",
          className,
        ),
      )}
      style={{ height: APP_CARD_HEIGHT, ...style }}
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
    </div>
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
