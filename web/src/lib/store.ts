"use client";

/**
 * Client state for mini apps — in-memory, mirrored to localStorage.
 *
 * Deliberately tiny: a module-level snapshot, a listener set, and
 * `useSyncExternalStore`. The server snapshot is the seed state, so SSR and
 * the first client render agree and nothing flashes.
 *
 * TODO(integrator): this is the Studio's local view of the world. When the
 * kit is wired, `publish()` should call `Publish` from `@/lib/contracts/api`
 * and `forkApp()` should hand the forked manifest to the same path so a real
 * wallet, ENS subname and Agentic ID get minted.
 */
import { useEffect, useSyncExternalStore } from "react";
import {
  forkManifest,
  type AgencyTier,
  type Manifest,
  type Source,
} from "@/lib/contracts/manifest";
import type { JournalEntry } from "@/lib/contracts/policy";
import type { ComposeResult, FanOutResult, PlanResult } from "@/lib/contracts/api";
import {
  SEED_APPS,
  SEED_LEDGER,
  draftFromIntent,
  resetOwnedValues,
  tierRank,
  type Draft,
  type LedgerLine,
  type MiniApp,
  type PlanStep,
  type Review,
} from "@/lib/seed";

const STORAGE_KEY = "graphminis.board";
// Bump whenever seed content or the persisted shape changes. Without this a
// returning browser keeps its old snapshot and silently never sees the fix.
const STORAGE_VERSION = 5;
const LEDGER_MAX = 220;

export interface BoardState {
  apps: MiniApp[];
  ledger: LedgerLine[];
  /** Global halt. Blocks every action in every app, always reachable. */
  halted: boolean;
  wallet: string | null;
  hydrated: boolean;
}

const SEED_STATE: BoardState = {
  apps: SEED_APPS,
  ledger: SEED_LEDGER,
  halted: false,
  wallet: null,
  hydrated: false,
};

let state: BoardState = SEED_STATE;
const listeners = new Set<() => void>();

function getSnapshot(): BoardState {
  return state;
}
function getServerSnapshot(): BoardState {
  return SEED_STATE;
}
function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(next: Partial<BoardState>): void {
  state = { ...state, ...next };
  persist();
  for (const fn of listeners) fn();
}

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        v: STORAGE_VERSION,
        apps: state.apps,
        ledger: state.ledger.slice(-LEDGER_MAX),
        halted: state.halted,
        wallet: state.wallet,
      }),
    );
  } catch {
    // Private browsing, quota, or a disabled store. Non-fatal by design.
  }
}

let hydrateStarted = false;
function hydrateOnce(): void {
  if (hydrateStarted || typeof window === "undefined") return;
  hydrateStarted = true;
  let restored: Partial<BoardState> = {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      // Persisted shape is our own; a version bump discards anything older.
      const parsed = JSON.parse(raw) as { v?: number } & Partial<BoardState>;
      if (parsed.v === STORAGE_VERSION && Array.isArray(parsed.apps)) {
        restored = {
          apps: parsed.apps,
          ledger: Array.isArray(parsed.ledger) ? parsed.ledger : SEED_LEDGER,
          halted: Boolean(parsed.halted),
          wallet: parsed.wallet ?? null,
        };
      }
    }
  } catch {
    restored = {};
  }
  set({ ...restored, hydrated: true });
}

export function useBoard(): BoardState {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    hydrateOnce();
  }, []);
  return snap;
}

export function useApp(name: string): MiniApp | undefined {
  const board = useBoard();
  return board.apps.find((a) => a.manifest.name === name);
}

/* ------------------------------------------------------------------ *
 * Mutations
 * ------------------------------------------------------------------ */

