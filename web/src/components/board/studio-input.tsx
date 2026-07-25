"use client";

/**
 * The Studio. One box, then the plan resolving in the open.
 *
 * The assemble sequence is the product's most distinctive second and the whole
 * animation budget: steps land one at a time, the interface snaps into place,
 * then you configure what it may spend, name it and publish. Legible, not a
 * spinner (prd.md §4 P1, §6 "Motion").
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE IS RESPONSIBLE FOR, AND WHY IT USED TO LIE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 1. THE FIXTURE FALLBACK IS NOW LABELLED. `draftApp` falls back to a fully
 *    offline draft on any failure, and that fallback is worth keeping — a demo
 *    that dies because one subgraph timed out is worse than one that renders
 *    fixtures. But it invents the figures in the interface (`draftFromIntent`
 *    in `lib/seed.ts` holds them as constants) and marks every source
 *    unprobed, and until `StudioDraft.live` / `StudioDraft.degraded` existed
 *    nothing on screen distinguished that from a measured run.
 *    `kit/gateway.ts` states the rule this file now obeys: a demo that can't
 *    tell you whether it is live is worse than one that is not.
 *
 *    Two causes are NOT the same thing and are not coloured the same:
 *      - the planner ran its deterministic rules engine because no inference
 *        backend is configured. Nothing is fabricated; the schemas were chosen
 *        by rules instead of by a model, and the data is still real. Stated in
 *        ink, no accent.
 *      - the fan-out answered from fixtures, or a leg of the round trip failed
 *        and this is the offline draft. Now numbers on screen were not
 *        measured. `--risk` (prd §6 rule 2: "degraded, stale"), stated at the
 *        top of the plan where it cannot be missed.
 *
 * 2. THE PUBLISH WARNINGS AND IDENTITY STATUS ARE RENDERED. `identityStatus()`
 *    in `lib/identity/publish.ts` has carried the comment "Rendered in the
 *    Studio's publish panel" since it was written, and nothing rendered it —
 *    so a publish onto a mock ENS backend looked identical to a publish onto a
 *    real one, and the README's "nothing silently pretends: the publish report
 *    returns a warnings[] naming every path still mocked" was a claim about a
 *    field nothing read. Both halves are here now: what pressing the button
 *    will do, read from `GET /api/publish` BEFORE the press, and `warnings[]`
 *    verbatim after it.
 *
 *    Both now live in `publish-panel.tsx` rather than in this file, because
 *    `/a/[name]` grew a publish panel of its own and the two must not be able to
 *    describe the same deployment differently. This file is a client of them; it
 *    is no longer their owner.
 *
 * 3. CAPABILITIES ARE CONFIGURABLE. prd §4 P1 requires "wallet, spend cap,
 *    triggers, x402 price — all in-app, no config files". Only the price was.
 *    The caps were literals in `draftFromIntent` and the copy under the button
 *    restated those literals ("$500 lifetime, $50 per-transaction") whatever
 *    the manifest said. The controls below write into the manifest that goes to
 *    `publishApp`, and every number in the copy is read back out of it.
 *
 * 4. NO INVENTED DURATIONS. See `REVEAL_MS`.
 *
 * WHAT THIS FILE DOES NOT DO. It never writes a policy the server will not see
 * (`/api/agency/register` seeds the server-side registry from the published
 * manifest, and `/api/act` refuses a policy from the caller). It never renders
 * a wallet address: `provisionWallet` on the server owns that, and the draft's
 * `policy.wallet` is a zero-address placeholder. And it does not claim where a
 * cap is enforced — §7's table is per-constraint and per-signer-mode, the
 * running app's own strip reports it, and an unpublished draft has no signer.
 */
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import type { Manifest, Policy } from "@/lib/contracts/manifest";
import type { PlanStep } from "@/lib/seed";
import { TIER_BLURB, TIER_LABEL } from "@/lib/seed";
import {
  draftApp,
  publishApp,
  useIdentityStatus,
  type PublishOutcome,
  type StudioDraft,
} from "@/lib/store";
import { AppBody, isUiDoc } from "@/components/board/app-body";
import { Fig, Label, TierTag, panelClass } from "@/components/board/chrome";
// The forecast, the receipt and the price field are shared with `/a/[name]`'s
// publish panel and live in one module — see that file's header. The Studio owned
// them until there was a second publish surface; copying them is how a forecast
// ends up claiming "every path live" on one screen while the other lists a mocked
// backend, and this codebase has already paid once for a duplicated component
// (two `LiveDot` definitions, one of which drifted).
import {
  PriceField,
  PublishForecast,
  PublishReceipt,
  Row,
} from "@/components/board/publish-panel";
import { cn } from "@/lib/utils";

/**
 * Example intents, each one checked against this server before it went in the
 * list. The first is prd §16's verbatim demo line, so the demo is a thing you
 * can press rather than a thing you have to remember.
 *
 * What is NOT here any more: an intent naming a truncated address
 * (`0x7f3a…9c41`) that no resolver can accept, and a per-account Aave position.
 * The standardized fan-out reads protocol-level scalars — README "Not in
 * scope" and `lib/agency/enrich.ts` — so a *plan* mentioning a health factor
 * resolves fine (it picks the lending family) while a *condition* on one
 * evaluates to false. The caveat under the list says so rather than letting the
 * examples imply otherwise.
 */
