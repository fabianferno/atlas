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
 *
 * WHAT THIS FILE IS NOT ALLOWED TO DO, because it did all of it and each one was
 * a different way of asserting something the system could not back:
 *
 *   - Render `agency.policy.wallet` as the address to fund. A manifest is a
 *     client-side document and cannot be an authority on a server-held key. The
 *     seed manifests carried hand-written 40-hex strings; nobody holds those
 *     keys, so funding one destroys the money. The signer now comes from
 *     `/api/agency/register`, which provisions if needed and reports either way.
 *   - Fall back to `${name}.atlas-apps.eth` when `identity.ens` is null. Five
 *     subnames exist under that parent on Sepolia and none belongs to a bundled
 *     app. §8 makes the name the thing you verify before funding, so a name that
 *     does not resolve is worse than no name.
 *   - Show a figure with no writer. `stats.valueTransactedUsd` and
 *     `stats.earnedUsd` both lost their only writer when the fabricated ledger
 *     ticker went; neither is rendered.
 *   - Let a fixture answer look like a gateway answer, or a failed call look
 *     like a quiet one. Both Run and Watch report what the server returned,
 *     including `live: false` and every distinct failure shape.
 *
 * It also renders the thing §7 asked for and nothing displayed: per-constraint
 * enforcement — chain or server — straight from `enforcementReport()`, whose
 * `verifiedOnchain` is an `isSessionEnabled()` read rather than a constant.
 *
 * And it is now where an unnamed app gets named. `AppPublishPanel`
 * (`publish-panel.tsx`) is mounted below, so the second rule above stops being a
 * dead end: an app with no `identity.ens` still refuses to invent one, and now
 * there is a way to earn one instead. That press is a real write to two chains,
 * so the panel states what will happen before it and takes a second, deliberate
 * confirm — see its header for why.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { TIER_BLURB } from "@/lib/seed";
import { isConditionEvaluable } from "@/lib/agency/condition";
import { seedToA2ui } from "@/lib/kit/seed-to-a2ui";
import type { Manifest } from "@/lib/contracts/manifest";
// Type-only, so nothing from the signing stack reaches the client bundle. The
// point of importing it rather than restating the shape is that if the server's
// report grows a constraint, this file stops compiling instead of quietly
// rendering six of seven.
import type { EnforcementReport, EnforcementSite, WalletKind } from "@/lib/agency/wallet";
import {
  dispatchAction,
  fmtDate,
  fmtNum,
  fmtUsd,
  haltRemote,
  isArmed,
  runApp,
  shortHash,
  watchBlocks,
  useApp,
  useBoard,
  type RunOutcome,
  type WatchOutcome,
} from "@/lib/store";
import { AppBody } from "@/components/board/app-body";
import { AppPublishPanel } from "@/components/board/publish-panel";
import { TradeLog } from "@/components/board/ledger";
import { ArmedLamp, Fig, Label, LiveDot, SectionHead, TierTag, panelClass } from "@/components/board/chrome";
import { ForkDialog } from "@/components/registry/fork-dialog";
import { Ratings } from "@/components/registry/ratings";
import { cn } from "@/lib/utils";

/**
 * Whether trigger evaluation is event-driven right now, asked of the server
 * rather than assumed. Polling and per-block subscription look identical from
 * the outside, and the difference is the whole Substreams argument — so the UI
 * states which one it is and never rounds up. Null while unknown.
 */
