"use client";

/**
 * Client state for mini apps — in-memory, mirrored to localStorage.
 *
 * Deliberately tiny: a module-level snapshot, a listener set, and
 * `useSyncExternalStore`. The server snapshot is the seed state, so SSR and
 * the first client render agree and nothing flashes.
 *
 * Everything here that claims a fact goes over the wire to get it. `publishApp`
 * and `publishExisting` call `/api/publish`, `runApp` calls `/api/graph` +
 * `/api/compose`, `watchBlocks` calls `/api/stream`, `dispatchAction` calls
 * `/api/act`. There is no local simulation of any of those: if the round trip
 * fails, the failure is what gets journalled.
 *
 * `forkApp()` is still purely local, and that is now correct rather than a gap.
 * It strips `identity`, `agency.policy.wallet` and `provenance` (prd.md §5,
 * "non-negotiable") and stops there; `publishExisting()` is the step that takes
 * the copy the rest of the way — a subname, a CID and an Agentic ID of its own.
 * §12 calls that loop the flywheel: "fork → refine → publish under your own
 * name". Until `publishExisting` existed the last leg was unreachable, because
 * `publishApp` mints a NEW board entry and its only caller hung off a fresh
 * Studio draft. A fork could therefore never acquire a name — and §8 makes the
 * ENS name the thing a human verifies *before funding* a mini app, so an app
 * that can hold a wallet and can never be named is the safety story with its
 * last step missing.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  forkManifest,
  type AgencyTier,
  type Manifest,
  type Source,
} from "@/lib/contracts/manifest";
import type { JournalEntry } from "@/lib/contracts/policy";
import type { ComposeResult, FanOutResult, PlanResult } from "@/lib/contracts/api";
import {
  LIVE_SEED_AT,
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

const STORAGE_KEY = "atlas.board";
// Bump whenever the persisted SHAPE changes. Seed *content* is handled by
// `LIVE_SEED_AT` below, which needs no bump.
const STORAGE_VERSION = 6;
const LEDGER_MAX = 220;

/**
 * Seed bodies are re-measured by `scripts/seed-live.ts`, and a browser that
 * visited before a re-run keeps the old ones in localStorage. That bit us: the
 * snapshot said 16/16 live and the page still showed the previous numbers,
 * because the fix never reached a returning browser.
 *
 * So the stamp is the snapshot's own `generatedAt`, not a constant someone has to
 * remember to bump before recording. Regenerate the snapshot and every browser
 * refreshes its seed apps on next load — while KEEPING anything the user
 * published, which is the whole reason this is a merge and not a wipe.
 */