const EXAMPLES = [
  "Watch my lending positions and DEX exposure across Arbitrum, Optimism and Base. Rebalance if health factor drops under 1.4.",
  "Top DEXs by volume on Arbitrum this week",
  "Tell me when any single swap over $250k happens on Arbitrum",
  "Compare lending TVL on Arbitrum, Optimism and Base",
];

/** prd §4 P1's own refinement examples, used verbatim. */
const REFINEMENTS = ["add a 7-day chart", "only alert me above $10k", "use Optimism too"];

/**
 * ONE CADENCE FOR EVERY STEP, AND WHY IT IS A CONSTANT.
 *
 * The real round trip finishes during `resolving`. What follows is a replay, and
 * it used to replay on per-step delays authored in `lib/seed.ts` and in the
 * store's live path — 420/620/700/780 and 240/380/520/460/400, scaled by 0.6.
 * Nobody measured those. A step held "running" for 780ms and its neighbour for
 * 380ms is a per-step timing claim made in animation instead of in text, which
 * is the same class of fabrication as a made-up subgraph id, only harder to
 * catch.
 *
 * The choreography stays — prd §6 "Motion" is explicit that components snapping
 * in one at a time is where the animation budget goes, and it is the beat the
 * demo script leans on. What changes is that the cadence is uniform and
 * declared, so the reveal reads as a reveal. `PlanStep.ms` is deliberately
 * ignored; the only durations on screen are ones something measured — the
 * fan-out's own `elapsedMs`, which the store puts in the step's detail text,
 * and the wall clock this component keeps across the round trip.
 */
const REVEAL_MS = 240;

/** `resolving` covers the real round trip: plan → fan-out → compose. */
type Phase = "idle" | "resolving" | "planning" | "ready";

interface State {
  phase: Phase;
  intent: string;
  draft: StudioDraft | null;
  landed: number;
  /**
   * Wall clock from submit to the draft landing, measured in this browser.
   * Includes the network, so it is larger than the server's own numbers — the
   * label says which clock it came off.
   */
  roundTripMs: number | null;
  /** Bumped per submit so a refine remounts the publish panel's own state. */
  attempt: number;
}

type Action =
  | { type: "submit"; intent: string }
  | { type: "start"; draft: StudioDraft; roundTripMs: number }
  | { type: "land" }
  | { type: "finish" }
  | { type: "reset" };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "submit":
      return {
        ...s,
        phase: "resolving",
        intent: a.intent,
        draft: null,
        landed: 0,
        roundTripMs: null,
        attempt: s.attempt + 1,
      };
    case "start":
      return { ...s, phase: "planning", draft: a.draft, landed: 0, roundTripMs: a.roundTripMs };
    case "land":
      return { ...s, landed: s.landed + 1 };
    case "finish":
      return { ...s, phase: "ready", landed: s.draft?.steps.length ?? 0 };
    case "reset":
      return { phase: "idle", intent: "", draft: null, landed: 0, roundTripMs: null, attempt: s.attempt };
  }
}

const INITIAL: State = { phase: "idle", intent: "", draft: null, landed: 0, roundTripMs: null, attempt: 0 };