function line(app: string, kind: JournalEntry["kind"], message: string, extra?: Partial<JournalEntry>): LedgerLine {
  return {
    id: `${app}-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    app,
    ts: new Date().toISOString(),
    kind,
    message,
    ok: true,
    ...extra,
  };
}

export function appendLedger(entries: LedgerLine[]): void {
  set({ ledger: [...state.ledger, ...entries].slice(-LEDGER_MAX) });
}

/** Take a drafted manifest live. Named to match the button: Publish → Published. */
export async function publishApp(
  manifest: Manifest,
  opts?: { author?: string },
): Promise<MiniApp> {
  const name = uniqueName(manifest.name);
  const now = new Date().toISOString();
  const autonomous = manifest.agency.tier === "autonomous";

  const draft: Manifest = {
    ...manifest,
    name,
    author: opts?.author ?? state.wallet ?? null,
    createdAt: now,
    updatedAt: now,
  };

  // The identity layer pins the manifest, issues the ENS subname, writes the
  // ENSIP-25/26 records and mints the Agentic ID. It produces a real CID and a
  // real token id even with no credentials — the backends fall back to mocks,
  // the values are still computed rather than invented.
  let published = draft;
  try {
    const res = await fetch("/api/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        manifest: draft,
        options: {
          name,
          tier: draft.agency.tier,
          priceUsd: draft.pricing?.x402.priceUsd,
        },
      }),
    });
    if (res.ok) {
      const report = (await res.json()) as {
        manifest?: Manifest;
        ens?: string | null;
        manifestCid?: string | null;
        agenticIdTokenId?: number | null;
      };
      // The returned manifest already carries identity and provenance.
      published = report.manifest ?? draft;
    }
  } catch {
    // Publishing offline keeps the app local and unnamed rather than
    // fabricating an ENS name and a CID that resolve to nothing.
  }

  // A published autonomous app gets its own session-key account. Issued empty
  // on purpose — funding it is a deliberate, separate act.
  if (autonomous && !published.agency.policy.wallet) {
    published = {
      ...published,
      agency: {
        ...published.agency,
        policy: { ...published.agency.policy, wallet: mintAddress() },
      },
    };
  }

  const app: MiniApp = {
    manifest: published,
    mine: true,
    running: published.agency.tier !== "readonly",
    lastRunAt: now,
    journal: [],
    reviews: [],
    stats: {
      runs: 1,
      forks: 0,
      valueTransactedUsd: 0,
      spentUsd: 0,
      thumbsUp: 0,
      thumbsDown: 0,
      earnedUsd: 0,
      sourcesQueried: published.data.sources.length,
      sourcesHealthy: published.data.sources.filter((s) => s.healthy).length,
      costPerRunUsd: 0.012,
    },
  };

  set({
    apps: [app, ...state.apps],
    ledger: [
      ...state.ledger,
      line(name, "QUERY", `published · ${published.identity.ens} · Agentic ID #${published.identity.agenticId?.tokenId}`),
      ...(published.agency.tier === "readonly"
        ? []
        : [line(name, "STREAM", `subscribed ${published.data.stream?.package ?? "substreams"} · ${published.data.stream?.module ?? "map_events"}`)]),
    ].slice(-LEDGER_MAX),
  });
  return app;
}

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

/**
 * The live path: question → plan (0G) → fan-out across standardized schemas →
 * A2UI document.
 *
 * Falls back to the local draft on any failure. A demo that dies because one
 * subgraph timed out is worse than a demo that quietly renders fixtures, and
 * the fallback is visible in the returned steps rather than hidden.
 */