const SEED_STAMP = LIVE_SEED_AT ?? "none";
const SEED_NAMES = new Set(SEED_APPS.map((a) => a.manifest.name));

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
        seededAt: SEED_STAMP,
        apps: state.apps,
        ledger: state.ledger.slice(-LEDGER_MAX),
        halted: state.halted,
        // `wallet` is NOT persisted. Privy restores its own session on load and
        // `PrivyWalletBridge` re-publishes the address once it is actually
        // authenticated. Writing it here would mean a reload paints a connected
        // wallet before — or without — anyone signing in.
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
      const parsed = JSON.parse(raw) as { v?: number; seededAt?: string } & Partial<BoardState>;
      if (parsed.v === STORAGE_VERSION && Array.isArray(parsed.apps)) {
        const stale = parsed.seededAt !== SEED_STAMP;
        // Stale seed data: take the freshly measured seed apps, keep everything
        // the user published. Their work survives; the demo content refreshes.
        const apps = stale
          ? [...SEED_APPS, ...parsed.apps.filter((a) => !SEED_NAMES.has(a.manifest.name))]
          : parsed.apps;
        restored = {
          apps,
          ledger: Array.isArray(parsed.ledger) && !stale ? parsed.ledger : SEED_LEDGER,
          halted: Boolean(parsed.halted),
          // No `wallet` — see persist(). Any address left by an older build is
          // ignored rather than restored.
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

/* ------------------------------------------------------------------ *
 * Wire shapes
 *
 * Declared here rather than imported from `lib/kit/*`, which is where the
 * richer versions of these live. Nothing under `lib/kit` may become reachable
 * from a client bundle — `gateway.ts` reads `GRAPH_API_KEY` at module scope —
 * and a type-only import is one refactor away from a value import. These are
 * the response fields the Studio actually reads, and nothing more.
 * ------------------------------------------------------------------ */

/**
 * `/api/plan`'s response: a `PlanResult` plus the `_meta` block the route adds
 * from `getInferenceConfig()`. `_meta.compute` is the backend that *really*
 * ran, which is the only reason provenance can be trusted.
 */
interface PlanResponse extends PlanResult {
  _meta?: {
    compute: Manifest["provenance"]["compute"];
    live: boolean;
    elapsedMs: number;
  };
}

/**
 * `/api/graph`'s fan-out response. Two fields the `FanOutResult` contract does
 * not carry decide whether the answer means anything:
 *
 *   `live`                — was the gateway keyed, or did `fanOutDetailed`
 *                           answer from fixtures? `kit/gateway.ts` is explicit
 *                           that this must be surfaced, because a demo that
 *                           cannot tell you whether it is live is worse than
 *                           one that is not.
 *   `resolution.sources`  — the health-checked subset, present whenever we let
 *                           the route resolve sources for us. NOT the same
 *                           thing as `live`; conflating them writes
 *                           `sources: true` into the manifest and fails
 *                           `zSource` at publish time.
 */
interface FanOutResponse extends FanOutResult {
  live: boolean;
  resolution?: { sources: Source[] };
}

/** `/api/publish` POST → `PublishReport` from `lib/identity/publish.ts`. */
interface PublishReportResponse {
  manifest?: Manifest;
  ens?: string | null;
  manifestCid?: string | null;
  agenticIdTokenId?: number | null;
  /**
   * Which backend actually issued, minted and pinned. Read rather than inferred
   * from the warning strings: `warnings[]` is prose meant for a human, and a
   * ledger line that says "issued" or "mocked" on the strength of a regex over
   * that prose is one rewording away from claiming a subname that does not
   * exist. `publishWithReport` returns these three fields for exactly this.
   */
  ensMode?: string;
  ipfsMode?: string;
  agenticIdMode?: string;
  /** Every identity path that fell back to a mock. Empty on a fully live publish. */
  warnings?: string[];
  /** Present instead of the report when the route rejected the request. */
  error?: string;
}

/** `/api/stream` POST. Success and every failure mode the route defines. */
interface StreamResponse {
  ok?: boolean;
  mode?: "substreams" | "interval";
  error?: string;
  detail?: string;
  retryable?: boolean;
  summary?: {
    ticks: number;
    ticksWithFiring: number;
    firings: number;
    executed: number;
    rejected: number;
    undos: number;
    lastBlock: number | null;
    firstBlock: number | null;
    rejections: string[];
    txHashes: string[];
  };
  entries?: JournalEntry[];
}

export interface PublishOutcome {
  /**
   * The board entry as it stands after the attempt.
   *
   * Null in exactly one case: `publishExisting` was handed a name that is not on
   * this board, so there was no entry to publish and none was invented. Every
   * other outcome — success, a mocked path, a rejected POST, an offline POST, a
   * refusal — has a real entry to point at, because the app already existed or
   * `publishApp` just created it.
   */
  app: MiniApp | null;
  /** Verbatim from the server: every identity path that fell back to a mock. */
  warnings: string[];
  ens: string | null;
  manifestCid: string | null;
  agenticIdTokenId: number | null;
  /** True when the POST itself failed — the app stayed local and unnamed. */
  offline: boolean;
  /**
   * Why nothing was sent, or null when a request went out.
   *
   * Deliberately NOT folded into `offline`. Offline means we asked and the round
   * trip failed; refused means we did not ask, because asking would have minted a
   * second Agentic ID and issued a second subname for one app — which is
   * irreversible and unrecoverable, not a retryable failure. Rendering them the
   * same way would tell a user to press again, which is the one thing that must
   * not happen here.
   */
  refused: string | null;
}

/**
 * One publish round trip, and the only place in this file that talks to
 * `/api/publish`.
 *
 * `publishApp` and `publishExisting` differ entirely in what they do to the
 * board — one prepends a new entry, the other merges into an existing one — and
 * not at all in how they publish. Duplicating the wire half is how the two drift
 * until one of them stops reporting a warning or starts trusting a non-2xx, so
 * there is exactly one copy of it.
 *
 * The identity layer pins the manifest, issues the ENS subname, writes the
 * ENSIP-25/26 records and mints the Agentic ID. It produces a real CID and a real
 * token id even with no credentials — the backends fall back to mocks, the values
 * are still computed rather than invented, and each fallback names itself in
 * `warnings`.
 */
interface PublishWire {
  /**
   * What the server returned, or the unchanged draft when `offline`. On the
   * offline path this carries NO identity: callers must not write it anywhere a
   * reader would take for a published manifest.
   */
  manifest: Manifest;
  warnings: string[];
  ens: string | null;
  manifestCid: string | null;
  agenticIdTokenId: number | null;
  offline: boolean;
  /** Backend that issued / minted, straight off the report. Null when offline. */
  ensMode: string | null;
  agenticIdMode: string | null;
}

async function sendPublish(draft: Manifest): Promise<PublishWire> {
  const base: PublishWire = {
    manifest: draft,
    warnings: [],
    ens: null,
    manifestCid: null,
    agenticIdTokenId: null,
    offline: false,
    ensMode: null,
    agenticIdMode: null,
  };

  try {
    const res = await fetch("/api/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        manifest: draft,
        options: {
          name: draft.name,
          tier: draft.agency.tier,
          priceUsd: draft.pricing?.x402.priceUsd,
        },
      }),
    });
    const report = (await res.json().catch(() => ({}))) as PublishReportResponse;
    if (!res.ok) {
      // A rejected publish leaves the app exactly as local as a failed fetch
      // does, so it reports the same way — with the route's own reason attached
      // rather than a generic "offline". A non-2xx must never read as a publish.
      return {
        ...base,
        offline: true,
        warnings: [`publish rejected (${res.status}) — ${report.error ?? "no reason given"}`],
      };
    }
    return {
      // The returned manifest already carries identity and provenance.
      manifest: report.manifest ?? draft,
      warnings: report.warnings ?? [],
      ens: report.ens ?? null,
      manifestCid: report.manifestCid ?? null,
      agenticIdTokenId: report.agenticIdTokenId ?? null,
      offline: false,
      ensMode: report.ensMode ?? null,
      agenticIdMode: report.agenticIdMode ?? null,
    };
  } catch (error) {
    // Publishing offline keeps the app local and unnamed rather than
    // fabricating an ENS name and a CID that resolve to nothing.
    return {
      ...base,
      offline: true,
      warnings: [
        `publish request failed — ${error instanceof Error ? error.message : "unknown"}; the app is local only: no ENS name, no manifest CID, no Agentic ID`,
      ],
    };
  }
}

/**
 * The ledger lines for one publish attempt, built from what the server returned.
 *
 * NOT a template. The old line read `published · <name> · Agentic ID #n`
 * whatever the backends did, so a publish onto the mock ENS backend journalled a
 * subname that was never issued — and the ledger is the artifact someone scrolls
 * back through afterwards, so a claim made here outlives the receipt that
 * qualified it. `ensMode` and `agenticIdMode` come off the report itself rather
 * than being sniffed out of `warnings`, and a mocked path says so in the line.
 *
 * `failed` is the caller's sentence for the offline case, because it differs in
 * substance: `publishApp` has still created a local entry, while
 * `publishExisting` has left an existing app exactly as unpublished as it was.
 */
