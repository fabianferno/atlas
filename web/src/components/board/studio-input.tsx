"use client";

/**
 * The Studio. One box, then the plan resolving in the open.
 *
 * The assemble sequence is the product's most distinctive second and the whole
 * animation budget: steps land one at a time, the interface snaps into place,
 * then you name it and publish. Legible, not a spinner.
 */
import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Manifest } from "@/lib/contracts/manifest";
import type { Draft, PlanStep, UiDoc } from "@/lib/seed";
import { TIER_BLURB, TIER_LABEL } from "@/lib/seed";
import { draftApp, publishApp } from "@/lib/store";
import { AppBody } from "@/components/board/app-body";
import { Label, TierTag, panelClass } from "@/components/board/chrome";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "Watch my Aave position on Arbitrum. If health factor drops under 1.4, sell ETH to bring it back to 1.8.",
  "Top DEXs by volume on Arbitrum this week",
  "Tell me when any single swap over $250k happens on Arbitrum",
  "Mirror 0x7f3a…9c41's Arbitrum swaps, max $50 per trade",
];

/** Playback speed for the plan. 1 is the authored timing. */
const SPEED = 0.6;

/** `resolving` covers the real round trip: plan → fan-out → compose. */
type Phase = "idle" | "resolving" | "planning" | "ready";

interface State {
  phase: Phase;
  intent: string;
  draft: Draft | null;
  landed: number;
}

type Action =
  | { type: "submit"; intent: string }
  | { type: "start"; draft: Draft }
  | { type: "land" }
  | { type: "finish" }
  | { type: "reset" };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "submit":
      return { phase: "resolving", intent: a.intent, draft: null, landed: 0 };
    case "start":
      return { ...s, phase: "planning", draft: a.draft, landed: 0 };
    case "land":
      return { ...s, landed: s.landed + 1 };
    case "finish":
      return { ...s, phase: "ready", landed: s.draft?.steps.length ?? 0 };
    case "reset":
      return { phase: "idle", intent: "", draft: null, landed: 0 };
  }
}

export function StudioInput() {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, { phase: "idle", intent: "", draft: null, landed: 0 });
  const [text, setText] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const reduced = usePrefersReducedMotion();
  const steps = useMemo<PlanStep[]>(() => state.draft?.steps ?? [], [state.draft]);

  // Advance the plan one step at a time. Reduced motion renders the assembled
  // state directly, as the design system requires.
  useEffect(() => {
    if (state.phase !== "planning" || !state.draft) return;
    if (reduced) {
      dispatch({ type: "finish" });
      return;
    }
    if (state.landed >= steps.length) {
      const t = window.setTimeout(() => dispatch({ type: "finish" }), 220);
      return () => window.clearTimeout(t);
    }
    const ms = Math.round(steps[state.landed].ms * SPEED);
    const t = window.setTimeout(() => dispatch({ type: "land" }), ms);
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
    dispatch({ type: "submit", intent: trimmed });
    void draftApp(trimmed, ctrl.signal).then((draft) => {
      if (!ctrl.signal.aborted) dispatch({ type: "start", draft });
    });
  }

  if (state.phase === "idle") {
    return (
      <section className="panel">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-[1.5px] border-rule bg-[var(--ink)] px-3 py-1.5 text-[var(--card-b)] sm:px-5">
          <span className="mono text-[0.625rem] uppercase tracking-[0.12em]">Studio</span>
          <span className="mono text-[0.625rem] tracking-[0.02em] opacity-70">
            15,000+ subgraphs · 9 standardized schemas · 4 chains
          </span>
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
            className="w-full resize-none border-[2.5px] border-rule bg-[var(--card-b)] p-3 text-base leading-snug outline-none placeholder:text-[var(--muted-ink)] sm:text-lg"
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
            >
              {ex.length > 58 ? `${ex.slice(0, 56)}…` : ex}
            </button>
          ))}
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
        <div className="flex items-center gap-2 border-b-[2.5px] border-rule bg-[var(--ink)] px-3 py-1.5 text-[var(--card-b)] sm:px-5">
          <span className="live-dot" aria-hidden />
          <span className="mono text-[0.625rem] uppercase tracking-[0.12em]">Resolving</span>
        </div>
        <div className="px-3 py-5 sm:px-5">
          <p className="display text-base leading-snug sm:text-lg">{state.intent}</p>
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

  return (
    <section className={panelClass(tier, "p-3 sm:p-5")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Label>Intent</Label>
          <p className="mt-1 max-w-[62ch] text-sm leading-snug sm:text-base">{state.intent}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <TierTag tier={tier} />
          <button type="button" className="btn press px-2.5 py-1 text-[0.6875rem] uppercase" onClick={() => dispatch({ type: "reset" })}>
            Discard
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Label>Plan</Label>
          <ol className="mt-2 space-y-1.5">
            {steps.map((step, i) => (
              <PlanRow key={step.key} step={step} state={i < state.landed ? "done" : i === state.landed ? "running" : "queued"} />
            ))}
          </ol>
          {assembled ? (
            <p className="mono mt-3 border-t border-[var(--hairline)] pt-2 text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
              components chosen from the shape of the data, not from words in the
              prompt. the agent emitted declarative A2UI — never code.
            </p>
          ) : null}
        </div>

        <div className="min-w-0">
          <Label>{assembled ? "Interface" : "Assembling"}</Label>
          <div className="mt-2">
            {assembled ? (
              <AppBody doc={draft.manifest.ui} animate compact />
            ) : (
              <Skeleton count={(draft.manifest.ui as UiDoc).blocks.length} />
            )}
          </div>
        </div>
      </div>

      {assembled ? <PublishBar manifest={draft.manifest} onPublished={(name) => router.push(`/a/${name}`)} /> : null}
    </section>
  );
}

