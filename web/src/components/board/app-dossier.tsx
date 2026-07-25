"use client";

/**
 * The card, opened up — what fills the globe's side of the Board while a mini
 * app runs in the drawer.
 *
 * Opening a card used to leave the left half empty: the globe slid off and
 * nothing took its place, so the app arrived with no answer to "which one is
 * this?" once its card was behind the scrim. This is that answer. It carries
 * the card's own face — glyph, title, ENS, intent, tier, vitals — at a size the
 * 172px card could never give them, plus the two lines a card has no room for
 * (what it watches, when it last ran).
 *
 * It deliberately stays a *summary*. The drawer beside it holds the running app
 * and every full panel — data plan, allowlist, provenance, ledger. Repeating
 * those here would make the eye choose between two copies of the same thing.
 *
 * Desktop only, and only where there is genuinely room: below `lg` the drawer
 * takes most of the screen, and on a phone it is a bottom sheet with no left at
 * all. It carries no `aria-hidden`: the drawer beside it is `aria-modal`, so a
 * screen reader already hears this app described once, from inside the dialog —
 * and hiding a panel that still holds a tabbable link would strand focus on
 * something nothing announces.
 */
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { TIER_BLURB } from "@/lib/seed";
import { fmtDate, fmtNum, fmtUsd, useApp } from "@/lib/store";
import { AppGlyph } from "@/components/board/app-glyph";
import { Fig, Label, LiveDot, TierTag, panelClass } from "@/components/board/chrome";
import { cn } from "@/lib/utils";

export function AppDossier({ name, open }: { name: string | null; open: boolean }) {
  const app = useApp(name ?? "");
  if (!app) return null;

  const m = app.manifest;
  const tier = m.agency.tier;
  const policy = m.agency.policy;
  const autonomous = tier === "autonomous";
  const halted = policy.halted;
  const spentPct = policy.maxSpendUsd > 0 ? app.stats.spentUsd / policy.maxSpendUsd : 0;
  const trigger = m.agency.triggers[0];

  return (
    <div
      className="pointer-events-none fixed left-4 top-4 bottom-4 hidden items-center lg:flex"
      // The drawer's own geometry, mirrored: it is min(58vw, 860px) wide with a
      // 1rem margin, so the dossier stops half a rem short of its edge. Inline
      // rather than a class because the value is a calc the drawer defines.
      style={{ right: "calc(min(58vw, 860px) + 1.5rem)" }}
    >
      <div
        className={cn(
          "flex max-h-full w-full max-w-[460px] flex-col overflow-y-auto",
          // Tailwind v4 drives `-translate-x-*` through the CSS `translate`
          // property, not `transform` — same note as the globe next door.
          "transition-[translate,opacity] duration-300 ease-out will-change-[translate,opacity]",
          // Arrives a beat late on the way in, so the globe has left before
          // this lands in its place. Leaves immediately — a closing panel that
          // lingers reads as lag, not as choreography.
          // Pointer events go with visibility, not with presence — a panel
          // still fading out must not swallow the click that reopens the board.
          open
            ? "pointer-events-auto translate-x-0 opacity-100 delay-150"
            : "-translate-x-6 opacity-0 delay-0",
        )}
      >
        <div className={panelClass(tier, "shadow-[var(--elev-2)]")}>
          {autonomous ? (
            <div className="policy-strip">
              <span>cap</span>
              <span className="fig normal-case">{fmtUsd(policy.maxSpendUsd)}</span>
              <span className="opacity-50">·</span>
              <span>per tx</span>
              <span className="fig normal-case">{fmtUsd(policy.maxPerTxUsd)}</span>
              <span className="ml-auto" style={{ color: halted ? "var(--loss)" : "var(--gain)" }}>
                {halted ? "halted" : "armed"}
              </span>
            </div>
          ) : null}

          <div className="p-4">
            <div className="flex items-start gap-3">
              <AppGlyph manifest={m} size={38} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <h2 className="display text-lg leading-tight">{m.title}</h2>
                <p className="mono mt-1.5 truncate text-[0.6875rem] text-[var(--muted-ink)]">
                  {m.identity.ens ?? `${m.name}.graphminis.eth`}
                </p>
              </div>
              {app.running && !halted ? <LiveDot /> : null}
            </div>

            <p className="mt-3 text-xs leading-relaxed text-[var(--muted-ink)]">{m.intent}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <TierTag tier={tier} />
              <span className="mono text-[0.5625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
                {TIER_BLURB[tier]}
              </span>
            </div>

            <dl className="cells mt-4 border-t border-[var(--hairline)] pt-1">
              <Row k="Runs" v={fmtNum(app.stats.runs)} />
              <Row k="Last run" v={fmtDate(app.lastRunAt)} />
              <Row k="Sources live" v={`${app.stats.sourcesHealthy} / ${app.stats.sourcesQueried}`} />
              <Row k="Networks" v={m.data.networks.map((n) => n.replace("-one", "")).join(" · ")} />
              <Row k="Schemas" v={m.data.schemas.join(" · ")} />
              {autonomous ? (
                <Row
                  k="Spent"
                  v={`${fmtUsd(app.stats.spentUsd)} of ${fmtUsd(policy.maxSpendUsd)}`}
                  accent={app.stats.spentUsd > 0 ? "spend" : undefined}
                />
              ) : (
                <Row k="Cost per run" v={`$${app.stats.costPerRunUsd.toFixed(3)}`} />
              )}
            </dl>

            {autonomous ? (
              <div className="mt-2 h-1.5 w-full" style={{ background: "var(--hairline)" }}>
                <div
                  className="h-full"
                  style={{ width: `${Math.min(100, spentPct * 100)}%`, background: "var(--spend)" }}
                />
              </div>
            ) : null}

            {trigger ? (
              <div className="mt-4 border-t border-[var(--hairline)] pt-2">
                <Label>Watches</Label>
                <p className="mono mt-1.5 text-[0.6875rem] leading-relaxed">
                  on {trigger.on}
                  {trigger.when ? ` when ${trigger.when}` : ""} → {trigger.run}
                  {m.agency.triggers.length > 1 ? (
                    <span className="text-[var(--muted-ink)]">
                      {" "}
                      · +{m.agency.triggers.length - 1} more
                    </span>
                  ) : null}
                </p>
              </div>
            ) : null}

            <Link
              href={`/a/${m.name}`}
              className="mono mt-4 inline-flex items-center gap-1 text-[0.6875rem] uppercase tracking-[0.08em] underline underline-offset-2"
            >
              Open full page
              <ArrowUpRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: "spend" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-[var(--hairline)] py-1.5 first:border-t-0">
      <dt className="mono shrink-0 text-[0.625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">
        {k}
      </dt>
      <dd className="min-w-0 text-right">
        <Fig className="block truncate text-[0.6875rem] font-medium" accent={accent}>
          {v}
        </Fig>
      </dd>
    </div>
  );
}