function publishLines(name: string, wire: PublishWire, failed: string): LedgerLine[] {
  if (wire.offline) {
    return [
      line(name, "ERROR", failed, { ok: false }),
      ...wire.warnings.map((w) => line(name, "POLICY", `publish warning — ${w}`, { ok: false })),
    ];
  }

  const ens = wire.manifest.identity.ens ?? wire.ens;
  const tokenId = wire.manifest.identity.agenticId?.tokenId ?? wire.agenticIdTokenId;

  const ensPart = !ens
    ? "no ENS name"
    : wire.ensMode === "mock"
      ? `${ens} — computed, NOT issued (ENS backend is the local mock)`
      : `${ens} issued via ${wire.ensMode ?? "an unreported backend"}`;

  const tokenPart =
    tokenId === null || tokenId === undefined
      ? "no Agentic ID"
      : wire.agenticIdMode === "mock"
        ? `Agentic ID #${tokenId} — derived, NOT minted (0G backend is mocked)`
        : `Agentic ID #${tokenId}`;

  return [
    line(name, "QUERY", ["published", ensPart, tokenPart].join(" · "), { ok: true }),
    // Every mocked path, named, one line each. This is the honest half of the
    // publish beat and it belongs in the receipt, not just in a tooltip.
    ...wire.warnings.map((w) => line(name, "POLICY", `publish warning — ${w}`, { ok: false })),
  ];
}

/**
 * Take a drafted manifest live. Named to match the button: Publish → Published.
 *
 * NEW board entry, prepended — this is the Studio's path, where the manifest has
 * never been on the board. For an app that IS already on the board, use
 * `publishExisting`: coming through here would duplicate it, and `uniqueName`
 * would rename the copy `foo-2` for colliding with itself.
 *
 * The report's `warnings[]` is returned rather than swallowed. It is the list of
 * identity paths that fell back to a mock, and the README promises it out loud:
 * "Nothing silently pretends." Discarding it made that a claim about a field
 * nothing read.
 */
export async function publishApp(
  manifest: Manifest,
  opts?: { author?: string },
): Promise<PublishOutcome> {
  const name = uniqueName(manifest.name);
  const now = new Date().toISOString();

  const draft: Manifest = {
    ...manifest,
    name,
    author: opts?.author ?? state.wallet ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const wire = await sendPublish(draft);
  const { warnings, ens, manifestCid, agenticIdTokenId, offline } = wire;
  const published = wire.manifest;

  // NOTE: nothing synthesises `agency.policy.wallet` here, and nothing may.
  // This used to mint 40 random hex characters and present them as the address
  // to fund. Nobody holds that key, so anyone who funded it destroyed the
  // money. A mini app's signer address is a server fact — `provisionWallet` in
  // `lib/agency/wallet.ts` owns it, `/api/agency/register` returns it, and
  // `/api/publish` writes it into the manifest when it has one. If the manifest
  // came back with `wallet: null`, null is the truth and the UI must say so.

  const app: MiniApp = {
    manifest: published,
    mine: true,
    running: published.agency.tier !== "readonly",
    // Published, not run. `runApp` sets `runs` and `costPerRunUsd` from a
    // measured round trip; there is no defensible value for either until one
    // has happened, and 0 is the one number that cannot be mistaken for a
    // measurement.
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
      sourcesQueried: published.data.sources.length,
      sourcesHealthy: published.data.sources.filter((s) => s.healthy).length,
      costPerRunUsd: 0,
    },
  };

  // One line, describing the publish and nothing else. There used to be a
  // second line claiming a Substreams subscription for every non-readonly app;
  // nothing had subscribed. `watchBlocks` is what subscribes, and it journals
  // from the server's own run.
  set({
    apps: [app, ...state.apps],
    ledger: [
      ...state.ledger,
      ...publishLines(
        name,
        wire,
        "published locally — no ENS name, no CID, no Agentic ID (publish failed)",
      ),
    ].slice(-LEDGER_MAX),
  });

  return { app, warnings, ens, manifestCid, agenticIdTokenId, offline, refused: null };
}

/* ------------------------------------------------------------------ *
 * Publishing an app that is ALREADY on the board
 * ------------------------------------------------------------------ */

/**
 * Names that have a publish in flight right now.
 *
 * A publish pins, mints on 0G Galileo and issues a subname on Sepolia — three
 * chain writes that take seconds and cost gas. Two overlapping calls for one app
 * would mint two Agentic IDs and issue the subname twice, and neither is
 * reversible; the second token would sit onchain forever asserting the same name
 * as the first. The `identity.ens` check below cannot catch that on its own,
 * because the first call has not written identity back yet while the second is
 * being made. So the guard is here, at the only place that can see both.
 *
 * The UI disables its button as well. That is not redundancy for its own sake:
 * the button covers the common case legibly, this covers a case the button
 * cannot see — two tabs on the same board, or a re-render that drops the pending
 * state.
 */
const publishInFlight = new Set<string>();

/**
 * Nothing was sent. Journalled anyway, for the same reason a policy rejection is
 * (§7: "a rejection is a normal outcome, not an error — it journals, it
 * renders"): a refusal is an outcome, and the double-mint case is a safety
 * decision that should leave a trace rather than only a transient panel.
 */
function refusal(name: string, app: MiniApp | null, reason: string): PublishOutcome {
  set({
    ledger: [
      ...state.ledger,
      line(name, "POLICY", `publish refused — ${reason}`, { ok: false }),
    ].slice(-LEDGER_MAX),
  });
  return {
    app,
    warnings: [],
    ens: app?.manifest.identity.ens ?? null,
    manifestCid: app?.manifest.identity.manifestCid ?? null,
    agenticIdTokenId: app?.manifest.identity.agenticId?.tokenId ?? null,
    offline: false,
    refused: reason,
  };
}

