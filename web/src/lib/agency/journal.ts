/**
 * W6 — THE ACTION JOURNAL.
 *
 * Append-only, per mini app. Backs the on-screen trade log (W8): every query,
 * every stream tick, every trigger, every policy decision and every signature
 * lands here, in order. Rejections are journalled exactly like executions — a
 * refused action is the most reassuring line in the log, so it is never hidden.
 *
 * `spentUsd` is set on anything that actually moved value. The UI renders those
 * lines in --spend violet, and `totalSpentUsd()` is what the policy engine
 * meters the lifetime cap against, so a line that lies here breaks the cap.
 * Only successful ACTION entries count.
 *
 * Storage is an interface on purpose: `MemoryJournalStore` is what runs today,
 * and a 0G Storage implementation (W9) can be dropped in behind the same three
 * methods without touching a caller.
 */
import type { JournalEntry } from "@/lib/contracts/policy";

export type JournalKind = JournalEntry["kind"];

/** Everything except `ts`, which the store stamps. */
export interface JournalInput {
  kind: JournalKind;
  message: string;
  ok: boolean;
  spentUsd?: number;
  txHash?: string;
}

export interface JournalStore {
  /** Appends and returns the stored (frozen) entry. Never mutates or deletes. */
  append(appId: string, input: JournalInput): Promise<JournalEntry>;
  /** Oldest first. `limit` keeps the most recent N. */
  list(appId: string, limit?: number): Promise<JournalEntry[]>;
  /** Cumulative USD actually spent — successful, value-moving entries only. */
  totalSpentUsd(appId: string): Promise<number>;
  /** Every app id with at least one entry. Debug + registry hydration. */
  appIds(): Promise<string[]>;
}

/** Sanitises untrusted strings before they reach the log. */
const MAX_MESSAGE_LEN = 500;

/**
 * Journal messages routinely contain indexed onchain data — token names, ENS
 * text records, memos — all of which are attacker-controlled. The journal is
 * rendered as text and is never fed back to the planner, but strip control
 * characters and clamp length anyway so a hostile token symbol cannot forge log
 * lines with embedded newlines.
 */
export function sanitizeMessage(raw: string): string {
  const flattened = raw.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim();
  return flattened.length > MAX_MESSAGE_LEN
    ? `${flattened.slice(0, MAX_MESSAGE_LEN - 1)}…`
    : flattened;
}

function freezeEntry(input: JournalInput, ts: string): JournalEntry {
  const entry: JournalEntry = {
    ts,
    kind: input.kind,
    message: sanitizeMessage(input.message),
    ok: input.ok,
  };
  if (typeof input.spentUsd === "number" && Number.isFinite(input.spentUsd) && input.spentUsd > 0) {
    entry.spentUsd = input.spentUsd;
  }
  if (input.txHash) entry.txHash = input.txHash;
  return Object.freeze(entry);
}

/**
 * In-memory, append-only. Entries are frozen and `list()` returns a copy, so a
 * caller cannot retroactively edit history — which matters, because history is
 * what the lifetime cap is computed from.
 */
export class MemoryJournalStore implements JournalStore {
  private readonly entries = new Map<string, JournalEntry[]>();

  async append(appId: string, input: JournalInput): Promise<JournalEntry> {
    const entry = freezeEntry(input, new Date().toISOString());
    const log = this.entries.get(appId) ?? [];
    log.push(entry);
    this.entries.set(appId, log);
    return entry;
  }

  async list(appId: string, limit?: number): Promise<JournalEntry[]> {
    const log = this.entries.get(appId) ?? [];
    return limit && limit > 0 ? log.slice(-limit) : [...log];
  }

  async totalSpentUsd(appId: string): Promise<number> {
    const log = this.entries.get(appId) ?? [];
    return log.reduce(
      (sum, e) => (e.ok && e.kind === "ACTION" && e.spentUsd ? sum + e.spentUsd : sum),
      0,
    );
  }

  async appIds(): Promise<string[]> {
    return [...this.entries.keys()];
  }
}

/**
 * Process-wide singleton, cached on globalThis so Next's dev server keeps one
 * journal across hot reloads instead of silently resetting the spend meter.
 */
const GLOBAL_KEY = "__atlas_journal__";
type JournalGlobal = typeof globalThis & { [GLOBAL_KEY]?: JournalStore };

export function getJournal(): JournalStore {
  const g = globalThis as JournalGlobal;
  g[GLOBAL_KEY] ??= new MemoryJournalStore();
  return g[GLOBAL_KEY];
}

/** Swap in the 0G Storage store (W9) at boot. */
export function setJournal(store: JournalStore): void {
  (globalThis as JournalGlobal)[GLOBAL_KEY] = store;
}

/* ------------------------------------------------------------------ *
 * Typed helpers — keep `kind` honest at every call site.
 * ------------------------------------------------------------------ */

export const journal = {
  query: (store: JournalStore, appId: string, message: string, ok = true) =>
    store.append(appId, { kind: "QUERY", message, ok }),

  stream: (store: JournalStore, appId: string, message: string, ok = true) =>
    store.append(appId, { kind: "STREAM", message, ok }),

  trigger: (store: JournalStore, appId: string, message: string, ok = true) =>
    store.append(appId, { kind: "TRIGGER", message, ok }),

  policy: (store: JournalStore, appId: string, message: string, ok: boolean) =>
    store.append(appId, { kind: "POLICY", message, ok }),

  /** `spentUsd` marks the line as value-moving; it is what the cap meters. */
  action: (
    store: JournalStore,
    appId: string,
    message: string,
    opts: { spentUsd?: number; txHash?: string; ok?: boolean } = {},
  ) =>
    store.append(appId, {
      kind: "ACTION",
      message,
      ok: opts.ok ?? true,
      spentUsd: opts.spentUsd,
      txHash: opts.txHash,
    }),

  error: (store: JournalStore, appId: string, message: string) =>
    store.append(appId, { kind: "ERROR", message, ok: false }),
};
