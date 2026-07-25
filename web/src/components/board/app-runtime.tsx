"use client";

/**
 * One running mini app, full width.
 *
 * The generated body sits in the middle. Around it is the structure the
 * product argues for showing rather than hiding: which schemas resolved,
 * which deployments are live, what the policy allows, what it has done.
 *
 * For the autonomous tier the policy strip, the kill switch and the trade log
 * are always present — the renderer enforces that, not the composer.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { TIER_BLURB } from "@/lib/seed";
import { seedToA2ui } from "@/lib/kit/seed-to-a2ui";
import {
  dispatchAction,
  fmtDate,
  fmtNum,
  fmtUsd,
  haltRemote,
  runApp,
  useApp,
  useBoard,
} from "@/lib/store";
import { AppBody } from "@/components/board/app-body";
import { TradeLog } from "@/components/board/ledger";
import { Fig, Label, LiveDot, SectionHead, TierTag, panelClass } from "@/components/board/chrome";
import { ForkDialog } from "@/components/registry/fork-dialog";
import { Ratings } from "@/components/registry/ratings";
import { cn } from "@/lib/utils";

export function AppRuntime({ name }: { name: string }) {
  const board = useBoard();
  const app = useApp(name);
  const [forking, setForking] = useState(false);

  // This app's slice of the board ledger, feeding trade_log inside the
  // generated body as well as the panel below it. Memoised so its identity is
  // stable — the A2UI renderer reseeds its data model when the document's
  // identity changes, which would otherwise reset a half-typed amount.
  const journal = useMemo(
    () => board.ledger.filter((l) => l.app === name),
    [board.ledger, name],
  );

  // Autonomous seed apps carry a fixture body (display only). Compose it into a
  // real A2UI document so the renderer draws the full action surface — the same
  // path a live-composed app takes. Other tiers keep the fixture body.
  const bodyDoc = useMemo(() => {
    const mm = app?.manifest;
    if (!mm) return null;
    return mm.agency.tier === "autonomous" ? seedToA2ui(mm, { journal }) : mm.ui;
  }, [app, journal]);

  if (!app && !board.hydrated) {
    // Published apps live in localStorage. Say nothing until we have looked.
    return (
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-10 sm:px-5">
        <div className="panel p-5">
          <p className="mono text-xs text-[var(--muted-ink)]">loading {name}…</p>
        </div>
      </main>
    );
  }

  if (!app) {
    return (
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-10 sm:px-5">
        <div className="panel p-5">
          <h1 className="display text-lg">No mini app called {name}</h1>
          <p className="mt-2 text-sm text-[var(--muted-ink)]">
            It may have been published in another browser — the board keeps its state locally.
          </p>
          <Link href="/registry" className="btn press mt-4 inline-block text-sm no-underline">
            Browse the registry
          </Link>
        </div>
      </main>
    );
  }

  const m = app.manifest;
  const tier = m.agency.tier;
  const policy = m.agency.policy;
  const autonomous = tier === "autonomous";

  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-4 sm:px-5 sm:py-6">
      <div className={panelClass(tier)}>
        {autonomous ? (
          <div className="policy-strip">
            <span>policy</span>
            <span className="fig normal-case">{policy.wallet ? `${policy.wallet.slice(0, 10)}…${policy.wallet.slice(-6)}` : "no wallet"}</span>
            <span className="opacity-50">·</span>
            <span>cap {fmtUsd(policy.maxSpendUsd)}</span>
            <span className="opacity-50">·</span>
            <span>per tx {fmtUsd(policy.maxPerTxUsd)}</span>
            <span className="opacity-50">·</span>
            <span>{policy.allowlist.length} allowlisted</span>
            <span className="opacity-50">·</span>
            <span>expires {policy.expiresAt ? fmtDate(policy.expiresAt) : "never"}</span>
            <span className="ml-auto flex items-center gap-2">
              {policy.halted ? <span style={{ color: "var(--loss)" }}>halted</span> : <span style={{ color: "var(--gain)" }}>armed</span>}
              <button
                type="button"
                onClick={() => void haltRemote(m, !policy.halted)}
                className={cn(
                  "btn press px-2.5 py-0.5 text-[0.625rem] uppercase tracking-[0.08em]",
                  !policy.halted && "btn--danger",
                )}
              >
                {policy.halted ? "Release" : "Kill switch"}
              </button>
            </span>
          </div>
        ) : null}

        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline p-3 shadow-[inset_0_-1px_0_var(--bevel-hi)] sm:p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="display text-base leading-none sm:text-xl">{m.title}</h1>
              {app.running && !policy.halted ? <LiveDot /> : null}
            </div>
            <p className="mono mt-1.5 text-[0.6875rem]">{m.identity.ens ?? `${m.name}.graphminis.eth`}</p>
            <p className="mt-2 max-w-[70ch] text-xs leading-snug text-[var(--muted-ink)]">{m.intent}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <TierTag tier={tier} />
            <button type="button" className="btn press px-2.5 py-1 text-xs" onClick={() => runApp(m.name)}>
              Run
            </button>
            <button type="button" className="btn press px-2.5 py-1 text-xs" onClick={() => setForking(true)}>
              Fork
            </button>
          </div>
        </header>

        <div className="p-3 sm:p-4">
          <AppBody
            doc={bodyDoc ?? m.ui}
            animate
            policy={policy}
            spentUsd={app.stats.spentUsd}
            journal={journal}
            onAction={(action) => {
              // Two shapes reach here: the fixture body dispatches a bare
              // `{ name, context }`; the A2UI renderer dispatches a full
              // client_to_server action `{ action: { name, context } }`.
              const raw = action as {
                name?: string;
                context?: Record<string, unknown>;
                action?: { name?: string; context?: Record<string, unknown> };
              };
              const name = raw.action?.name ?? raw.name;
              const context = raw.action?.context ?? raw.context ?? {};
              if (!name) return;

              // The kill switch is not a spend — it flips the halt flag on the
              // board and the server, same as the policy strip's button.
              if (name === "halt_agent") {
                void haltRemote(m, context.halted !== false);
                return;
              }

              // requireConfirm is satisfied here only because a human pressed
              // the button. A trigger-fired action goes through the signal
              // path and never sets this. An explicit confirm_action carries
              // its own consent.
              void dispatchAction(m, { name, context }, {
                userInitiated: true,
                confirmed: name === "confirm_action" || !policy.requireConfirm,
              });
            }}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="min-w-0 space-y-4">
          <section className="panel p-3">
            <SectionHead
              title="Data plan"
              note={`${app.stats.sourcesHealthy} of ${app.stats.sourcesQueried} deployments live`}
            />
            <dl className="cells mt-2">
              <KV k="Schemas" v={m.data.schemas.join(" · ")} />
              <KV k="Networks" v={m.data.networks.join(" · ")} />
              <KV k="Transport" v={m.data.transport === "x402" ? "x402 — the app's own wallet pays per query" : m.data.transport} />
              <KV
                k="Stream"
                v={m.data.stream ? `${m.data.stream.package} · ${m.data.stream.module}` : "none — evaluated on open"}
              />
              <KV k="Cost per run" v={`$${app.stats.costPerRunUsd.toFixed(3)}`} />
            </dl>

            <div className="mt-3 border-t border-[var(--hairline)] pt-2">
              <Label>Sources</Label>
              <ul className="mt-1.5 space-y-1">
                {m.data.sources.map((s) => (
                  <li key={s.subgraphId} className="flex items-baseline gap-2">
                    <span
                      className="mt-[3px] h-2 w-2 shrink-0 rounded-full shadow-[inset_0_-1px_1px_rgba(0,0,0,0.25)]"
                      style={{ background: s.healthy ? "var(--gain)" : "var(--loss)" }}
                      aria-hidden
                    />
                    <span className="mono min-w-0 flex-1 truncate text-[0.6875rem]">{s.label ?? s.subgraphId}</span>
                    <span className="mono shrink-0 text-[0.625rem] text-[var(--muted-ink)]">{s.schema}</span>
                    <span
                      className="mono shrink-0 text-[0.5625rem] uppercase"
                      style={{ color: s.healthy ? "var(--gain)" : "var(--loss)" }}
                    >
                      {s.healthy ? "live" : "dead, skipped"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {autonomous ? (
            <section className="panel panel--autonomous p-3">
              <SectionHead title="What it is allowed to do" note={TIER_BLURB[tier]} />
              <dl className="cells mt-2">
                <KV k="Wallet" v={policy.wallet ?? "not funded"} mono />
                <KV k="Lifetime cap" v={fmtUsd(policy.maxSpendUsd)} />
                <KV k="Per transaction" v={fmtUsd(policy.maxPerTxUsd)} />
                <KV k="Spent" v={fmtUsd(app.stats.spentUsd)} accent={app.stats.spentUsd > 0 ? "spend" : undefined} />
                <KV k="Expires" v={policy.expiresAt ? fmtDate(policy.expiresAt) : "never"} />
                <KV k="Requires confirm" v={policy.requireConfirm ? "yes" : "no — trigger signs directly"} />
              </dl>
              <div className="mt-2">
                <Label>Allowlist — anything not here is rejected</Label>
                <ul className="mono mt-1 space-y-0.5 text-[0.625rem]">
                  {policy.allowlist.map((a) => (
                    <li key={a} className="truncate">
                      {a}
                    </li>
                  ))}
                  {policy.allowlist.length === 0 ? <li>empty — no actions, no exceptions</li> : null}
                </ul>
              </div>
              <div className="mt-3 border-t border-[var(--hairline)] pt-2">
                <Label>Triggers</Label>
                <ul className="mono mt-1 space-y-0.5 text-[0.6875rem]">
                  {m.agency.triggers.map((t, i) => (
                    <li key={i}>
                      on {t.on}
                      {t.when ? ` when ${t.when}` : ""} → {t.run}
                    </li>
                  ))}
                  {m.agency.triggers.length === 0 ? <li>none</li> : null}
                </ul>
              </div>
            </section>
          ) : null}

          <Ratings appName={m.name} />
        </div>

        <aside className="min-w-0 space-y-4">
          {autonomous || tier === "monitor" ? <TradeLog appName={m.name} /> : null}

          <section className="panel p-3">
            <SectionHead title="Provenance" />
            <dl className="cells mt-2">
              <KV k="Author" v={m.author ?? "unclaimed"} mono />
              <KV k="Model" v={m.provenance.model} mono />
              <KV k="Compute" v={m.provenance.compute} mono />
              <KV k="Attestation" v={m.provenance.attestationRef ?? "none"} mono />
              <KV k="Manifest" v={m.identity.manifestCid ?? "not pinned"} mono />
              <KV
                k="Agentic ID"
                v={m.identity.agenticId ? `#${m.identity.agenticId.tokenId} on 0G Chain` : "not minted"}
                mono
              />
              <KV k="Forked from" v={m.forkedFrom ?? "original"} mono />
              <KV k="Version" v={m.appVersion} mono />
            </dl>
          </section>

          <section className="panel p-3">
            <SectionHead title="Usage" />
            <dl className="cells mt-2">
              <KV k="Runs" v={fmtNum(app.stats.runs)} />
              <KV k="Forks" v={fmtNum(app.stats.forks)} />
              <KV k="Value transacted" v={fmtUsd(app.stats.valueTransactedUsd)} />
              <KV
                k="Creator earnings"
                v={m.pricing?.x402.enabled ? `${fmtUsd(app.stats.earnedUsd)} at ${fmtUsd(m.pricing.x402.priceUsd)} per run` : "free"}
              />
            </dl>
          </section>
        </aside>
      </div>

      {forking ? <ForkDialog app={app} onClose={() => setForking(false)} /> : null}
    </main>
  );
}

function KV({ k, v, mono, accent }: { k: string; v: string; mono?: boolean; accent?: "spend" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-[var(--hairline)] py-1.5 first:border-t-0">
      <dt className="mono shrink-0 text-[0.625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">{k}</dt>
      <dd className="min-w-0 text-right">
        {mono ? (
          <Fig className="block truncate text-[0.6875rem]" accent={accent}>
            {v}
          </Fig>
        ) : (
          <Fig className="text-[0.6875rem]" accent={accent}>
            {v}
          </Fig>
        )}
      </dd>
    </div>
  );
}