function useStreamMode(): { mode: "substreams" | "interval"; reason: string } | null {
  const [state, setState] = useState<{ mode: "substreams" | "interval"; reason: string } | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch("/api/stream")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { mode?: "substreams" | "interval"; reason?: string } | null) => {
        if (!alive || !body?.mode) return;
        setState({ mode: body.mode, reason: body.reason ?? "" });
      })
      .catch(() => {
        // A failed probe is not a claim of either mode. Stay silent.
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/**
 * What the server will sign with, and what enforces each limit.
 *
 * WHY THIS IS A FETCH AND NOT `manifest.agency.policy.wallet`. This page used to
 * print the manifest's claimed wallet as the address to fund. For the seed apps
 * that claim was a hand-written 40-hex string — nobody holds the key, so anyone
 * who funded it destroyed the money. The manifest is a client-side document and
 * cannot be an authority on a server-held key; only the server can be. So the
 * address on screen is the one that comes back from `/api/agency/register`,
 * which provisions if needed and reports either way, and `policy.wallet` is
 * treated as a claim to be checked rather than a value to be rendered.
 *
 * Same discipline as `useStreamMode` above: null while unknown, null on failure,
 * and the caller renders nothing rather than a guess. An unreachable server is
 * not evidence about an address.
 */
interface SignerFacts {
  wallet: {
    address: string;
    kind: WalletKind;
    chainId: number;
    chainName: string;
    sessionKeyAddress: string;
    onchainEnforced: boolean;
    permissionId?: string;
  };
  enforcement: EnforcementReport;
}

function useSigner(manifest: Manifest | null): SignerFacts | null {
  const [state, setState] = useState<SignerFacts | null>(null);
  // The app currently on screen, and the app we have already asked about. The
  // manifest OBJECT changes identity every time `runApp` re-composes the body,
  // and re-registering on each recompose would be pointless work against a
  // first-write-wins route — so the request is keyed on the app's name, and the
  // response is dropped if a different app arrived while it was in flight.
  const wanted = useRef<string | null>(null);
  const asked = useRef<string | null>(null);

  useEffect(() => {
    const appId = manifest?.name ?? null;
    wanted.current = appId;
    if (!manifest || !appId || asked.current === appId) return;
    asked.current = appId;

    void fetch("/api/agency/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manifest }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: (Partial<SignerFacts> & { ok?: boolean }) | null) => {
        if (wanted.current !== appId) return;
        // A 422 (provisionWallet refusing mainnet, or an incompletely scoped
        // session) arrives as ok:false with no wallet. That is a correct
        // failure and it is NOT an address — stay silent.
        if (!body?.ok || !body.wallet || !body.enforcement) return;
        setState({ wallet: body.wallet, enforcement: body.enforcement });
      })
      .catch(() => {
        // Let the next mount try again. A dropped request is not a fact.
        if (asked.current === appId) asked.current = null;
      });
  }, [manifest]);

  return state;
}

/**
 * The 0G explorer base URL and the deployed contract addresses, asked of
 * `/api/publish`. Used only to turn a real Agentic ID into a link — an app with
 * no minted token gets no link and no href, because a token page for a token
 * that was never minted is a 404 dressed as provenance.
 */
function useZeroGExplorer(): string | null {
  const [base, setBase] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch("/api/publish")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { zeroG?: { explorer?: string | null } } | null) => {
        if (!alive || !body?.zeroG?.explorer) return;
        setBase(body.zeroG.explorer.replace(/\/+$/, ""));
      })
      .catch(() => {
        // No explorer base means the token id renders as plain text. Correct.
      });
    return () => {
      alive = false;
    };
  }, []);
  return base;
}

