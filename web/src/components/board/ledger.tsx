"use client";

/**
 * The Ledger — every agent action as a receipt.
 *
 * Mono, timestamped, cost per query, violet on any line that spent. This is
 * how background autonomy stays visible: an agent that moves money leaves a
 * line here whether or not anyone was looking at its app.
 */
import { useEffect, useRef } from "react";
import Link from "next/link";
import type { JournalEntry } from "@/lib/contracts/policy";
import type { LedgerLine } from "@/lib/seed";
import { fmtTime, fmtUsd, shortHash, spentToday, useBoard, useLedgerTicker } from "@/lib/store";
import { Label, LiveDot, SectionHead } from "@/components/board/chrome";
import { cn } from "@/lib/utils";

const KIND_STYLE: Record<JournalEntry["kind"], { color: string }> = {
  QUERY: { color: "var(--muted-ink)" },
  STREAM: { color: "var(--live)" },
  TRIGGER: { color: "var(--ink)" },
  POLICY: { color: "var(--ink)" },
  ACTION: { color: "var(--spend)" },
  ERROR: { color: "var(--loss)" },
};

/**
 * Drives the background feed. Mount once per page — running agents keep
 * writing to the ledger whether or not their app is open.
 */
export function LedgerTicker() {
  useLedgerTicker();
  return null;
}

export function Ledger({ limit = 60, appName }: { limit?: number; appName?: string }) {
  const board = useBoard();
  const lines = board.ledger
    .filter((l) => (appName ? l.app === appName : true))
    .slice(-limit)
    .reverse();
  const spent = spentToday(board);

  return (
    <section className="panel flex min-h-0 flex-col p-3">
      <SectionHead
        title="Ledger"
        note={`${lines.length} lines`}
        right={board.halted ? null : <LiveDot label="streaming" />}
      />

      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--hairline)] py-2">
        <Label>Spent, last 24h</Label>
        <span className="fig text-sm font-semibold" style={{ color: spent > 0 ? "var(--spend)" : "var(--ink)" }}>
          {fmtUsd(spent)}
        </span>
      </div>

      <ol className="-mx-1 mt-1 max-h-[52vh] min-h-0 flex-1 overflow-y-auto px-1 lg:max-h-[calc(100vh-320px)]">
        {lines.map((l) => (
          <LedgerRow key={l.id} line={l} showApp={!appName} />
        ))}
        {lines.length === 0 ? (
          <li className="mono py-4 text-center text-[0.6875rem] text-[var(--muted-ink)]">
            no activity yet
          </li>
        ) : null}
      </ol>
    </section>
  );
}

function LedgerRow({ line, showApp }: { line: LedgerLine; showApp: boolean }) {
  const spent = line.spentUsd !== undefined && line.spentUsd > 0;
  const failed = !line.ok;
  return (
    <li
      className="border-t border-[var(--hairline)] py-1.5 first:border-t-0"
      style={spent ? { color: "var(--spend)" } : failed ? { color: "var(--loss)" } : undefined}
    >
      <div className="flex items-baseline gap-2">
        <span className="mono shrink-0 text-[0.625rem] text-[var(--muted-ink)]">{fmtTime(line.ts)}</span>
        <span
          className="mono shrink-0 text-[0.5625rem] uppercase tracking-[0.08em]"
          style={spent || failed ? undefined : KIND_STYLE[line.kind]}
        >
          {line.kind}
        </span>
        {showApp && line.app !== "system" ? (
          <Link href={`/a/${line.app}`} className="mono shrink-0 truncate text-[0.625rem] underline underline-offset-2">
            {line.app}
          </Link>
        ) : null}
        {spent ? (
          <span className="mono ml-auto shrink-0 text-[0.625rem] font-semibold">−{fmtUsd(line.spentUsd ?? 0)}</span>
        ) : null}
      </div>
      <div className={cn("mono mt-0.5 break-words text-[0.6875rem] leading-snug", !spent && !failed && "text-[var(--ink)]")}>
        {line.message}
      </div>
      {line.txHash ? (
        <div className="mono mt-0.5 text-[0.5625rem] opacity-70">tx {shortHash(line.txHash, 10, 6)}</div>
      ) : null}
    </li>
  );
}

/** Trade log for one mini app. Always present in the autonomous tier. */
export function TradeLog({ appName }: { appName: string }) {
  const board = useBoard();
  const app = board.apps.find((a) => a.manifest.name === appName);
  const listRef = useRef<HTMLOListElement>(null);

  const journal = app?.journal ?? [];
  const fromLedger = board.ledger.filter((l) => l.app === appName);
  const merged: LedgerLine[] = [
    ...journal.map((entry, i) => ({ ...entry, id: `${appName}-j${i}`, app: appName })),
    ...fromLedger,
  ]
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
    .slice(0, 40);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [merged.length]);

  return (
    <section className="panel p-3">
      <SectionHead title="Trade log" note={`${merged.length} entries`} />
      <ol ref={listRef} className="-mx-1 mt-1 max-h-72 overflow-y-auto px-1">
        {merged.map((l) => (
          <LedgerRow key={l.id} line={l} showApp={false} />
        ))}
        {merged.length === 0 ? (
          <li className="mono py-4 text-center text-[0.6875rem] text-[var(--muted-ink)]">
            nothing recorded yet
          </li>
        ) : null}
      </ol>
    </section>
  );
}