export function StudioInput() {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const [text, setText] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const reduced = usePrefersReducedMotion();
  const steps = useMemo<PlanStep[]>(() => state.draft?.steps ?? [], [state.draft]);

  // Advance the plan one step at a time, on the fixed cadence declared above.
  // Reduced motion renders the assembled state directly, as the design system
  // requires (prd §6 "Motion").
  useEffect(() => {
    if (state.phase !== "planning" || !state.draft) return;
    if (reduced) {
      dispatch({ type: "finish" });
      return;
    }
    if (state.landed >= steps.length) {
      const t = window.setTimeout(() => dispatch({ type: "finish" }), REVEAL_MS);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => dispatch({ type: "land" }), REVEAL_MS);
    return () => window.clearTimeout(t);
  }, [state.phase, state.landed, state.draft, steps, reduced]);

  // Abort an in-flight plan if the user submits again — otherwise a slow
  // fan-out can land after a newer one and overwrite it.
  const inflight = useRef<AbortController | null>(null);
  useEffect(() => () => inflight.current?.abort(), []);

  function submit(intent: string) {
    const trimmed = intent.trim();
    if (trimmed.length < 4) return;
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    // Started here rather than inside the store so the number covers what the
    // user actually waited for, including the request leaving the browser.
    const started = Date.now();
    dispatch({ type: "submit", intent: trimmed });
    void draftApp(trimmed, ctrl.signal).then((draft) => {
      if (!ctrl.signal.aborted) {
        dispatch({ type: "start", draft, roundTripMs: Date.now() - started });
      }
    });
  }

  if (state.phase === "idle") {
    return (
      <section className="panel">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline bg-[var(--ink)] px-3 py-1.5 text-[var(--card-b)] sm:px-5">
          <span className="mono text-[0.625rem] uppercase tracking-[0.12em]">Studio</span>
          <RegistryFacts />
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 pt-3 sm:px-5 sm:pt-5">
          <h1 className="display text-lg leading-none sm:text-2xl">Describe an onchain app</h1>
          <span className="mono text-[0.6875rem] text-[var(--muted-ink)]">
            you get an agent with a UI, a wallet, and a name
          </span>
        </div>

        <form
          className="mt-3 px-3 sm:px-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit(text);
          }}
        >
          <textarea
            ref={areaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit(text);
              }
            }}
            rows={3}
            placeholder="Describe an onchain app…"
            aria-label="Describe an onchain app"
            className="w-full resize-none rounded-[calc(var(--radius)*0.6)] border border-hairline bg-[var(--card-b)] p-3 text-base leading-snug shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)] outline-none placeholder:text-[var(--muted-ink)] sm:text-lg"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="submit" className="btn press text-sm" disabled={text.trim().length < 4}>
              Build it
            </button>
            <span className="mono text-[0.625rem] text-[var(--muted-ink)]">⌘↵</span>
            <span className="mono ml-auto text-[0.625rem] text-[var(--muted-ink)]">
              the chrome gets heavier if what you describe can spend
            </span>
          </div>
        </form>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--hairline)] px-3 pb-3 pt-3 sm:px-5 sm:pb-5">
          <Label className="w-full pb-1">Try one</Label>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setText(ex);
                areaRef.current?.focus();
              }}
              className="tag raise-sm press max-w-full truncate text-left normal-case"
              style={{ letterSpacing: 0, textTransform: "none", fontWeight: 500 }}
              title={ex}
            >
              {ex.length > 58 ? `${ex.slice(0, 56)}…` : ex}
            </button>
          ))}
          {/* The one limit worth stating before someone types, not after. */}
          <p className="mono w-full pt-1 text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
            these resolve protocol-level scalars from the standardized schemas. a single
            account&apos;s position — your Aave health factor — is not in that query shape, so a
            condition naming one evaluates to false rather than firing. README, &ldquo;not in
            scope&rdquo;.
          </p>
        </div>
      </section>
    );
  }

  // The real round trip is in flight: plan on 0G, fan-out across standardized
  // schemas, compose. Show the question rather than a bare spinner — the wait
  // is the product working, so name what it is doing.
  if (state.phase === "resolving" || !state.draft) {
    return (
      <section className="panel panel--monitor">
        <div className="flex items-center gap-2 border-b border-hairline bg-[var(--ink)] px-3 py-1.5 text-[var(--card-b)] sm:px-5">
          <span className="live-dot" aria-hidden />
          <span className="mono text-[0.625rem] uppercase tracking-[0.12em]">Resolving</span>
        </div>
        <div className="px-3 py-5 sm:px-5">
          <p className="display whitespace-pre-line text-base leading-snug sm:text-lg">{state.intent}</p>
          <p className="mono mt-3 text-[0.6875rem] text-[var(--muted-ink)]">
            planning intent · resolving standardized schemas · health-checking
            deployments
          </p>
        </div>
      </section>
    );
  }

  const draft = state.draft;
  const tier = draft.manifest.agency.tier;
  const assembled = state.phase === "ready";
  const provenance = readProvenance(draft);

  return (
    <section className={panelClass(tier, "p-3 sm:p-5")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Label>Intent</Label>
          {/* `whitespace-pre-line`: a refinement is appended as its own line, so
              the intent the plan was built from stays readable as it grows. */}
          <p className="mt-1 max-w-[62ch] whitespace-pre-line text-sm leading-snug sm:text-base">
            {state.intent}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <TierTag tier={tier} />
          <button
            type="button"
            className="btn press px-2.5 py-1 text-[0.6875rem] uppercase"
            onClick={() => dispatch({ type: "reset" })}
          >
            Discard
          </button>
        </div>
      </div>

      {/* Above the plan, full width, before anything numeric. Whether these
          figures were measured is the first thing a reader needs. */}
      <ProvenanceStrip
        read={provenance}
        manifest={draft.manifest}
        roundTripMs={state.roundTripMs}
      />

      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Label>Plan</Label>
          <ol className="mt-2 space-y-1.5">
            {steps.map((step, i) => (
              <PlanRow
                key={step.key}
                step={step}
                state={i < state.landed ? "done" : i === state.landed ? "running" : "queued"}
              />
            ))}
          </ol>
          {assembled ? (
            <div className="mono mt-3 space-y-1.5 border-t border-[var(--hairline)] pt-2 text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
              {/* Only true of the live path. `kit/shapes.ts` never sees the
                  prompt; `draftBlocks` in seed.ts picks from words in it. */}
              <p>
                {provenance.composedFromShape
                  ? "components chosen from the shape of the data, not from words in the prompt. the agent emitted declarative A2UI — never code."
                  : "components picked by the offline drafter from words in the prompt. the live composer chooses from the shape of what came back (kit/shapes.ts); this draft never reached it. still declarative A2UI — never code."}
              </p>
              {draft.manifest.data.sources.length === 0 ? (
                <p style={{ color: "var(--risk)" }}>
                  no standardized deployment exists for these schemas on these chains, so nothing
                  was queried. the surface on the right is an empty result, not a quiet one.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="min-w-0">
          <Label>{assembled ? "Interface" : "Assembling"}</Label>
          <div className="mt-2">
            {assembled ? (
              <AppBody doc={draft.manifest.ui} animate compact />
            ) : (
              <Skeleton
                count={
                  isUiDoc(draft.manifest.ui)
                    ? draft.manifest.ui.blocks.length
                    : Math.max(3, steps.length)
                }
              />
            )}
          </div>
        </div>
      </div>

      {assembled ? (
        <>
          <RefineBox onRefine={(refinement) => submit(`${state.intent}\nAlso: ${refinement}`)} />
          <PublishPanel
            // A refine produces a new plan and a new tier; the panel's own state
            // is seeded from the manifest, so it remounts rather than carrying a
            // cap that belonged to a plan that no longer exists.
            key={state.attempt}
            manifest={draft.manifest}
            // `!== "unmeasured"` and not `=== "live"`: a rules-engine plan over a
            // real fan-out carries measured figures, and telling its publisher
            // otherwise would be a fresh lie in the opposite direction.
            measured={provenance.kind !== "unmeasured"}
            onOpen={(name) => router.push(`/a/${name}`)}
          />
        </>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * The registry strip — real counts, or nothing
 * ------------------------------------------------------------------ */

/**
 * `GET /api/graph` answers with the registry as built: how many deployment ids
 * it holds, how many were verified, how many are placeholders, and the coverage
 * map by family and network.
 *
 * This strip used to read "15,000+ subgraphs · 9 standardized schemas · 4
 * chains". The middle and right numbers were right by luck; the left one is a
 * figure from The Graph's Subgraph MCP docs (prd §13) for a service prd §14 #6
 * records as "env var only, nothing calls it". Quoting somebody else's
 * catalogue size in our own chrome reads as our coverage. What this system can
 * actually back is the verified deployment count, so that is what it says, and
 * it says nothing at all until the fetch lands.
 */
interface RegistryFactsView {
  live: boolean;
  x402: boolean;
  registrySize: number;
  verified: number;
  placeholders: number;
  coverage: Record<string, Record<string, number>>;
}

/** One probe per page load, shared across mounts. The registry is static. */
let registryProbe: Promise<RegistryFactsView | null> | null = null;

function fetchRegistryFacts(): Promise<RegistryFactsView | null> {
  registryProbe ??= fetch("/api/graph", { headers: { accept: "application/json" } })
    .then((res) => (res.ok ? (res.json() as Promise<RegistryFactsView>) : null))
    .catch(() => null);
  return registryProbe;
}

function RegistryFacts() {
  const [facts, setFacts] = useState<RegistryFactsView | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchRegistryFacts().then((f) => {
      if (alive) setFacts(f);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!facts) {
    return (
      <span className="mono text-[0.625rem] tracking-[0.02em] opacity-70">reading the registry…</span>
    );
  }

  const families = Object.keys(facts.coverage).length;
  const networks = new Set(
    Object.values(facts.coverage).flatMap((byNetwork) => Object.keys(byNetwork)),
  ).size;

  return (
    <span className="mono text-[0.625rem] tracking-[0.02em] opacity-70">
      {facts.verified} verified deployments · {families} standardized schema{" "}
      {families === 1 ? "family" : "families"} · {networks} chains
      {/* prd §13: two families have zero deployments anywhere. The honest claim
          is the number with coverage, which is what `coverage` counts. */}
      {facts.live ? "" : " · gateway not keyed — the fan-out will answer from fixtures"}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Provenance — was any of this measured?
 * ------------------------------------------------------------------ */

interface ProvenanceRead {
  /**
   * `live`        every leg came back from the real path.
   * `deterministic` the data is real; the plan came from the rules engine.
   *                 Benign, and deliberately not coloured.
   * `unmeasured`  a figure on screen was not measured. `--risk`.
   */
  kind: "live" | "deterministic" | "unmeasured";
  /** The store's own sentences, split but never reworded. */
  reasons: string[];
  /** True only when the server-side composer produced this UI document. */
  composedFromShape: boolean;
  /** True when at least one source in the manifest carries a probe timestamp. */
  probed: boolean;
}

/**
 * Reading `StudioDraft.degraded`, which is prose, into a severity.
 *
 * The coupling is deliberate and one-directional: `degraded` is composed in
 * `lib/store.ts` from three templates, and the only one this treats as benign
 * is the planner-had-no-model case. Every other clause — including any wording
 * added later that this pattern does not recognise — is read as the severe
 * case. Guessing wrong in that direction over-warns; guessing wrong in the
 * other direction is the bug this whole strip exists to fix.
 *
 * The severity is then corroborated against the manifest itself rather than
 * resting on string matching alone: an offline draft has no source carrying a
 * `healthCheckedAt`, because it probed nothing.
 */
const PLANNER_ONLY = /rules engine|inference backend|no model/i;

function readProvenance(draft: StudioDraft): ProvenanceRead {
  const sources = draft.manifest.data.sources;
  const probed = sources.some((s) => s.healthCheckedAt !== null);
  // `compute` comes off `_meta.compute` on the live path and is "local" for the
  // offline drafter. Composition is the surface's authorship, so it is read
  // from the same fact the manifest records rather than inferred from the tier.
  const composedFromShape = draft.live || (draft.degraded !== null && probed);

  if (draft.live) {
    return { kind: "live", reasons: [], composedFromShape: true, probed };
  }

  const reasons = (draft.degraded ?? "")
    .split(";")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);

  // `live: false, degraded: null` is the aborted case, and `submit` discards
  // aborted drafts before they reach here. If one ever does, say the honest
  // thing rather than nothing.
  if (reasons.length === 0) {
    return {
      kind: "unmeasured",
      reasons: ["this draft did not come from a completed round trip, and the store gave no reason"],
      composedFromShape: false,
      probed,
    };
  }

  const benign = reasons.every((r) => PLANNER_ONLY.test(r) && !/fixture/i.test(r));
  return {
    kind: benign && probed ? "deterministic" : "unmeasured",
    reasons,
    composedFromShape,
    probed,
  };
}

function ProvenanceStrip({
  read,
  manifest,
  roundTripMs,
}: {
  read: ProvenanceRead;
  manifest: Manifest;
  roundTripMs: number | null;
}) {
  const p = manifest.provenance;
  const unmeasured = read.kind === "unmeasured";

  return (
    <div
      className="mt-3 rounded-[calc(var(--radius)*0.6)] border border-hairline px-2.5 py-2"
      style={
        unmeasured
          ? {
              // --risk is prd §6's "approaching threshold, degraded, stale".
              // Not --loss: nothing rejected and nothing died, but the figures
              // below are not measurements.
              boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--risk) 55%, transparent)",
              background: "color-mix(in srgb, var(--risk) 7%, transparent)",
            }
          : undefined
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Label>Provenance</Label>
        <Fig
          accent={unmeasured ? "risk" : read.kind === "live" ? "gain" : undefined}
          className="text-[0.6875rem] uppercase tracking-[0.06em]"
        >
          {unmeasured
            ? "figures below were not measured"
            : read.kind === "live"
              ? "measured this request"
              : "measured data · rules-engine plan"}
        </Fig>
        <span className="mono ml-auto text-[0.625rem] text-[var(--muted-ink)]">
          {p.model} · {p.compute}
          {p.attestationRef ? ` · ${p.attestationRef}` : " · no attestation"}
        </span>
      </div>

      {read.reasons.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {/* The store's words, not a friendlier substitute. */}
          {read.reasons.map((reason) => (
            <li key={reason} className="text-[0.6875rem] leading-snug">
              {reason}
            </li>
          ))}
        </ul>
      ) : null}

      {unmeasured && !read.probed && manifest.data.sources.length > 0 ? (
        <p className="mt-1.5 text-[0.6875rem] leading-snug">
          No deployment was probed on this draft: every source it names is marked unverified with
          no <span className="mono">healthCheckedAt</span>, and the figures in the interface are
          fixture constants from <span className="mono">lib/seed.ts</span>. Publishing keeps the
          plan; pressing Run on the published app replaces the numbers with a real query.
        </p>
      ) : null}

      <p className="mono mt-1.5 text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
        {roundTripMs === null
          ? "round trip not timed"
          : `round trip ${(roundTripMs / 1000).toFixed(2)}s — this browser's wall clock, request to draft`}
        {" · "}
        the steps replay on a fixed {REVEAL_MS}ms cadence: choreography, not per-step timings
      </p>
    </div>
  );
}

function PlanRow({ step, state }: { step: PlanStep; state: "queued" | "running" | "done" }) {
  return (
    <li
      className={cn("flex items-start gap-2 text-xs", state === "queued" && "opacity-35", state !== "queued" && "snap-in")}
    >
      <span
        className="mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full border border-hairline shadow-[inset_0_-1px_1px_rgba(0,0,0,0.2)]"
        style={{
          background: state === "done" ? "var(--ink)" : state === "running" ? "var(--live)" : "transparent",
        }}
        aria-hidden
      />
      <span className="min-w-0">
        <span className="font-medium">{step.label}</span>
        {state === "done" ? (
          <span className="mono ml-1.5 break-words text-[0.625rem] text-[var(--muted-ink)]">{step.detail}</span>
        ) : null}
      </span>
    </li>
  );
}

function Skeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="panel h-24 p-3" style={{ borderStyle: "dashed", opacity: 0.5 }}>
          <div className="h-2 w-16" style={{ background: "var(--hairline)" }} />
          <div className="mt-3 h-5 w-24" style={{ background: "var(--hairline)" }} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Refine conversationally — and what it actually is
 * ------------------------------------------------------------------ */

/**
 * prd §4 P1's fourth capability: "Refine conversationally — add a 7-day chart,
 * only alert me above $10k, use Optimism too."
 *
 * WHAT THIS IS. The refinement is appended to the intent and the whole round
 * trip runs again: plan → fan-out → compose, from the amended sentence. That is
 * a real re-plan and it genuinely works — "use Optimism too" comes back with
 * `networks: [arbitrum-one, optimism]` and a wider fan-out, verified against
 * this server.
 *
 * WHAT THIS IS NOT, and the label under the box says so. It is not an
 * incremental edit of the document you are looking at. A2UI is designed for
 * incremental component and data-model updates (prd §6 "The A2UI loop"), and a
 * real refine would send one — keeping the parts of the surface you did not ask
 * to change, and keeping the caps you already set. This throws the plan away and
 * builds another, so the interface can come back arranged differently even where
 * the refinement said nothing.
 *
 * It also cannot ask for a component. Components come from the shape of the
 * data (`kit/shapes.ts`); "add a 7-day chart" changes the plan's window, and a
 * chart appears only if what comes back is shaped like a series.
 */
function RefineBox({ onRefine }: { onRefine: (refinement: string) => void }) {
  const [text, setText] = useState("");
  const valid = text.trim().length >= 3;

  return (
    <div className="mt-4 border-t border-hairline pt-3">
      <Label>Refine</Label>
      <form
        className="mt-1 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onRefine(text.trim());
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="add a 7-day chart"
          aria-label="Refine this app in words"
          className="min-w-0 flex-1 basis-56 rounded-[calc(var(--radius)*0.6)] border border-hairline bg-[var(--card-b)] px-2 py-1.5 text-sm outline-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)] placeholder:text-[var(--muted-ink)]"
        />
        <button type="submit" className="btn press text-sm" disabled={!valid}>
          Re-plan
        </button>
        {REFINEMENTS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setText(r)}
            className="tag raise-sm press normal-case"
            style={{ letterSpacing: 0, textTransform: "none", fontWeight: 500 }}
          >
            {r}
          </button>
        ))}
      </form>
      <p className="mono mt-1.5 text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
        this appends your sentence to the intent and re-plans from scratch — a new fan-out and a new
        interface, not an incremental edit of this one. A2UI supports incremental updates (prd §6)
        and that is what a real refine would send. anything you set below resets with the new plan.
        it cannot request a component either: components come from the shape of what comes back.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Publish — capabilities, then what the button will actually do
 * ------------------------------------------------------------------ */

/** Editable capability state. Strings, so a half-typed number is not a zero. */
interface Caps {
  maxSpendUsd: string;
  maxPerTxUsd: string;
  expiryDays: string;
  requireConfirm: boolean;
}

/** The draft's absolute expiry, expressed as the days-from-now the field edits. */
function daysUntil(iso: string | null, now: number): string {
  if (!iso) return "30";
  const ms = Date.parse(iso) - now;
  if (!Number.isFinite(ms)) return "30";
  return String(Math.max(1, Math.round(ms / 86_400_000)));
}

function num(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
}

function PublishPanel({
  manifest,
  measured,
  onOpen,
}: {
  manifest: Manifest;
  /** Whether the draft being published was measured. Stated in the receipt. */
  measured: boolean;
  onOpen: (name: string) => void;
}) {
  const [name, setName] = useState(manifest.name);
  const [price, setPrice] = useState(manifest.pricing?.x402.priceUsd.toString() ?? "0.05");
  // Seeded from the manifest, and from the manifest's OWN clock: the draft set
  // `expiresAt` relative to `createdAt`, so the field opens on the number that
  // was actually drafted without this render reading a live clock.
  const [caps, setCaps] = useState<Caps>({
    maxSpendUsd: String(manifest.agency.policy.maxSpendUsd),
    maxPerTxUsd: String(manifest.agency.policy.maxPerTxUsd),
    expiryDays: daysUntil(manifest.agency.policy.expiresAt, Date.parse(manifest.createdAt)),
    requireConfirm: manifest.agency.policy.requireConfirm,
  });
  // Publishing pins the manifest, issues the subname and mints. Not instant,
  // and double-submitting would mint twice.
  const [publishing, setPublishing] = useState(false);
  const [outcome, setOutcome] = useState<PublishOutcome | null>(null);

  const status = useIdentityStatus();
  const tier = manifest.agency.tier;
  const autonomous = tier === "autonomous";
  const nameOk = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(name);
  const priceUsd = Number(price) || 0;

  const lifetime = num(caps.maxSpendUsd);
  const perTx = num(caps.maxPerTxUsd);
  const days = num(caps.expiryDays);
  const capsOk = !autonomous || (Number.isFinite(lifetime) && Number.isFinite(perTx) && days >= 1);

  /**
   * The policy that will be published. Every number in the copy below reads
   * from this object rather than restating a literal — the old copy asserted
   * "$500 lifetime, $50 per-transaction" whatever the manifest said, which was
   * true only for as long as nobody could change it.
   *
   * Non-autonomous tiers are left exactly as drafted: their caps are zero and
   * `requireConfirm` is true, and offering spend controls for a tier whose gate
   * refuses to execute anything unattended would imply an authority it has not
   * got (prd §7, gate step 3).
   *
   * `expiresAt` is deliberately absent here and is computed in the click
   * handler instead. It is the one field that needs a clock, render must not
   * read one, and the honest thing to show before the press is the *interval*
   * the user set — "30 days after publish" — rather than an absolute date
   * derived from whenever this component last rendered.
   */
  const policy: Policy = autonomous
    ? {
        ...manifest.agency.policy,
        maxSpendUsd: Number.isFinite(lifetime) ? lifetime : manifest.agency.policy.maxSpendUsd,
        maxPerTxUsd: Number.isFinite(perTx) ? perTx : manifest.agency.policy.maxPerTxUsd,
        requireConfirm: caps.requireConfirm,
      }
    : manifest.agency.policy;

  /** Called from the press, which is where reading the clock belongs. */
  function manifestToPublish(): Manifest {
    return {
      ...manifest,
      name,
      agency: {
        ...manifest.agency,
        policy:
          autonomous && days >= 1
            ? { ...policy, expiresAt: new Date(Date.now() + days * 86_400_000).toISOString() }
            : policy,
      },
      pricing: priceUsd > 0 ? { x402: { enabled: true, priceUsd } } : null,
    };
  }

  return (
    <div className="mt-4 border-t border-hairline pt-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <Label>Name</Label>
          <div className="mt-1 flex items-baseline rounded-[calc(var(--radius)*0.6)] border border-hairline bg-[var(--card-b)] px-2 py-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)]">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              aria-label="Mini app name"
              className="fig min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <span className="fig shrink-0 text-sm text-[var(--muted-ink)]">
              .{status?.ens.parent ?? "atlas-apps.eth"}
            </span>
          </div>
        </div>

        <PriceField value={price} onChange={setPrice} />

        <button
          type="button"
          disabled={!nameOk || !capsOk || publishing || outcome !== null}
          className="btn btn--primary press text-sm"
          onClick={() => {
            setPublishing(true);
            void publishApp(manifestToPublish())
              .then((out) => setOutcome(out))
              .finally(() => setPublishing(false));
          }}
        >
          {publishing ? "Publishing…" : outcome ? "Published" : "Publish"}
        </button>
      </div>

      {autonomous ? (
        <CapabilityControls caps={caps} onChange={setCaps} policy={policy} days={days} />
      ) : null}

      {/* Read from the manifest that is about to be sent, never from literals. */}
      <p className="mono mt-2 text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
        {autonomous ? (
          <>
            the wallet is provisioned server-side at publish and starts empty — fund it yourself.
            this manifest carries a{" "}
            <Fig>${policy.maxSpendUsd.toLocaleString("en-US")}</Fig> lifetime cap, a{" "}
            <Fig>${policy.maxPerTxUsd.toLocaleString("en-US")}</Fig> per-transaction cap
            {days >= 1 ? (
              <>
                {" "}
                and expires <Fig>{days}</Fig> {days === 1 ? "day" : "days"} after you press publish
              </>
            ) : (
              " and no usable expiry"
            )}
            . the kill switch renders in the app. all of it is enforced at the signer — which
            constraints the chain enforces and which this process does depends on the signer mode
            and is reported by the running app, not here (prd §7).
          </>
        ) : (
          `${TIER_LABEL[tier].toLowerCase()} tier — ${TIER_BLURB[tier].toLowerCase()} no wallet, no caps: the gate refuses to execute anything unattended at this tier.`
        )}
        {priceUsd > 0
          ? ` x402 price $${priceUsd} per run is recorded in the manifest; paying creators needs our own facilitator and is display-only today (README).`
          : " no x402 price set."}
      </p>

      {outcome ? (
        <PublishReceipt outcome={outcome} typed={name} measured={measured} onOpen={onOpen} />
      ) : (
        <PublishForecast status={status} name={nameOk ? name : null} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Capabilities — prd §4 P1, "no config files"
 * ------------------------------------------------------------------ */

function CapabilityControls({
  caps,
  onChange,
  policy,
  days,
}: {
  caps: Caps;
  onChange: (next: Caps) => void;
  /** The policy as it will be published, minus `expiresAt` — see `PublishPanel`. */
  policy: Policy;
  days: number;
}) {
  const lifetime = num(caps.maxSpendUsd);
  const perTx = num(caps.maxPerTxUsd);

  // Consequences, stated rather than prevented. Each is a real configuration
  // the gate in `lib/agency/policy.ts` handles; none is an error.
  const notes: string[] = [];
  if (!Number.isFinite(lifetime) || !Number.isFinite(perTx)) {
    notes.push("a cap must be a number — publishing is blocked until both are.");
  } else {
    if (lifetime === 0) {
      notes.push(
        "a $0 lifetime cap means the gate rejects every proposal with exceeds_lifetime_cap. the app watches and never spends.",
      );
    }
    if (perTx > lifetime && lifetime > 0) {
      notes.push(
        "the per-transaction cap is above the lifetime cap, so it can never be the rule that binds — the lifetime gate rejects first.",
      );
    }
  }
  if (!(days >= 1)) {
    notes.push("expiry must be at least one day — a policy that has already expired signs nothing.");
  }
  // §7's threat model row, and the one that must never read as permissive.
  notes.push(
    policy.allowlist.length === 0
      ? "the allowlist is EMPTY: no action can be signed, no exceptions. this is a blocked app, not an unrestricted one."
      : `${policy.allowlist.length} allowlisted target${policy.allowlist.length === 1 ? "" : "s"} — every other contract is refused.`,
  );

  return (
    <div className="mt-3 rounded-[calc(var(--radius)*0.6)] border border-hairline p-2.5">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <Label>Capabilities</Label>
        <span className="mono text-[0.625rem] text-[var(--muted-ink)]">
          written into the manifest this button publishes
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CapField
          label="Lifetime cap"
          prefix="$"
          value={caps.maxSpendUsd}
          onChange={(v) => onChange({ ...caps, maxSpendUsd: v })}
          hint="maxSpendUsd"
        />
        <CapField
          label="Per transaction"
          prefix="$"
          value={caps.maxPerTxUsd}
          onChange={(v) => onChange({ ...caps, maxPerTxUsd: v })}
          hint="maxPerTxUsd"
        />
        <CapField
          label="Expires in"
          suffix="days"
          value={caps.expiryDays}
          onChange={(v) => onChange({ ...caps, expiryDays: v })}
          hint="expiresAt · from the press"
        />
        <div className="min-w-0">
          <Label>Confirm first</Label>
          <label className="mt-1 flex items-center gap-2 rounded-[calc(var(--radius)*0.6)] border border-hairline bg-[var(--card-b)] px-2 py-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)]">
            <input
              type="checkbox"
              checked={caps.requireConfirm}
              onChange={(e) => onChange({ ...caps, requireConfirm: e.target.checked })}
              aria-label="Require a human confirmation before a trigger-raised action"
            />
            <span className="mono text-[0.6875rem]">{caps.requireConfirm ? "on" : "off"}</span>
          </label>
          <span className="mono mt-0.5 block text-[0.5625rem] text-[var(--muted-ink)]">
            requireConfirm
          </span>
        </div>
      </div>

      {/* The allowlist and the trigger are shown, not edited. Both are read-only
          on purpose: the allowlist comes out of the plan's action target, and a
          `when` expression is parsed by `lib/agency/triggers.ts`, which fails
          closed on anything it cannot parse. A free-text box here would let
          someone type prose that silently never fires. */}
      <dl className="mt-2 space-y-1 border-t border-hairline pt-2">
        <Row term="allowlist">
          {policy.allowlist.length === 0 ? (
            <Fig accent="risk">empty — no actions</Fig>
          ) : (
            policy.allowlist.map((t) => (
              <span key={t} className="mono mr-2 break-all text-[0.6875rem]" title={t}>
                {t.length > 18 ? `${t.slice(0, 10)}…${t.slice(-6)}` : t}
              </span>
            ))
          )}
        </Row>
        <Row term="wallet">
          <span className="mono text-[0.6875rem] text-[var(--muted-ink)]">
            provisioned server-side at publish — nothing in the Studio can create one, and the
            draft carries a zero-address placeholder
          </span>
        </Row>
      </dl>

      <ul className="mt-2 space-y-1">
        {notes.map((note) => (
          <li key={note} className="text-[0.6875rem] leading-snug text-[var(--muted-ink)]">
            {note}
          </li>
        ))}
      </ul>
      <p className="mono mt-1.5 text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
        the gate runs in this order: kill switch, wallet, expiry, autonomous-or-confirmed,
        allowlist, per-transaction cap, lifetime cap (prd §7). requireConfirm only holds back an
        action a trigger raised — a button you press yourself is already human-initiated. caps are
        dollars; the USD→token conversion happens server-side, so a chain that enforces a cap
        enforces the token amount, not the dollar figure.
      </p>
    </div>
  );
}

function CapField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  prefix?: string;
  suffix?: string;
  hint: string;
}) {
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      <div className="mt-1 flex items-baseline gap-1 rounded-[calc(var(--radius)*0.6)] border border-hairline bg-[var(--card-b)] px-2 py-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)]">
        {prefix ? <span className="fig text-sm text-[var(--muted-ink)]">{prefix}</span> : null}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          aria-label={label}
          inputMode="decimal"
          className="fig w-full min-w-0 bg-transparent text-sm outline-none"
        />
        {suffix ? <span className="mono text-[0.625rem] text-[var(--muted-ink)]">{suffix}</span> : null}
      </div>
      <span className="mono mt-0.5 block truncate text-[0.5625rem] text-[var(--muted-ink)]" title={hint}>
        {hint}
      </span>
    </div>
  );
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Reduced motion renders the assembled state directly — no plan playback. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}