/**
 * Publish an app that is already on the board, IN PLACE — the missing last leg
 * of prd.md §12's flywheel, "fork → refine → publish under your own name".
 *
 * WHY THIS IS NOT `publishApp`. That one is for a manifest the board has never
 * seen: it runs `uniqueName`, builds a fresh `MiniApp` and prepends it. Pointing
 * it at an app that is already on the board does two wrong things at once — the
 * name collides with itself and comes back renamed `foo-2`, and the board ends up
 * holding the app twice, once named and once not. So this one keeps the name, keeps
 * the position, and merges the server's manifest into the entry that is already
 * there.
 *
 * WHAT IS PRESERVED, and why each matters: `stats` (runs, forks, spend against
 * cap and the health counts are measurements of this app, and publishing measured
 * nothing), `journal` and `reviews` (its history did not begin at publish),
 * `mine`, and `running`. That last one diverges from `publishApp`, which arms a
 * non-readonly app on creation — here, arming is a separate act. A fork arrives
 * `running: false`, and flipping it on during a publish would hand an app
 * standing authority to act on a trigger as a side effect of it being named,
 * which is not what the user pressed.
 *
 * WHAT IS NOT WRITTEN ON FAILURE: anything. An `offline: true` or a non-2xx
 * leaves the entry byte-for-byte as it was — still unpublished, still unnamed,
 * price unchanged — and journals that. Writing the price locally off a publish
 * that never landed would leave a manifest asserting a term no pinned artifact
 * carries.
 */
export async function publishExisting(
  name: string,
  opts?: { priceUsd?: number | null },
): Promise<PublishOutcome> {
  const existing = state.apps.find((a) => a.manifest.name === name);
  if (!existing) {
    return refusal(
      name,
      null,
      `no mini app called "${name}" is on this board, so there is nothing to publish`,
    );
  }

  // §8: the name is what a human verifies before funding. Issuing a second
  // subname and minting a second Agentic ID for one app would make that
  // verification ambiguous in the one direction that matters — two tokens, both
  // asserting the name, one of them stale — and the binding is immutable by
  // design, so it cannot be tidied up afterwards.
  const already = existing.manifest.identity.ens;
  if (already) {
    return refusal(
      name,
      existing,
      `${name} is already published as ${already} — republishing would issue a second subname and mint a second Agentic ID for one app, and neither can be undone`,
    );
  }
  if (!existing.mine) {
    return refusal(
      name,
      existing,
      `${name} is not on your board — it is being browsed from the registry, and publishing it would name someone else's app under your parent`,
    );
  }
  if (publishInFlight.has(name)) {
    return refusal(
      name,
      existing,
      `a publish for ${name} is already in flight — wait for it rather than minting twice`,
    );
  }

  const priceUsd = opts?.priceUsd;
  const draft: Manifest = {
    ...existing.manifest,
    // Deliberately NOT re-run through `uniqueName`: the app is already on the
    // board, so it would collide with itself.
    name,
    // Whoever publishes it is its author, and only when it has none — an app
    // that already carries an author keeps it. `state.wallet` is the address
    // Privy authenticated, the same source `publishApp` uses; null stays null and
    // the card reads "unclaimed", which is what an unsigned-in publish is.
    author: existing.manifest.author ?? state.wallet ?? null,
    // undefined leaves the manifest's own pricing alone; null clears it; a
    // number above zero sets it. §12 and the README are explicit that this is a
    // CONFIGURED price and not realised earnings — no facilitator settles it.
    pricing:
      priceUsd === undefined
        ? existing.manifest.pricing
        : priceUsd !== null && priceUsd > 0
          ? { x402: { enabled: true, priceUsd } }
          : null,
  };

  publishInFlight.add(name);
  let wire: PublishWire;
  try {
    wire = await sendPublish(draft);
  } finally {
    publishInFlight.delete(name);
  }

  const { warnings, ens, manifestCid, agenticIdTokenId, offline } = wire;
  const lines = publishLines(
    name,
    wire,
    `still unpublished — the publish request failed, so ${name} has no ENS name, no manifest CID and no Agentic ID`,
  );

  if (offline) {
    // Ledger only. The entry itself is untouched, which is the honest record of a
    // publish that did not land.
    set({ ledger: [...state.ledger, ...lines].slice(-LEDGER_MAX) });
    return { app: existing, warnings, ens, manifestCid, agenticIdTokenId, offline, refused: null };
  }

  // The server's manifest, not a reconstruction of it. `/api/publish` returns the
  // document it actually pinned plus the `identity` and `provenance` it derived,
  // and it is the authority on `agency.policy.wallet` too — `provisionWallet`
  // runs there. Rebuilding this locally is how the address in ENS ends up
  // disagreeing with the address on screen.
  const merged: MiniApp = {
    ...existing,
    manifest: wire.manifest,
  };

  set({
    apps: state.apps.map((a) => (a.manifest.name === name ? merged : a)),
    ledger: [...state.ledger, ...lines].slice(-LEDGER_MAX),
  });

  return { app: merged, warnings, ens, manifestCid, agenticIdTokenId, offline, refused: null };
}

/* ------------------------------------------------------------------ *
 * Identity status — what is live and what is mocked
 * ------------------------------------------------------------------ */

/** Mirrors `GET /api/publish`, which returns `identityStatus()` verbatim. */
export interface IdentityStatusView {
  ens: { mode: string; parent: string; configured: boolean };
  ipfs: { mode: string };
  zeroG: {
    mode: string;
    chainId: number;
    chainName: string;
    agenticId: string | null;
    registry: string | null;
    verifier: string | null;
    explorer: string;
  };
  app: { origin: string };
}

/**
 * Process configuration cannot change under a running server, so one fetch per
 * page load is enough and the promise is shared across every mount. A failed
 * probe resolves to null — the panel says "unknown", which is correct, rather
 * than defaulting to "live".
 */
