"use client";

/**
 * One running mini app, full width.
 *
 * The generated body sits in the middle. Around it is the structure the
 * product argues for showing rather than hiding: which schemas resolved,
 * which deployments are live, what the policy allows, what it has done.
 *
 * For the autonomous tier the policy strip, the kill switch and the trade log
 * are always present — the HOST enforces that now, by rendering them itself
 * in its own chrome and declaring so to the renderer via `providedByHost`, not
 * the renderer enforcing it on the composer's behalf.
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
 *   - Render a declared schema family as though it were a resolved source.
 *     `data.schemas` is the request, `data.sources` is the answer, and two of the
 *     families the seeds declare have no deployment anywhere (§13). The Data plan
 *     marks them in place, using the registry's rule rather than a second copy.
 *   - Drop a disagreement the server reported. `/api/agency/register` answers
 *     with `divergence` — the fields where this page's manifest and the running
 *     one differ — and that response was being parsed and discarded, which is how
 *     a stale Substreams package stayed on screen while the server streamed a
 *     different, deleted one.
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
import { SEED_EPOCH } from "@/lib/seed";
import { HOST_PROVIDED, seamLine, type TabKey } from "@/lib/app-view";
import { seedToA2ui } from "@/lib/kit/seed-to-a2ui";
import {
  dispatchAction,
  haltRemote,
  isArmed,
  isRunStale,
  runApp,
  watchBlocks,
  useApp,
  useBoard,
  type RunOutcome,
  type WatchOutcome,
} from "@/lib/store";
import { AppBody } from "@/components/board/app-body";
import { AppPublishPanel } from "@/components/board/publish-panel";
import { AppPolicyStrip } from "@/components/board/app-policy-strip";
import { TradeLog } from "@/components/board/ledger";
import { ArmedLamp, LiveDot, TierTag, panelClass } from "@/components/board/chrome";
import { SponsorMark } from "@/components/brand/sponsor-mark";
import { useSigner, useStreamMode, useZeroGExplorer } from "@/components/board/app-facts";
import { Receipt, runReceipt, watchReceipt } from "@/components/board/app-receipts";
import { ForkDialog } from "@/components/registry/fork-dialog";
import { Ratings } from "@/components/registry/ratings";
import { DataPlanPanel } from "@/components/board/panels/data-plan";
import { PermissionsPanel } from "@/components/board/panels/permissions";
import { ProvenancePanel } from "@/components/board/panels/provenance";
import { UsagePanel } from "@/components/board/panels/usage";
import { RailSections, TabbedSections, type AppSections } from "@/components/board/app-sections";
// One rule for "this family has nothing live behind it", shared with the
// registry's schema select — the control prd.md §14 #7 cites — rather than
// re-derived here. A second copy of that test would drift, and the direction it
// drifts is always towards claiming more. See `lib/schema-coverage.ts`.
import { familiesWithNoLiveSource } from "@/lib/schema-coverage";

/** One sentence, three renderings — a header line, a button, a page paragraph. */
const UNPUBLISHED = "unpublished — no ENS subname issued";

/** A finished round trip and the app it was made for. */
interface RunState {
  app: string;
  out: RunOutcome;
}

interface WatchState {
  app: string;
  out: WatchOutcome | null;
}