export function AppRuntime({ name }: { name: string }) {
  const board = useBoard();
  const app = useApp(name);
  const [forking, setForking] = useState(false);
  const stream = useStreamMode();
  const explorerBase = useZeroGExplorer();

  // Only autonomous apps hold a wallet, so only they ask. Registering a
  // read-only app would provision a signer that nothing will ever use, and a
  // page that shows no wallet has no business asking which key signs.
  const signer = useSigner(
    app && app.manifest.agency.tier === "autonomous" ? app.manifest : null,
  );

  // The two real round trips this page can start. Each keeps its own last
  // outcome, and each renders the outcome the server actually returned —
  // including the failures, which are the more informative half.
  const [running, setRunning] = useState(false);
  const [runOut, setRunOut] = useState<RunOutcome | null>(null);
  const [watching, setWatching] = useState(false);
  const [watchOut, setWatchOut] = useState<WatchOutcome | null>(null);

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
  // Substreams is what makes per-block evaluation possible, and per-block
  // evaluation is what a monitor and an autonomous app are FOR (prd.md §10).
  // Read-only apps have no triggers to evaluate, so they get no control.
  const watchable = autonomous || tier === "monitor";

  /**
   * The manifest asserted a wallet and the server named a different one. Only
   * `/api/publish` is supposed to write that field, so a mismatch means the
   * document on screen is stale or was written by hand — and it is precisely the
   * case where funding the address in the manifest loses the money. Say which is
   * which rather than silently preferring one.
   */
  const walletClaimConflict =
    signer && policy.wallet && policy.wallet.toLowerCase() !== signer.wallet.address.toLowerCase()
      ? policy.wallet
      : null;

  async function onRun() {
    setRunning(true);
    // Clear the previous receipt first: leaving the last run's row numbers on
    // screen while a new query is in flight reads as "these are current".
    setRunOut(null);
    try {
      setRunOut(await runApp(m.name));
    } finally {
      setRunning(false);
    }
  }

  async function onWatch() {
    setWatching(true);
    setWatchOut(null);
    try {
      setWatchOut(await watchBlocks(m));
    } finally {
      setWatching(false);
    }
  }

  return (
    // Bottom padding clears the docked ledger pill floating over this corner.
    //
    // `@container`, because this runtime mounts at two very different widths:
    // full-bleed on `/a/[name]`, and inside the Board's left panel — which is
    // narrower than the viewport it would otherwise be asked about. Viewport
    // breakpoints answer the wrong question there; the panels below split on
    // how much room *this* element actually has.
    <main className="@container mx-auto w-full max-w-[1400px] flex-1 px-3 pt-4 pb-24 sm:px-5 sm:pt-6">
      <div className={panelClass(tier)}>
        {autonomous ? (
          <div className="policy-strip">
            <span>policy</span>
            {/* The signer, from the server. Nothing here falls back to
                `policy.wallet` — a manifest cannot know a server-held key, and
                an address that is only a claim is worse than no address at all.
                Silent until the round trip answers. */}
            {signer ? (
              <>
                <span className="fig normal-case" title={`${signer.wallet.address} — signs on ${signer.wallet.chainName}`}>
                  {shortHash(signer.wallet.address, 8, 6)}
                </span>
                <span className="opacity-50">·</span>
                <span
                  style={{ color: signer.enforcement.verifiedOnchain ? "var(--gain)" : "var(--risk)" }}
                  title={
                    signer.enforcement.verifiedOnchain
                      ? "isSessionEnabled() returned true — the account itself rejects an out-of-scope call"
                      : "Every limit below is enforced by this server. A rejection means our server chose not to sign."
                  }
                >
                  {signer.enforcement.verifiedOnchain ? "onchain-enforced" : "server-enforced"}
                </span>
                <span className="opacity-50">·</span>
              </>
            ) : null}
            <span>cap {fmtUsd(policy.maxSpendUsd)}</span>
            <span className="opacity-50">·</span>
            <span>per tx {fmtUsd(policy.maxPerTxUsd)}</span>
            <span className="opacity-50">·</span>
            <span>{policy.allowlist.length} allowlisted</span>
            <span className="opacity-50">·</span>
            <span>expires {policy.expiresAt ? fmtDate(policy.expiresAt) : "never"}</span>
            <span className="ml-auto flex items-center gap-2">
              {/* Through `isArmed`, not `!policy.halted`. Those diverge: a fork
                  arrives with `running: false`, so the strip read "armed" on an app
                  that was not, while the header lamp a few lines down correctly
                  showed nothing. One file cannot answer the same question two ways. */}
              {policy.halted ? (
                <span style={{ color: "var(--loss)" }}>halted</span>
              ) : isArmed(app) ? (
                <span style={{ color: "var(--gain)" }}>armed</span>
              ) : (
                <span style={{ color: "var(--muted-ink)" }}>not armed</span>
              )}
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
              {/* ARMED, not live. This was a pulsing `.live-dot` keyed on
                  `app.running`, which read as "subscribed right now" — and
                  nothing was ever subscribed, because `POST /api/stream` had no
                  caller in the product until `watchBlocks`. Armed is the
                  checkable claim: published, not halted, would act if a trigger
                  fired. §6 Rule 2 forces the split — `--live` means live.
                  The one exception is directly below: while a bounded watch run
                  is actually in flight, `--live` is earned. */}
              {watching ? (
                <LiveDot label="streaming" />
              ) : isArmed(app) ? (
                <ArmedLamp label="armed" labelClassName="text-[0.6875rem]" />
              ) : null}
            </div>
            {/* There used to be a `?? `${m.name}.atlas-apps.eth`` here, and it
                was the most quietly wrong line on the page: only five subnames
                exist under `atlas-apps.eth` on Sepolia and none of them belongs
                to a seed app. Since §8 makes the name the thing you check
                BEFORE funding a wallet, a name that does not resolve is worse
                than no name. An app with no subname is unpublished, and reads
                as unpublished. */}
            {m.identity.ens ? (
              <p className="mono mt-1.5 text-[0.6875rem]">{m.identity.ens}</p>
            ) : (
              <p className="mono mt-1.5 text-[0.6875rem] text-[var(--muted-ink)]">
                unpublished — no ENS subname issued
              </p>
            )}
            <p className="mt-2 max-w-[70ch] text-xs leading-snug text-[var(--muted-ink)]">{m.intent}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <TierTag tier={tier} />
            <button
              type="button"
              className="btn press px-2.5 py-1 text-xs"
              disabled={running}
              onClick={() => void onRun()}
              title="Re-query The Graph and re-compose this interface from what comes back"
            >
              {running ? "Running…" : "Run"}
            </button>
            {watchable ? (
              <button
                type="button"
                className="btn press px-2.5 py-1 text-xs"
                disabled={watching}
                onClick={() => void onWatch()}
                title="Consume three blocks and evaluate this app's triggers on each. Bounded — it returns, it does not stay subscribed."
              >
                {watching ? "Watching…" : "Watch 3 blocks"}
              </button>
            ) : null}
            <button type="button" className="btn press px-2.5 py-1 text-xs" onClick={() => setForking(true)}>
              Fork
            </button>
          </div>
        </header>

        {/* Receipts for the two round trips. They sit above the generated body
            because a run REPLACES that body — the reader needs to know whether
            what they are looking at came from the gateway or from fixtures
            before they read a number out of it. */}
        {runOut || running || watchOut || watching ? (
          <div className="space-y-1 border-b border-hairline px-3 py-2 sm:px-4">
            {running ? <Receipt tone="wait" text="querying deployments and re-composing…" /> : null}
            {!running && runOut ? <Receipt {...runReceipt(runOut)} /> : null}
            {watching ? (
              <Receipt tone="wait" text="subscribed — consuming 3 blocks, then returning…" />
            ) : null}
            {!watching && watchOut ? <Receipt {...watchReceipt(watchOut)} /> : null}
          </div>
        ) : null}

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

      {/* The 380px rail only earns its keep when the main column still has room
          to breathe beside it. Container-relative, so the Board's panel stacks
          and the full-page route splits — the same rule, asked of the real
          width instead of the window's. */}
      <div className="mt-4 grid grid-cols-1 gap-4 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="min-w-0 space-y-4">
          {/* PUBLISH — the step that was unreachable from here.
              `publishApp` mints a new board entry and its only caller was the
              Studio's bar, which hangs off a freshly described draft. So a fork
              could be created, refined and run, and never named: no ENS subname,
              no manifest CID, no Agentic ID, ever. prd.md §12 calls fork-and-remix
              the flywheel and states the loop as "fork → refine → publish under
              your own name", and §8 makes the name the thing a human verifies
              BEFORE funding a mini app — so the missing leg was the safety story's
              last step, not a convenience.

              It sits above the data plan deliberately. The header directly above
              says "unpublished — no ENS subname issued"; the control that changes
              that belongs next to the claim, not in a rail below the fold. It
              renders in every state, disabled with the reason when it cannot
              apply, because "why can I not publish this?" is a question worth
              answering in words. */}
          <AppPublishPanel app={app} />

          <section className="panel p-3">
            {/* Health is a reading with a timestamp, not a property. These
                counts came from the last fan-out, which may be days old — a
                subgraph that died this morning still shows live until Run
                re-probes it. Dating the count is the difference between a
                measurement and a claim. */}
            <SectionHead
              title="Data plan"
              note={`${app.stats.sourcesHealthy} of ${app.stats.sourcesQueried} deployments live · probed ${fmtDate(app.lastRunAt)}`}
            />
            <dl className="cells mt-2">
              <KV k="Schemas" v={m.data.schemas.join(" · ")} />
              <KV k="Networks" v={m.data.networks.join(" · ")} />
              {/* The manifest DECLARES a transport; it does not prove one was
                  used. `X402_PRIVATE_KEY` is unset in this build (prd.md §14 row
                  6 — x402 is coded and unexercised), and the measured cost of a
                  run comes back at the gateway's blended plan rate rather than
                  x402's $0.01 a query, which is how you can tell. So this row
                  says "declared" and stops there. It used to read "the app's own
                  wallet pays per query", which describes a payment that has never
                  happened. */}
              <KV
                k="Transport"
                v={
                  m.data.transport === "x402"
                    ? "x402 declared — no x402 key in this build, so queries went over the gateway plan"
                    : m.data.transport
                }
                accent={m.data.transport === "x402" ? "risk" : undefined}
              />
              <KV
                k="Stream"
                v={m.data.stream ? `${m.data.stream.package} · ${m.data.stream.module}` : "none — evaluated on open"}
              />
              {/* Latency is the point of Substreams, so name the mechanism, not
                  the aspiration — and not in the present tense either.
                  `GET /api/stream` reporting `substreams` means a token is
                  configured and per-block evaluation is POSSIBLE. It does not
                  mean anything is subscribed: the only thing that opens a
                  subscription is the bounded Watch above, and it closes again
                  when it returns. Hence `--gain` (configured, same idiom as the
                  armed lamp) rather than `--live`, which §6 Rule 2 now reserves
                  for a run that is actually open. */}
              <KV
                k="Evaluated"
                v={
                  stream === null
                    ? "checking…"
                    : stream.mode === "substreams"
                      ? "per block while a watch is open — token configured, nothing subscribed between runs"
                      : "on an interval — no Substreams token, so polling"
                }
                accent={stream?.mode === "substreams" ? "gain" : stream ? "risk" : undefined}
              />
              {/* Attributed, not settled. `costOf()` in `lib/kit/gateway.ts`
                  assigns a blended $0.0001 per gateway query because gateway
                  usage is billed out of a plan, not per call — so this is what a
                  run cost by attribution, and no invoice anywhere carries it. */}
              <KV k="Cost per run" v={`$${app.stats.costPerRunUsd.toFixed(4)} attributed`} />
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
                {/* The signer, or nothing. `policy.wallet` is not a fallback
                    here and must never become one: it is a client-side claim
                    about a server-held key, and the address a reader funds has
                    to be the address that signs. */}
                {signer ? (
                  <KV k="Signer" v={signer.wallet.address} mono />
                ) : (
                  <KV k="Signer" v="asking the server…" />
                )}
                {signer ? (
                  <KV k="Signs on" v={`${signer.wallet.chainName} · ${signer.wallet.kind}`} />
                ) : null}
                <KV k="Lifetime cap" v={fmtUsd(policy.maxSpendUsd)} />
                <KV k="Per transaction" v={fmtUsd(policy.maxPerTxUsd)} />
                {/* Real, and the only figure in this panel that is a
                    measurement: `dispatchAction` folds the server's own
                    `totalSpentUsd(appId)` — the same number the lifetime cap is
                    metered against — into `stats.spentUsd`. */}
                <KV k="Spent" v={fmtUsd(app.stats.spentUsd)} accent={app.stats.spentUsd > 0 ? "spend" : undefined} />
                <KV k="Expires" v={policy.expiresAt ? fmtDate(policy.expiresAt) : "never"} />
                <KV k="Requires confirm" v={policy.requireConfirm ? "yes" : "no — trigger signs directly"} />
              </dl>

              {/* ONE KEY SIGNS FOR EVERY APP. `AGENT_SESSION_PRIVATE_KEY` is
                  process-wide, so this address is the same one every other
                  autonomous mini app on this server signs with — verified by
                  registering two and comparing. prd.md §4 P3 and §7 both say
                  "each mini app gets its own wallet", and §8's case for the ENS
                  name as a safety primitive depends on that isolation. It is the
                  design, not what runs, and a per-app page is exactly where a
                  reader would otherwise assume otherwise. */}
              {signer ? (
                <p className="mt-2 text-[0.6875rem] leading-snug" style={{ color: "var(--risk)" }}>
                  This key is shared. One process-wide session key signs for every mini app here, so
                  funding this address funds all of them and revoking it revokes all of them. Per-app
                  wallet isolation is specified (prd.md §4 P3, §7) and is not built.
                </p>
              ) : null}

              {walletClaimConflict ? (
                <p className="mono mt-2 text-[0.625rem] leading-snug" style={{ color: "var(--loss)" }}>
                  This manifest claims {shortHash(walletClaimConflict, 10, 6)} as its wallet. The
                  server signs with the address above. Fund the address above.
                </p>
              ) : null}

              {/* PROBLEM 2's home. prd.md §7 is explicit that enforcement is not
                  uniform and that the UI reports it per constraint — and that
                  `onchainEnforced` is the return value of an `isSessionEnabled()`
                  call against the live validator, not a constant, precisely so
                  this cannot overstate by accident. It was being computed on
                  every `/api/act` and thrown away. */}
              {signer ? (
                <div className="mt-3 border-t border-[var(--hairline)] pt-2">
                  <Label>
                    Enforced by — chain or this server
                    {signer.enforcement.verifiedOnchain
                      ? " · verified by isSessionEnabled()"
                      : " · nothing verified onchain"}
                  </Label>
                  <dl className="cells mt-1.5">
                    <EnforcementRow k="Allowlist" site={signer.enforcement.allowlist} />
                    <EnforcementRow k="Expiry" site={signer.enforcement.expiry} />
                    <EnforcementRow k="Per-tx cap" site={signer.enforcement.perTxCap} />
                    <EnforcementRow k="Lifetime cap" site={signer.enforcement.lifetimeCap} />
                    <EnforcementRow k="Requires confirm" site={signer.enforcement.confirmation} />
                    <EnforcementRow k="Kill switch" site={signer.enforcement.killSwitch} />
                  </dl>
                  {/* The server's own words, not a paraphrase. These notes are
                      where the mode's real limits live — including "a compromised
                      backend could exceed these limits", which is the sentence a
                      judge should hear from the product rather than from us. */}
                  <ul className="mt-2 space-y-1">
                    {signer.enforcement.notes.map((note, i) => (
                      <li key={i} className="text-[0.6875rem] leading-snug text-[var(--muted-ink)]">
                        {note}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
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
                {/* A trigger whose condition the evaluator cannot parse fails
                    closed — correct, and silently inert. `draftFromIntent` emits
                    prose like "threshold breached" when it cannot derive a real
                    comparison from a sentence, so a drafted autonomous app listed a
                    trigger here that could never fire, and a listed trigger reads
                    as armed. `isConditionEvaluable` is the same grammar the
                    evaluator uses (`lib/agency/condition.ts`), not a second copy,
                    so this line cannot disagree with what happens on a block. */}
                <ul className="mono mt-1 space-y-0.5 text-[0.6875rem]">
                  {m.agency.triggers.map((t, i) => {
                    const inert = !isConditionEvaluable(t.when);
                    return (
                      <li key={i}>
                        on {t.on}
                        {t.when ? ` when ${t.when}` : ""} → {t.run}
                        {inert ? (
                          <span className="block" style={{ color: "var(--risk)" }}>
                            condition is not machine-readable — this trigger fails closed and
                            cannot fire until it is rewritten as a comparison
                          </span>
                        ) : t.when === null || t.when.trim() === "" ? (
                          <span className="block text-[var(--muted-ink)]">
                            no condition — fires on every signal
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
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
              {/* `manifestCid` and `agenticId` are null on every bundled app,
                  and null is what reaches these strings — "not pinned" and "not
                  minted" are the truth for an app that was never published
                  through `/api/publish`. Nothing here manufactures a CID or a
                  token id to fill the row. */}
              <KV k="Manifest" v={m.identity.manifestCid ?? "not pinned"} mono />
              {/* A minted token gets a link to the 0G explorer, so the claim is
                  checkable without trusting this page. The base URL and the
                  contract both come from `/api/publish` and the manifest — never
                  hardcoded — and no link is rendered without both, because a
                  token page for a token that was never minted is a 404 dressed
                  up as provenance. */}
              <KV
                k="Agentic ID"
                v={
                  m.identity.agenticId
                    ? `#${m.identity.agenticId.tokenId} on 0G Chain`
                    : "not minted"
                }
                href={
                  m.identity.agenticId && explorerBase
                    ? `${explorerBase}/token/${m.identity.agenticId.contract}?a=${m.identity.agenticId.tokenId}`
                    : null
                }
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
        </aside>
      </div>

      {forking ? <ForkDialog app={app} onClose={() => setForking(false)} /> : null}
    </main>
  );
}

function KV({
  k,
  v,
  mono,
  accent,
  href,
}: {
  k: string;
  v: string;
  mono?: boolean;
  accent?: "live" | "gain" | "loss" | "risk" | "spend";
  /** Only pass this when the destination is known to exist. */
  href?: string | null;
}) {
  const fig = (
    <Fig className={cn("text-[0.6875rem]", mono && "block truncate")} accent={accent}>
      {v}
    </Fig>
  );
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-[var(--hairline)] py-1.5 first:border-t-0">
      <dt className="mono shrink-0 text-[0.625rem] uppercase tracking-[0.08em] text-[var(--muted-ink)]">{k}</dt>
      <dd className="min-w-0 text-right">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="underline decoration-dotted">
            {fig}
          </a>
        ) : (
          fig
        )}
      </dd>
    </div>
  );
}

/**
 * One constraint, and who enforces it. `onchain` is the strong claim and gets
 * the strong colour; `server` is coloured as a risk because it IS one — prd.md
 * §7: with server-side enforcement, "the policy stopped it" means our server
 * chose not to sign, and a compromised backend is unbounded. Rounding the two
 * to the same neutral grey is exactly the blurring §7 forbids.
 */
function EnforcementRow({ k, site }: { k: string; site: EnforcementSite }) {
  const onchain = site === "onchain";
  return (
    <KV
      k={k}
      v={onchain ? "chain — enforced by the account" : "server — this process decides"}
      accent={onchain ? "gain" : "risk"}
    />
  );
}

/** A one-line result of a round trip that actually happened. */
function Receipt({ tone, text }: { tone: "live" | "risk" | "loss" | "wait"; text: string }) {
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
function runReceipt(out: RunOutcome): { tone: "live" | "risk" | "loss"; text: string } {
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
function watchReceipt(out: WatchOutcome): { tone: "live" | "risk" | "loss"; text: string } {
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