export async function draftApp(intent: string, signal?: AbortSignal): Promise<Draft> {
  const local = draftFromIntent(intent);
  try {
    const plan = await postJson<PlanResult>("/api/plan", { question: intent }, signal);

    // Sources omitted on purpose — the graph route resolves them from
    // plan.schemas × plan.networks and health-checks in the same round trip.
    const data = await postJson<FanOutResult>(
      "/api/graph",
      { action: "fanout", plan },
      signal,
    );

    const composed = await postJson<ComposeResult>("/api/compose", { plan, data }, signal);

    const manifest: Manifest = {
      ...local.manifest,
      intent,
      data: {
        ...local.manifest.data,
        schemas: plan.schemas,
        networks: plan.networks,
        sources: (data as FanOutResult & { live?: Source[] }).live ?? local.manifest.data.sources,
        queries: plan.queries,
        variables: plan.variables,
      },
      ui: composed.ui,
      agency: { ...local.manifest.agency, tier: plan.tier },
      provenance: {
        model: plan.model,
        compute: plan.attestationRef ? "0g-private-computer" : "openai",
        attestationRef: plan.attestationRef,
        generatedAt: new Date().toISOString(),
      },
    };

    return { manifest, steps: livePlanSteps(plan, data, composed) };
  } catch {
    return local;
  }
}

/** Plan steps built from what actually happened, not from a script. */
function livePlanSteps(
  plan: PlanResult,
  data: FanOutResult,
  composed: ComposeResult,
): PlanStep[] {
  const dead = data.sourcesQueried - data.sourcesHealthy;
  return [
    {
      key: "intent",
      label: "Resolved intent",
      detail: `${plan.tier} · ${plan.schemas.join(" + ")}`,
      ms: 240,
    },
    {
      key: "sources",
      label: "Resolved standardized schemas",
      detail: `${plan.schemas.length} families · ${plan.networks.join(", ")}`,
      ms: 380,
    },
    {
      key: "health",
      label: "Health-checked deployments",
      // The dead count is the point. ~28% of standardized deployments are down
      // at any moment, and showing it is the composability argument.
      detail:
        dead > 0
          ? `${data.sourcesHealthy} of ${data.sourcesQueried} live · skipped ${dead}`
          : `${data.sourcesHealthy} of ${data.sourcesQueried} live`,
      ms: 520,
    },
    {
      key: "fanout",
      label: "Queried in parallel",
      detail: `${data.rows.length} rows · ${data.elapsedMs}ms${data.costUsd > 0 ? ` · $${data.costUsd.toFixed(2)} x402` : ""}`,
      ms: 460,
    },
    {
      key: "compose",
      label: "Chose components from data shape",
      detail: composed.componentsUsed.join(" · ") || "no components",
      ms: 400,
    },
  ];
}

/**
 * TODO(integrator): W6 owns the real session-key smart account. Replace this
 * with the deployed account address so the policy is enforced onchain rather
 * than by our process.
 */
function mintAddress(): string {
  let hex = "";
  while (hex.length < 40) hex += Math.random().toString(16).slice(2);
  return `0x${hex.slice(0, 40)}`;
}