let identityStatusProbe: Promise<IdentityStatusView | null> | null = null;

function fetchIdentityStatus(): Promise<IdentityStatusView | null> {
  identityStatusProbe ??= fetch("/api/publish", { headers: { accept: "application/json" } })
    .then((res) => (res.ok ? (res.json() as Promise<IdentityStatusView>) : null))
    .catch(() => null);
  return identityStatusProbe;
}

/**
 * `publish.ts` has commented since it was written that `identityStatus()` is
 * "rendered in the Studio's publish panel". Nothing rendered it, so a publish
 * onto a mock ENS backend looked identical to a publish onto a real one. This is
 * the hook that closes that gap.
 *
 * Null while in flight, and null if the probe failed.
 */
export function useIdentityStatus(): IdentityStatusView | null {
  const [status, setStatus] = useState<IdentityStatusView | null>(null);
  useEffect(() => {
    let live = true;
    void fetchIdentityStatus().then((s) => {
      if (live) setStatus(s);
    });
    return () => {
      live = false;
    };
  }, []);
  return status;
}

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    // The route's own error text is the load-bearing part: "invalid request"
    // plus a zod issue path says which field was wrong, where a bare status
    // code leaves the caller guessing. Truncated because these strings end up
    // in a ledger line.
    const detail = await res.text().catch(() => "");
    throw new Error(`${url} → ${res.status}${detail ? ` ${detail.slice(0, 180)}` : ""}`);
  }
  return (await res.json()) as T;
}

export interface StudioDraft extends Draft {
  /** True only when plan + fan-out + compose all came back from the real path. */
  live: boolean;
  /**
   * Human-readable reason the live path was abandoned. Null when live.
   *
   * Also null in the one case where there is no outcome to report: the user
   * resubmitted and this request was aborted. The caller already discards an
   * aborted draft (`ctrl.signal.aborted`), and flagging it as a degradation
   * would flash a warning about a run nobody is waiting on.
   */
  degraded: string | null;
}

/** True when this rejection is the user resubmitting, not a failure. */
function isAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/**
 * The live path: question → plan (0G) → fan-out across standardized schemas →
 * A2UI document.
 *
 * Falls back to the local draft on any failure — a demo that dies because one
 * subgraph timed out is worse than one that renders fixtures. But the fallback
 * is *labelled*. `draftFromIntent` invents subgraph IDs, invents health flags
 * and invents figures ($4.21B, +8.4%, a hardcoded Uniswap-v3 leaderboard), and
 * until `degraded` existed nothing on screen distinguished that from a measured
 * run. Both `live` and `degraded` are for the caller to render, not to log.
 *
 * Two-hundred-OK is not the same as live. If the fan-out answered from fixtures
 * — or the planner ran its deterministic rules engine with no model at all —
 * every call succeeded and the result is still not a measurement, so both count
 * as degradations.
 */
export async function draftApp(intent: string, signal?: AbortSignal): Promise<StudioDraft> {
  const local = draftFromIntent(intent);
  // Named so a failure can say which leg of the round trip broke. "compose
  // failed" and "plan failed" call for different fixes and the user can see it.
  let step = "plan";
  try {
    const plan = await postJson<PlanResponse>("/api/plan", { question: intent }, signal);

    // Sources omitted on purpose — the graph route resolves them from
    // plan.schemas × plan.networks and health-checks in the same round trip.
    step = "fan-out";
    const data = await postJson<FanOutResponse>("/api/graph", { action: "fanout", plan }, signal);

    step = "compose";
    const composed = await postJson<ComposeResult>("/api/compose", { plan, data }, signal);

    const manifest: Manifest = {
      ...local.manifest,
      intent,
      data: {
        ...local.manifest.data,
        schemas: plan.schemas,
        networks: plan.networks,
        sources: data.resolution?.sources ?? local.manifest.data.sources,
        queries: plan.queries,
        variables: plan.variables,
      },
      ui: composed.ui,
      agency: { ...local.manifest.agency, tier: plan.tier },
      provenance: {
        model: plan.model,
        // `_meta.compute` is the backend that actually ran, read off
        // `getInferenceConfig()` inside the route. This used to be hardcoded to
        // "openai" whenever there was no attestation ref — so a plan produced by
        // the deterministic stub, with no model call at all, carried a
        // provenance record naming a model vendor. The fallback is "local",
        // which is the honest answer when the route did not say.
        compute:
          plan._meta?.compute ?? (plan.attestationRef ? "0g-private-computer" : "local"),
        attestationRef: plan.attestationRef,
        generatedAt: new Date().toISOString(),
      },
    };

    const degradations: string[] = [];
    if (plan._meta && !plan._meta.live) {
      degradations.push(
        "the plan came from the deterministic rules engine — no inference backend is configured, so no model chose these schemas",
      );
    }
    if (!data.live) {
      degradations.push(
        "the fan-out answered from fixtures — GRAPH_API_KEY is not set, so no deployment was actually queried",
      );
    }
    // A KEYED GATEWAY THAT QUERIED NOTHING is also a degradation, and it used to
    // slip through: `live: true` with `sourcesQueried: 0` reported success while
    // the health step read "0 of 0 live", which looks like a clean result rather
    // than an empty one. It happens for real — ask for "gas throughput on Base"
    // and the planner correctly resolves `network@1.2.0`, a family §13 verified as
    // having zero standardized deployments on any network. The right answer is
    // "The Graph does not cover this", not a composed interface over nothing.
    else if (data.sourcesQueried === 0) {
      degradations.push(
        "no deployment exists for the resolved schemas on the resolved networks — nothing was queried, so the interface below describes an empty result",
      );
    } else if (data.sourcesHealthy === 0) {
      degradations.push(
        `every deployment resolved for these schemas is down — ${data.sourcesQueried} probed, 0 answered`,
      );
    } else if (data.rows.length === 0) {
      degradations.push(
        "the deployments answered but returned no rows for this query shape — the figures below are not measurements of anything",
      );
    }

    return {
      manifest,
      steps: livePlanSteps(plan, data, composed),
      live: degradations.length === 0,
      degraded: degradations.length > 0 ? degradations.join("; ") : null,
    };
  } catch (error) {
    if (isAbort(error, signal)) return { ...local, live: false, degraded: null };
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ...local,
      live: false,
      degraded: `${step} failed — ${detail}. Showing a locally generated draft: its subgraph IDs, health flags and figures are invented, not measured. Press Run once published to replace them with a real query.`,
    };
  }
}