export function AppRuntime({
  name,
  variant = "page",
}: {
  name: string;
  /**
   * `page` keeps the 380px rail — the width it was measured for. `drawer` puts
   * the sections behind tabs, because at panel width the rail collapses to one
   * column and the composed body becomes 1 of 9 stacked panels.
   */
  variant?: "drawer" | "page";
}) {
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
  //
  // Both carry the app they belong to, because this component is not remounted
  // per app: the drawer keeps one instance and changes `name` under it as the
  // wheel turns. Without the owner, flicking away from a run in flight lands the
  // previous app's row counts and its "live" verdict on the next app's header —
  // a measurement of one thing captioned as a measurement of another, which is
  // the failure this whole surface exists to prevent.
  const [run, setRun] = useState<RunState | null>(null);
  const [watch, setWatch] = useState<WatchState | null>(null);
  // "A query is in flight" is the store's fact, not this component's — see
  // `BoardState.runningApps`. Watch stays local because `watchBlocks` has one
  // caller and no dedupe to be the owner of.
  // `undefined` when nothing is in flight for this app, otherwise what started
  // it — see `BoardState.runningApps` for why the trigger is carried.
  const runTrigger = board.runningApps[name];
  const running = runTrigger !== undefined;
  const runOut = run?.app === name && !running ? run.out : null;
  const watching = watch !== null && watch.app === name && watch.out === null;
  const watchOut = watch?.app === name ? watch.out : null;

  // This app's slice of the board ledger, feeding trade_log inside the
  // generated body as well as the panel below it. Memoised so its identity is
  // stable — the A2UI renderer reseeds its data model when the document's
  // identity changes, which would otherwise reset a half-typed amount.
  const journal = useMemo(
    () => board.ledger.filter((l) => l.app === name),
    [board.ledger, name],
  );

  // Which declared schema families have nothing healthy behind them, asked of the
  // whole loaded set exactly as the registry's schema select asks it. The Data
  // plan panel below marks them; see the import note for why the rule is not
  // re-derived here.
  const noLiveSource = useMemo(() => familiesWithNoLiveSource(board.apps), [board.apps]);

  /**
   * Opening an app whose numbers have gone stale re-queries it.
   *
   * THE HOLE THIS FILLS. `runApp` has done the honest thing since it was written
   * — rebuild the plan from the manifest, fan out, re-health-check, re-compose,
   * write back only what came back — and it had exactly one caller: the Run
   * button. So the liveness was a capability the product HAD rather than one it
   * SHOWED. Every bundled app opened onto `seed-live.generated.json`, measured at
   * build time; every published app opened onto whatever its creating fan-out
   * returned, however long ago that was. Both rendered with the same confidence
   * as a query that had just landed, and the only thing separating them from one
   * was a press nobody had a reason to make. A seed snapshot is scaffolding for
   * the cold render — it is not the product flow, and it must not be what a
   * reader is still looking at a minute later.
   *
   * WHY ONLY THIS APP. `AppRuntime` mounts for one app at a time — full-bleed on
   * `/a/[name]`, one card in the drawer — so putting the refresh here means the
   * board costs one fan-out per app a reader actually opens rather than sixteen
   * on load. The deck's card faces still show snapshot figures until opened;
   * `stats.sourcesHealthy` on a face is a summary, and re-measuring sixteen apps
   * to redraw sixteen summaries nobody has looked at yet is a real cost paid for
   * an imagined reading.
   *
   * WHY A REF RATHER THAN THE FRESHNESS TEST ALONE. A run that FAILS does not
   * move `lastRunAt` — deliberately, so a failure cannot leave the previous run's
   * numbers looking fresh. That makes the app permanently stale, and an effect
   * that keyed only on staleness would re-fire on every subsequent render for as
   * long as the gateway stayed down. One attempt per app per mount; the Run
   * button is how you ask for another.
   *
   * Nothing is set here synchronously. The spinner comes from the store's
   * `runningApps`, which `runApp` writes as it starts, so this effect only has to
   * start the request and record the outcome when it lands.
   */
  const refreshedFor = useRef(new Set<string>());
  useEffect(() => {
    /**
     * Nothing may be judged until localStorage has been read, and `app` being
     * present is not that signal — this is the one guard the first version got
     * wrong, and it re-queried every seed app on every reload.
     *
     * `useApp` answers out of `SEED_STATE` before hydration, so a bundled app is
     * already there on the first commit carrying `seed-live.generated.json`'s
     * build-time `lastRunAt` — permanently stale. The run this browser performed
     * a moment ago is sitting in localStorage unread. So the effect measured a
     * value it was about to replace, and "at most one fan-out per app per mount"
     * turned into one per page load, forever. `hydrated` is the only fact that
     * means "the stamp you are about to read is this browser's, not the
     * bundle's".
     *
     * `refreshedFor` is deliberately NOT marked on this branch: returning here
     * is "ask me again in a moment", not "asked and answered".
     */
    if (!board.hydrated || !app) return;
    if (refreshedFor.current.has(name)) return;
    refreshedFor.current.add(name);
    if (!isRunStale(app)) return;

    void runApp(name, "open")
      // `runApp` reports failure by returning `ok: false`, so a rejection here is
      // a fault it does not know about and there is no receipt to write for it.
      // The ledger already carries whatever the store did record.
      .catch(() => null)
      .then((out) => {
        // NO CANCELLATION FLAG, and that is not an oversight. The obvious
        // `let current = true` / cleanup pair silently swallows every receipt
        // this effect produces: `app` is in the dependency list, `runAppOnce`
        // writes the re-composed manifest into the store BEFORE it returns, so
        // `app` changes identity and the cleanup runs while the promise is still
        // settling. The flag is false by the time the outcome arrives, every
        // time. The run happened, the body updated, and the line saying what was
        // measured never appeared.
        //
        // Nothing needs guarding anyway: `run` carries its own app and the
        // derived value above refuses to show one app's outcome under another's
        // name, so a late arrival can only land where it belongs. Setting state
        // on an unmounted component is a no-op in React 18.
        if (out) setRun({ app: name, out });
      });
  }, [app, name, board.hydrated]);

  const [activeTab, setActiveTab] = useState<TabKey>("app");
  // Reset when the wheel flicks to a different app. Adjusting state during
  // render is the sanctioned pattern and avoids a frame of the previous app's
  // Safety tab showing under this app's name.
  const [tabbedApp, setTabbedApp] = useState(name);
  if (name !== tabbedApp) {
    setTabbedApp(name);
    setActiveTab("app");
  }

  // Autonomous seed apps carry a fixture body (display only). Compose it into a
  // real A2UI document so the renderer draws the full action surface — the same
  // path a live-composed app takes. Other tiers keep the fixture body.
  const bodyDoc = useMemo(() => {
    const mm = app?.manifest;
    if (!mm) return null;
    return mm.agency.tier === "autonomous" ? seedToA2ui(mm, { journal, epoch: SEED_EPOCH }) : mm.ui;
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

  async function onRun() {
    // Clear the previous receipt as the new query starts: leaving the last run's
    // row numbers on screen while a fresh one is in flight reads as "these are
    // current". `runningApps` covers the in-flight state from here.
    setRun(null);
    // `runApp` reports failure by returning, not by throwing — every failure mode
    // it knows about comes back as `ok: false` with the server's reason, and that
    // is what the receipt renders. A rejection is a fault it does not know about,
    // and there is no honest receipt to write for one.
    const out = await runApp(m.name).catch(() => null);
    if (out) setRun({ app: m.name, out });
  }

  async function onWatch() {
    setWatch({ app: m.name, out: null });
    const out = await watchBlocks(m).catch(() => null);
    setWatch(out ? { app: m.name, out } : null);
  }

  const onBodyAction = (action: unknown) => {
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
  };

  const sections: AppSections = {
    app: (
      <AppBody
        doc={bodyDoc ?? m.ui}
        animate
        providedByHost={autonomous ? HOST_PROVIDED : []}
        policy={policy}
        spentUsd={app.stats.spentUsd}
        journal={journal}
        onAction={onBodyAction}
      />
    ),
    /* PUBLISH — the step that was unreachable from here.
       `publishApp` mints a new board entry and its only caller was the
       Studio's bar, which hangs off a freshly described draft. So a fork
       could be created, refined and run, and never named: no ENS subname,
       no manifest CID, no Agentic ID, ever. prd.md §12 calls fork-and-remix
       the flywheel and states the loop as "fork → refine → publish under
       your own name", and §8 makes the name the thing a human verifies
       BEFORE funding a mini app — so the missing leg was the safety story's
       last step, not a convenience.

       In the drawer it lives in the About tab. The header directly above
       says "unpublished — no ENS subname issued"; the control that changes
       that belongs next to the claim, not in a rail below the fold. It
       renders in every state, disabled with the reason when it cannot
       apply, because "why can I not publish this?" is a question worth
       answering in words. */
    publish: <AppPublishPanel app={app} />,
    dataPlan: <DataPlanPanel app={app} signer={signer} stream={stream} noLiveSource={noLiveSource} />,
    permissions: autonomous ? <PermissionsPanel app={app} signer={signer} /> : null,
    ratings: <Ratings appName={m.name} />,
    tradeLog: watchable ? <TradeLog appName={m.name} /> : null,
    provenance: <ProvenancePanel m={m} explorerBase={explorerBase} />,
    usage: <UsagePanel app={app} />,
  };

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
        {autonomous ? <AppPolicyStrip app={app} signer={signer} /> : null}

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
              <p className="mono mt-1.5 flex items-center gap-1.5 text-[0.6875rem]">
                <SponsorMark of="ens" size={13} />
                {m.identity.ens}
              </p>
            ) : variant === "drawer" ? (
              /* The claim is also the way to fix it. Publish used to sit
                 directly under this line; behind a tab it would be further from
                 the sentence it answers than it was before, and the comment on
                 AppPublishPanel is explicit that "why can I not publish this?"
                 deserves an answer next to the claim. So the claim carries the
                 reader there. */
              <button
                type="button"
                onClick={() => setActiveTab("about")}
                className="mono mt-1.5 block text-left text-[0.6875rem] text-[var(--muted-ink)] underline decoration-dotted"
              >
                {UNPUBLISHED}
              </button>
            ) : (
              <p className="mono mt-1.5 text-[0.6875rem] text-[var(--muted-ink)]">
                {UNPUBLISHED}
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
            {running ? (
              <Receipt
                tone="wait"
                text={
                  runTrigger === "open"
                    ? "last measured too long ago — re-querying deployments and re-composing…"
                    : "querying deployments and re-composing…"
                }
              />
            ) : null}
            {!running && runOut ? <Receipt {...runReceipt(runOut)} /> : null}
            {watching ? (
              <Receipt tone="wait" text="subscribed — consuming 3 blocks, then returning…" />
            ) : null}
            {!watching && watchOut ? <Receipt {...watchReceipt(watchOut)} /> : null}
          </div>
        ) : null}

        {/* On the page the composed body stays inside the tier panel, exactly
            where it was. In the drawer it belongs to the App tab instead. */}
        {variant === "page" ? <div className="p-3 sm:p-4">{sections.app}</div> : null}
      </div>

      {variant === "page" ? <RailSections sections={sections} /> : null}

      {variant === "drawer" ? (
        <TabbedSections
          sections={sections}
          tier={tier}
          seam={seamLine({
            rows: runOut?.ok ? runOut.rows : null,
            sourcesHealthy: app.stats.sourcesHealthy,
            sourcesQueried: app.stats.sourcesQueried,
            live: runOut?.ok ? runOut.live : null,
          })}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      ) : null}

      {forking ? <ForkDialog app={app} onClose={() => setForking(false)} /> : null}
    </main>
  );
}