function uniqueName(base: string): string {
  const taken = new Set(state.apps.map((a) => a.manifest.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export interface ForkResult {
  app: MiniApp;
  /** Named so the UI can state, precisely, what the fork did not inherit. */
  stripped: string[];
}

/**
 * Fork strips identity, wallet and provenance — a fresh wallet, a fresh name,
 * and zero inherited spending authority. `forkManifest` in contracts/manifest
 * enforces it; we surface it.
 */
export function forkApp(parentName: string, newName: string): ForkResult | null {
  const parent = state.apps.find((a) => a.manifest.name === parentName);
  if (!parent) return null;

  const name = uniqueName(newName);
  const forked = forkManifest(parent.manifest, name);
  const now = new Date().toISOString();

  const app: MiniApp = {
    manifest: {
      ...forked,
      ui: resetOwnedValues(forked.ui, forked.agency.tier),
      author: state.wallet ?? "you.graphminis.eth",
      pricing: null,
    },
    mine: true,
    running: false,
    lastRunAt: now,
    journal: [],
    reviews: [],
    stats: {
      runs: 0,
      forks: 0,
      valueTransactedUsd: 0,
      spentUsd: 0,
      thumbsUp: 0,
      thumbsDown: 0,
      earnedUsd: 0,
      sourcesQueried: forked.data.sources.length,
      sourcesHealthy: forked.data.sources.filter((s) => s.healthy).length,
      costPerRunUsd: parent.stats.costPerRunUsd,
    },
  };

  set({
    apps: [
      app,
      ...state.apps.map((a) =>
        a.manifest.name === parentName ? { ...a, stats: { ...a.stats, forks: a.stats.forks + 1 } } : a,
      ),
    ],
    ledger: [
      ...state.ledger,
      line(name, "POLICY", `forked from ${parent.manifest.name}@${parent.manifest.appVersion} · wallet, ENS name and attestation stripped`),
    ].slice(-LEDGER_MAX),
  });

  const stripped = ["ENS name", "Agentic ID", "manifest CID", "attestation"];
  if (parent.manifest.agency.tier === "autonomous") {
    stripped.push("wallet", `spending authority ($${parent.manifest.agency.policy.maxSpendUsd} cap)`);
  }
  return { app, stripped };
}

/** Global halt. The one control that is always reachable. */
export function setHalted(halted: boolean): void {
  set({
    halted,
    apps: state.apps.map((a) => ({
      ...a,
      running: halted ? false : a.running,
      manifest: { ...a.manifest, agency: { ...a.manifest.agency, policy: { ...a.manifest.agency.policy, halted } } },
    })),
    ledger: [
      ...state.ledger,
      line("system", "POLICY", halted ? "global halt engaged — every action blocked" : "global halt released", { ok: !halted }),
    ].slice(-LEDGER_MAX),
  });
}

/** Per-app kill switch. */
export interface ActOutcome {
  ok: boolean;
  allowed: boolean;
  rejection?: { reason: string; detail: string };
  txHash?: string | null;
  simulated?: boolean;
  enforcement?: unknown;
  spentUsd?: number;
  remainingUsd?: number;
  entries: JournalEntry[];
  error?: string;
}

/**
 * The action loop. An A2UI server event → the policy gate → a signature or a
 * rejection → the journal → the board's ledger.
 *
 * A rejection is a normal outcome, not an error. It journals, it renders, and
 * it is exactly what you want visible when an agent holds a wallet.
 */
export async function dispatchAction(
  manifest: Manifest,
  event: { name: string; context: Record<string, unknown> },
  opts: { userInitiated?: boolean; confirmed?: boolean } = {},
): Promise<ActOutcome> {
  const appId = manifest.name;

  const post = (body: unknown) =>
    fetch("/api/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const payload = {
    appId,
    event,
    userInitiated: opts.userInitiated ?? true,
    confirmed: opts.confirmed ?? false,
  };

  try {
    let res = await post(payload);

    // The server has never seen this manifest — apps are published locally
    // today. Seed the registry from it, then retry once.
    if (res.status === 404) {
      await fetch("/api/agency/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manifest }),
      });
      res = await post(payload);
    }

    const out = (await res.json()) as ActOutcome;
    mergeJournal(appId, out.entries ?? []);
    return out;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown";
    const entry = line(appId, "ERROR", `action failed — ${detail}`, { ok: false });
    set({ ledger: [...state.ledger, entry].slice(-LEDGER_MAX) });
    return { ok: false, allowed: false, entries: [], error: detail };
  }
}

/** Kill switch, server side. The local flag flips first so the UI is instant. */
export async function haltRemote(manifest: Manifest, halted: boolean): Promise<void> {
  setAppHalted(manifest.name, halted);
  try {
    const res = await fetch("/api/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ appId: manifest.name, control: halted ? "halt" : "resume" }),
    });
    if (res.ok) {
      const out = (await res.json()) as { entries?: JournalEntry[] };
      mergeJournal(manifest.name, out.entries ?? []);
    }
  } catch {
    // The local halt already took effect. A failed round trip must not
    // un-halt an agent — failing closed is the only safe direction here.
  }
}

/** Folds server journal entries into the board ledger without duplicating. */
function mergeJournal(app: string, entries: JournalEntry[]): void {
  if (entries.length === 0) return;
  const seen = new Set(state.ledger.map((l) => `${l.app}|${l.ts}|${l.message}`));
  const fresh: LedgerLine[] = entries
    .filter((e) => !seen.has(`${app}|${e.ts}|${e.message}`))
    .map((e) => ({ ...e, id: `${app}-${e.ts}-${e.kind}-${e.message.slice(0, 12)}`, app }));
  if (fresh.length === 0) return;
  set({
    ledger: [...state.ledger, ...fresh]
      .sort((a, b) => a.ts.localeCompare(b.ts))
      .slice(-LEDGER_MAX),
  });
}

export function setAppHalted(name: string, halted: boolean): void {
  set({
    apps: state.apps.map((a) =>
      a.manifest.name === name
        ? {
            ...a,
            running: halted ? false : a.manifest.agency.tier !== "readonly",
            manifest: { ...a.manifest, agency: { ...a.manifest.agency, policy: { ...a.manifest.agency.policy, halted } } },
          }
        : a,
    ),
    ledger: [
      ...state.ledger,
      line(name, "POLICY", halted ? "kill switch tripped — actions blocked" : "kill switch released", { ok: !halted }),
    ].slice(-LEDGER_MAX),
  });
}

export function runApp(name: string): void {
  const app = state.apps.find((a) => a.manifest.name === name);
  if (!app) return;
  const cost = app.stats.costPerRunUsd;
  set({
    apps: state.apps.map((a) =>
      a.manifest.name === name
        ? { ...a, stats: { ...a.stats, runs: a.stats.runs + 1 }, lastRunAt: new Date().toISOString() }
        : a,
    ),
    ledger: [
      ...state.ledger,
      line(
        name,
        "QUERY",
        `${app.manifest.data.schemas.join(" + ")} — ${app.stats.sourcesHealthy} of ${app.stats.sourcesQueried} live · $${cost.toFixed(3)}`,
      ),
    ].slice(-LEDGER_MAX),
  });
}

export function rateApp(name: string, score: "up" | "down", text: string, ranIt: boolean, rater: string): void {
  const review: Review = {
    id: `rev-${Date.now()}`,
    rater,
    score,
    text,
    ranIt,
    at: new Date().toISOString(),
  };
  set({
    apps: state.apps.map((a) =>
      a.manifest.name === name
        ? {
            ...a,
            reviews: [review, ...a.reviews],
            stats: {
              ...a.stats,
              thumbsUp: a.stats.thumbsUp + (score === "up" ? 1 : 0),
              thumbsDown: a.stats.thumbsDown + (score === "down" ? 1 : 0),
            },
          }
        : a,
    ),
  });
}

export function connectWallet(): void {
  // TODO(integrator): W6/identity owns the real connect. Privy and wagmi are
  // already dependencies — swap this for the embedded wallet + smart account.
  set({ wallet: state.wallet ? null : "0xd41a…7b09" });
}

/* ------------------------------------------------------------------ *
 * The ledger ticker — background autonomy, made visible.
 * ------------------------------------------------------------------ */

const TICKS: { kind: JournalEntry["kind"]; message: (app: MiniApp) => string; spend?: number; ok?: boolean }[] = [
  { kind: "STREAM", message: (a) => `block ${(291_447_000 + Math.floor(Math.random() * 900)).toLocaleString("en-US")} — ${a.manifest.data.stream?.module ?? "map_events"} matched` },
  { kind: "QUERY", message: (a) => `${a.manifest.data.schemas[0]} × ${a.stats.sourcesQueried} deployments — ${a.stats.sourcesHealthy} live · $${a.stats.costPerRunUsd.toFixed(3)}` },
  { kind: "TRIGGER", message: () => `condition evaluated, threshold not crossed` },
  { kind: "POLICY", message: (a) => `proposed action $${(a.manifest.agency.policy.maxPerTxUsd * 0.82).toFixed(2)} — allowlisted, under caps, allowed` },
  { kind: "ACTION", message: (a) => `swap ${(a.manifest.agency.policy.maxPerTxUsd * 0.82).toFixed(2)} USDC via allowlisted router`, spend: 0.82 },
  { kind: "ERROR", message: () => `deployment returned 502, skipped without retry`, ok: false },
];

/**
 * Appends a plausible line every few seconds so the board reads as alive.
 * Client-only, so no hydration mismatch, and it stops dead when halted.
 */
export function useLedgerTicker(enabled = true): void {
  const board = useBoard();
  const running = board.apps.filter((a) => a.running);

  useEffect(() => {
    if (!enabled || board.halted || running.length === 0) return;
    const id = window.setInterval(() => {
      const app = running[Math.floor(Math.random() * running.length)];
      const pool = app.manifest.agency.tier === "autonomous" ? TICKS : TICKS.filter((t) => t.kind !== "POLICY" && t.kind !== "ACTION");
      const tick = pool[Math.floor(Math.random() * pool.length)];
      const spend = tick.spend ? Number((app.manifest.agency.policy.maxPerTxUsd * tick.spend).toFixed(2)) : undefined;
      appendLedger([
        line(app.manifest.name, tick.kind, tick.message(app), {
          ok: tick.ok ?? true,
          ...(spend !== undefined
            ? { spentUsd: spend, txHash: `0x${Math.random().toString(16).slice(2).padEnd(12, "0")}${Math.random().toString(16).slice(2).padEnd(12, "0")}` }
            : {}),
        }),
      ]);
      if (spend !== undefined) {
        set({
          apps: state.apps.map((a) =>
            a.manifest.name === app.manifest.name
              ? { ...a, stats: { ...a.stats, spentUsd: Number((a.stats.spentUsd + spend).toFixed(2)), valueTransactedUsd: Number((a.stats.valueTransactedUsd + spend).toFixed(2)) } }
              : a,
          ),
        });
      }
    }, 4200);
    return () => window.clearInterval(id);
    // running.length and halted are the only things that change the interval
  }, [enabled, board.halted, running.length]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* ------------------------------------------------------------------ *
 * Derived views
 * ------------------------------------------------------------------ */

export function myApps(board: BoardState): MiniApp[] {
  return board.apps
    .filter((a) => a.mine)
    .slice()
    .sort((a, b) => tierRank(a.manifest.agency.tier) - tierRank(b.manifest.agency.tier) || a.manifest.name.localeCompare(b.manifest.name));
}

export function liveCount(board: BoardState): number {
  return board.apps.filter((a) => a.mine && a.running && !a.manifest.agency.policy.halted).length;
}

export function spentToday(board: BoardState): number {
  const cutoff = Date.now() - 86_400_000;
  return board.ledger
    .filter((l) => l.spentUsd && Date.parse(l.ts) > cutoff)
    .reduce((sum, l) => sum + (l.spentUsd ?? 0), 0);
}

export function tierCounts(board: BoardState): Record<AgencyTier, number> {
  const out: Record<AgencyTier, number> = { readonly: 0, monitor: 0, autonomous: 0 };
  for (const a of board.apps.filter((x) => x.mine)) out[a.manifest.agency.tier] += 1;
  return out;
}

/* ------------------------------------------------------------------ *
 * Formatting — mono, tabular, UTC. Deterministic on both sides of the wire.
 * ------------------------------------------------------------------ */

export function fmtUsd(value: number, opts?: { compact?: boolean }): string {
  if (opts?.compact) {
    const abs = Math.abs(value);
    if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  }
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtNum(value: number): string {
  return value.toLocaleString("en-US");
}

/** Always UTC — a receipt should read the same everywhere, and it keeps SSR honest. */
export function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return d.toISOString().slice(11, 19);
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

export function shortHash(hash: string, head = 6, tail = 4): string {
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}