/** Plan steps built from what actually happened, not from a script. */
function livePlanSteps(
  plan: PlanResult,
  data: FanOutResponse,
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
      detail: `${plan.schemas.length} ${plan.schemas.length === 1 ? "family" : "families"} · ${plan.networks.join(", ")}`,
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
      // The fixture note rides along in the step the user is already reading.
      // `degraded` on the returned draft is the machine-readable version; this
      // is so the plan playback cannot narrate a gateway query that never went out.
      detail:
        `${data.rows.length} rows · ${data.elapsedMs}ms${data.costUsd > 0 ? ` · $${data.costUsd.toFixed(4)} x402` : ""}` +
        (data.live ? "" : " · from fixtures, not the gateway"),
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
      // `null`, never a placeholder handle. This was `"you.atlas-apps.eth"`,
      // which is not a name anyone owns — it rendered as "by you.atlas-apps.eth"
      // on the registry card and as PROVENANCE → AUTHOR on the app page, i.e. an
      // attribution to a fabricated ENS identity. The card already renders a null
      // author as "unclaimed", which is what an unsigned-in fork actually is.
      author: state.wallet,
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

  // Derived from what the PARENT actually held, not asserted from a literal.
  // This used to be a fixed list, so a fork of a seed app claimed an ENS name, an
  // Agentic ID and an attestation had been stripped — when the parent had none of
  // them and there was nothing to strip. Overstating a security guarantee is the
  // same class of error as overstating a capability, and it is worse here: §5
  // calls this stripping non-negotiable and §7 lists inheriting a funded wallet as
  // a named threat, so the list has to be exact or it teaches the reader to
  // discount it.
  const stripped: string[] = [];
  if (parent.manifest.identity.ens) stripped.push("ENS name");
  if (parent.manifest.identity.agenticId) stripped.push("Agentic ID");
  if (parent.manifest.identity.manifestCid) stripped.push("manifest CID");
  if (parent.manifest.provenance.attestationRef) stripped.push("attestation");
  if (parent.manifest.agency.policy.wallet) stripped.push("wallet");
  if (
    parent.manifest.agency.tier === "autonomous" &&
    parent.manifest.agency.policy.maxSpendUsd > 0
  ) {
    stripped.push(`spending authority ($${parent.manifest.agency.policy.maxSpendUsd} cap)`);
  }

  set({
    apps: [
      app,
      ...state.apps.map((a) =>
        a.manifest.name === parentName ? { ...a, stats: { ...a.stats, forks: a.stats.forks + 1 } } : a,
      ),
    ],
    ledger: [
      ...state.ledger,
      line(
        name,
        "POLICY",
        `forked from ${parent.manifest.name}@${parent.manifest.appVersion} · ` +
          (stripped.length > 0
            ? `cleared: ${stripped.join(", ")}`
            : "parent held no identity or authority, so there was nothing to clear"),
      ),
    ].slice(-LEDGER_MAX),
  });

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

    // `out.spentUsd` is the server's own `totalSpentUsd(appId)` — the lifetime
    // figure `remainingUsd` is computed against, and the only authority on it.
    // Reading it here matters now that the ledger ticker is gone: the ticker
    // used to be the sole writer of `stats.spentUsd`, adding invented swap
    // amounts, so deleting it would otherwise have left an app that really did
    // sign a transaction reporting $0 spent against its cap.
    //
    // `valueTransactedUsd` is deliberately left alone. Nothing server-side
    // reports notional volume separately from spend-against-cap, and the ticker
    // used to set the two equal — which is a guess dressed as two measurements.
    if (typeof out.spentUsd === "number") {
      const spentUsd = out.spentUsd;
      set({
        apps: state.apps.map((a) =>
          a.manifest.name === appId ? { ...a, stats: { ...a.stats, spentUsd } } : a,
        ),
      });
    }
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

export interface WatchOutcome {
  ok: boolean;
  mode: "substreams" | "interval";
  /** Blocks actually consumed. */
  blocks: number;
  /** Triggers that fired. */
  fired: number;
  entries: JournalEntry[];
  error?: string;
  /** Set when the server refused because no Substreams token is configured. */
  unavailable?: boolean;
}

/**
 * A real, bounded Substreams run: consume N blocks, evaluate the app's triggers
 * on each, fold the server's journal into the ledger.
 *
 * WHY THIS EXISTS. `/api/stream` has been complete since W2 and nothing in the
 * product ever called it, so no autonomous app was ever actually subscribed. The
 * gap was papered over by a client-side ticker that invented block numbers with
 * `Math.random()`. This is the real thing; the ticker is gone.
 *
 * WHY BOUNDED. Not a limitation we are hiding — read the header of
 * `app/api/stream/route.ts`. A serverless function has a wall clock, so an
 * unbounded subscription would work in `pnpm dev` and die in production. The
 * cursor is committed, so consecutive calls resume where the last one stopped
 * and no block is skipped. A long-lived worker is the correct home and is not
 * built.
 *
 * A 409 means no `SUBSTREAMS_API_TOKEN`: `unavailable: true`, and nothing
 * pretends a run happened. The interval-polling fallback the route describes
 * lives in the trigger loop, not here — claiming block-level latency while
 * polling is the same class of lie as an unattested provenance record.
 */
export async function watchBlocks(manifest: Manifest, blocks = 3): Promise<WatchOutcome> {
  const appId = manifest.name;
  const payload = {
    appId,
    // The app's own first network. `zBody` defaults to arbitrum-one and would
    // silently watch the wrong chain for an Optimism-only app.
    network: manifest.data.networks[0] ?? "arbitrum-one",
    // The route caps at 20. Clamp here so an out-of-range ask becomes a shorter
    // run rather than a 400 the user has to interpret.
    blocks: Math.max(1, Math.min(20, Math.round(blocks))),
  };

  const post = () =>
    fetch("/api/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

  try {
    let res = await post();

    // Same 404 as `/api/act`: the server has never seen this manifest because
    // apps are published locally today. Seed the registry from it, then retry
    // once — identical to `dispatchAction`, deliberately.
    if (res.status === 404) {
      await fetch("/api/agency/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manifest }),
      });
      res = await post();
    }

    const body = (await res.json().catch(() => ({}))) as StreamResponse;
    mergeJournal(appId, body.entries ?? []);

    if (res.status === 409) {
      const reason = body.error ?? "no Substreams token configured";
      set({
        ledger: [
          ...state.ledger,
          line(appId, "ERROR", `cannot subscribe — ${reason}`, { ok: false }),
        ].slice(-LEDGER_MAX),
      });
      return {
        ok: false,
        mode: body.mode ?? "interval",
        blocks: 0,
        fired: 0,
        entries: body.entries ?? [],
        unavailable: true,
        error: reason,
      };
    }

    if (!res.ok || !body.ok || !body.summary) {
      const detail = [body.error, body.detail].filter(Boolean).join(" — ") || `stream → ${res.status}`;
      set({
        ledger: [
          ...state.ledger,
          line(appId, "ERROR", `subscription failed — ${detail}`, { ok: false }),
        ].slice(-LEDGER_MAX),
      });
      return {
        ok: false,
        mode: body.mode ?? "substreams",
        blocks: 0,
        fired: 0,
        entries: body.entries ?? [],
        error: detail,
      };
    }

    const s = body.summary;
    // Nothing summarised here that the journal did not already record. This line
    // exists so a run that fired nothing still leaves a receipt — "watched 3
    // blocks, no trigger crossed" is a result, not an absence of one.
    const span =
      s.firstBlock !== null && s.lastBlock !== null
        ? ` · blocks ${s.firstBlock.toLocaleString("en-US")}–${s.lastBlock.toLocaleString("en-US")}`
        : "";
    set({
      ledger: [
        ...state.ledger,
        line(
          appId,
          "STREAM",
          `watched ${s.ticks} block${s.ticks === 1 ? "" : "s"}${span} · ${s.firings} trigger${s.firings === 1 ? "" : "s"} fired · ${s.executed} executed · ${s.rejected} rejected` +
            (s.undos > 0 ? ` · ${s.undos} reorg${s.undos === 1 ? "" : "s"}` : ""),
        ),
      ].slice(-LEDGER_MAX),
    });

    return {
      ok: true,
      mode: body.mode ?? "substreams",
      blocks: s.ticks,
      fired: s.firings,
      entries: body.entries ?? [],
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown";
    set({
      ledger: [
        ...state.ledger,
        line(appId, "ERROR", `subscription failed — ${detail}`, { ok: false }),
      ].slice(-LEDGER_MAX),
    });
    return { ok: false, mode: "substreams", blocks: 0, fired: 0, entries: [], error: detail };
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

export interface RunOutcome {
  ok: boolean;
  /** False when the answer came from fixtures rather than the gateway. */
  live: boolean;
  rows: number;
  sourcesQueried: number;
  sourcesHealthy: number;
  costUsd: number;
  elapsedMs: number;
  error?: string;
}

const RUN_FAILED: RunOutcome = {
  ok: false,
  live: false,
  rows: 0,
  sourcesQueried: 0,
  sourcesHealthy: 0,
  costUsd: 0,
  elapsedMs: 0,
};

/**
 * Press Run and the app re-queries The Graph and re-composes its own interface.
 *
 * This is PRD §5's central property — a mini app is a live plan, not a
 * screenshot — and it was the one thing `runApp` did not do. It used to bump a
 * counter and append a ledger line *claiming* a query, built out of stats stored
 * from whenever the manifest was written. No request left the browser, so a run
 * against a subgraph that had died six hours earlier reported the same
 * "31 of 31 live" as the day it was published.
 *
 * Now: rebuild the plan from the app's own manifest, fan out, re-compose, and
 * write back only measured values. `data.resolution.sources` re-health-checks
 * the deployments in the same round trip, so `sourcesHealthy` is a fact with a
 * timestamp on it.
 *
 * `manifest.updatedAt` is deliberately NOT bumped. The pinned artifact at
 * `identity.manifestCid` is what the ENS name resolves to and it has not
 * changed; the re-composed `ui` and re-probed `sources` are this browser's live
 * view of it. Bumping the stamp would claim the published document moved.
 */
export async function runApp(name: string): Promise<RunOutcome> {
  const app = state.apps.find((a) => a.manifest.name === name);
  if (!app) return { ...RUN_FAILED, error: `unknown mini app "${name}"` };

  const m = app.manifest;
  // The plan is reconstructed from the manifest rather than re-planned: the
  // whole point of pinning `queries` and `variables` is that a run is
  // reproducible without going back through inference.
  const plan: PlanResult = {
    intent: m.intent,
    schemas: m.data.schemas,
    networks: m.data.networks,
    queries: m.data.queries,
    variables: m.data.variables,
    tier: m.agency.tier,
    attestationRef: m.provenance.attestationRef,
    model: m.provenance.model,
  };

  const started = Date.now();
  try {
    const data = await postJson<FanOutResponse>("/api/graph", { action: "fanout", plan });
    const composed = await postJson<ComposeResult>("/api/compose", { plan, data });
    // Wall clock for the whole run — fan-out plus compose. `data.elapsedMs` is
    // the fan-out's own measure of just the parallel queries.
    const elapsedMs = Date.now() - started;
    const ranAt = new Date().toISOString();
    const sources = data.resolution?.sources ?? m.data.sources;
    const dead = data.sourcesQueried - data.sourcesHealthy;

    const message =
      `${m.data.schemas.join(" + ")} — ${data.rows.length} rows from ${data.sourcesHealthy} of ${data.sourcesQueried} deployments` +
      (dead > 0 ? ` · skipped ${dead}` : "") +
      ` · ${elapsedMs}ms` +
      (data.costUsd > 0 ? ` · $${data.costUsd.toFixed(4)} x402` : "") +
      // Non-negotiable. A fixture answer that reads like a gateway answer is
      // the exact failure this product is arguing against.
      (data.live ? "" : " · FIXTURES — gateway not keyed, no deployment queried");

    set({
      apps: state.apps.map((a) =>
        a.manifest.name === name
          ? {
              ...a,
              manifest: { ...a.manifest, data: { ...a.manifest.data, sources }, ui: composed.ui },
              stats: {
                ...a.stats,
                runs: a.stats.runs + 1,
                sourcesQueried: data.sourcesQueried,
                sourcesHealthy: data.sourcesHealthy,
                costPerRunUsd: data.costUsd,
              },
              lastRunAt: ranAt,
            }
          : a,
      ),
      ledger: [...state.ledger, line(name, "QUERY", message, { ok: true })].slice(-LEDGER_MAX),
    });

    return {
      ok: true,
      live: data.live,
      rows: data.rows.length,
      sourcesQueried: data.sourcesQueried,
      sourcesHealthy: data.sourcesHealthy,
      costUsd: data.costUsd,
      elapsedMs,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // A failed run journals the failure. It does not bump `runs`, does not touch
    // `lastRunAt`, and does not leave the previous run's numbers looking fresh.
    set({
      ledger: [
        ...state.ledger,
        line(name, "ERROR", `run failed — ${detail}`, { ok: false }),
      ].slice(-LEDGER_MAX),
    });
    return { ...RUN_FAILED, elapsedMs: Date.now() - started, error: detail };
  }
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

/**
 * Mirrors the signed-in user's address into board state. Privy owns the truth —
 * this is a read-only projection of it, written by `PrivyWalletBridge` and by
 * nothing else. There is deliberately no `connectWallet()` here: a store cannot
 * connect a wallet, only observe that one is connected, and the stub that used
 * to live at this line toggled a hardcoded address that looked exactly like a
 * successful connect while authenticating nobody.
 *
 * Holds the full address. Callers that show it truncate at the edge, because
 * authorship (`newApp`, `rateApp`) wants the whole thing.
 */
export function setWallet(address: string | null): void {
  if (state.wallet === address) return; // Idempotent: the bridge re-runs on every Privy tick.
  set({ wallet: address });
}

/* ------------------------------------------------------------------ *
 * NO LEDGER TICKER.
 *
 * A `useLedgerTicker` hook used to live here. Every 4.2 seconds it appended a
 * plausible line to the board: a block number from `Math.random()`, a tx hash
 * from `Math.random()`, a swap amount derived from the policy cap — and it added
 * that invented spend to `stats.spentUsd` and `stats.valueTransactedUsd`, which
 * the header, the app cards and the ledger's "spent, last 24h" all presented as
 * real money moved. The board looked most alive precisely when it was lying.
 *
 * The ledger now starts empty and fills only from things that happened:
 * `runApp` (a real fan-out), `watchBlocks` (a real bounded Substreams run),
 * `dispatchAction` and `haltRemote` (the real policy gate), and `publishApp`.
 * `LedgerBody`'s "no activity yet" is the correct cold state, not a bug to hide.
 * If the board should read as busy, the fix is to make an agent do something,
 * not to narrate one that isn't.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Derived views
 * ------------------------------------------------------------------ */

export function myApps(board: BoardState): MiniApp[] {
  return board.apps
    .filter((a) => a.mine)
    .slice()
    .sort((a, b) => tierRank(a.manifest.agency.tier) - tierRank(b.manifest.agency.tier) || a.manifest.name.localeCompare(b.manifest.name));
}

/**
 * ARMED, not live — and the rename is the point, not tidying.
 *
 * `MiniApp.running` was documented as "subscribed to a stream right now" and this
 * function counted it under the name `liveCount`, which the top bar rendered as
 * "N live" behind a pulsing `--live` lamp. Nothing was subscribed: until
 * `watchBlocks` landed, `POST /api/stream` had no callers anywhere in the product,
 * and the matching "block NNN matched" ledger lines were manufactured by a
 * fabricated ticker (deleted — see the note above).
 *
 * What is true is weaker and still worth saying: the app is published, is not
 * halted, and holds standing authority to act if a trigger fires (§7). That is
 * armed. Live is reserved for a bounded Substreams run that is open at this
 * moment, which only `watchBlocks` opens and only for the seconds it runs — and
 * which nothing on the client holds state for, so a board-level *live* count
 * would have no fact behind it and deliberately does not exist.
 *
 * This matters beyond wording: §10 stakes the whole Substreams argument on
 * per-block evaluation beating polling, and spending that argument's credibility
 * on a lamp is a bad trade.
 */
export function isArmed(app: MiniApp): boolean {
  return (
    app.running &&
    app.manifest.agency.tier !== "readonly" &&
    !app.manifest.agency.policy.halted
  );
}

export function armedCount(board: BoardState): number {
  return board.apps.filter((a) => a.mine && isArmed(a)).length;
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