function PlanRow({ step, state }: { step: PlanStep; state: "queued" | "running" | "done" }) {
  return (
    <li
      className={cn("flex items-start gap-2 text-xs", state === "queued" && "opacity-35", state !== "queued" && "snap-in")}
    >
      <span
        className="mt-[3px] h-2.5 w-2.5 shrink-0 border-[1.5px] border-rule"
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

function PublishBar({ manifest, onPublished }: { manifest: Manifest; onPublished: (name: string) => void }) {
  const [name, setName] = useState(manifest.name);
  const [price, setPrice] = useState("0.05");
  const tier = manifest.agency.tier;
  const valid = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(name);

  return (
    <div className="mt-4 border-t-[2.5px] border-rule pt-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <Label>Name</Label>
          <div className="mt-1 flex items-baseline border-[2.5px] border-rule bg-[var(--card-b)] px-2 py-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              aria-label="Mini app name"
              className="fig min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <span className="fig shrink-0 text-sm text-[var(--muted-ink)]">.graphminis.eth</span>
          </div>
        </div>

        <div className="basis-28">
          <Label>Price per run</Label>
          <div className="mt-1 flex items-baseline border-[2.5px] border-rule bg-[var(--card-b)] px-2 py-1.5">
            <span className="fig text-sm text-[var(--muted-ink)]">$</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
              aria-label="x402 price per run in USD"
              className="fig w-full min-w-0 bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={!valid}
          className="btn press text-sm disabled:opacity-40"
          style={{ background: "var(--ink)", color: "var(--card-b)" }}
          onClick={() => {
            const priceUsd = Number(price) || 0;
            const app = publishApp({
              ...manifest,
              name,
              pricing: priceUsd > 0 ? { x402: { enabled: true, priceUsd } } : null,
            });
            onPublished(app.manifest.name);
          }}
        >
          Publish
        </button>
      </div>

      <p className="mono mt-2 text-[0.625rem] leading-relaxed text-[var(--muted-ink)]">
        publishing mints an ENS subname, pins the manifest, and mints an Agentic ID on 0G Chain.
        {tier === "autonomous"
          ? " the wallet starts empty — fund it yourself, and the $500 lifetime cap, $50 per-transaction cap and kill switch are enforced at the signer."
          : ` ${TIER_LABEL[tier].toLowerCase()} tier — ${TIER_BLURB[tier].toLowerCase()}`}
      </p>
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
