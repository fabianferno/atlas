"use client";

/**
 * trade_log — the action journal, styled as a receipt. Non-negotiable in an
 * autonomous app: an agent that spends must show its work.
 *
 * { entries: JournalEntry[] }  // contracts/policy.ts
 *   JournalEntry = { ts, kind: QUERY|STREAM|TRIGGER|POLICY|ACTION|ERROR,
 *                    message, spentUsd?, txHash?, ok }
 *
 * Mono throughout, newest first, one line per event. `--spend` violet appears
 * on exactly the lines that moved value and nowhere else — that is what makes
 * "did this thing spend today?" a glance rather than a question (Rule 2).
 */

import { Panel, Fig, Label, Empty, Tag, fmtTime, fmtUsd, shortAddr } from "@/components/brutal";
import { cn } from "@/lib/utils";
import { bool, dict, num, pickStr, rowsOf, str, type CatProps } from "./_shared";
import type { JournalEntry } from "@/lib/contracts/policy";

const KIND_TONE: Record<string, string> = {
  QUERY: "text-[var(--muted-ink)]",
  STREAM: "text-live",
  TRIGGER: "text-live",
  POLICY: "text-ink",
  ACTION: "text-ink",
  ERROR: "text-loss",
};

function readEntry(v: unknown): JournalEntry {
  const o = dict(v);
  const kindRaw = pickStr(o, ["kind", "type"], "QUERY").toUpperCase();
  const kind = (["QUERY", "STREAM", "TRIGGER", "POLICY", "ACTION", "ERROR"] as const).includes(
    kindRaw as JournalEntry["kind"],
  )
    ? (kindRaw as JournalEntry["kind"])
    : "QUERY";
  const spent = num(o.spentUsd ?? o.spent, NaN);
  return {
    ts: pickStr(o, ["ts", "at", "timestamp", "time"], ""),
    kind,
    message: pickStr(o, ["message", "msg", "text", "detail"], ""),
    spentUsd: Number.isFinite(spent) ? spent : undefined,
    txHash: pickStr(o, ["txHash", "hash", "tx"]) || undefined,
    ok: bool(o.ok, kind !== "ERROR"),
  };
}

export function TradeLog({ data, label, index }: CatProps) {
  const d = dict(data);
  const entries = rowsOf(data, "entries", "journal", "log", "rows", "items").map(readEntry);
  const title = label ?? pickStr(d, ["label", "title"], "Action journal");

  const spentTotal = entries.reduce((s, e) => s + (e.spentUsd ?? 0), 0);
  const moved = entries.filter((e) => (e.spentUsd ?? 0) > 0).length;

  return (
    <Panel
      index={index}
      title={title}
      flush
      meta={
        <>
          <Fig size="xs" className="text-[var(--muted-ink)]">
            {entries.length} events
          </Fig>
          {spentTotal > 0 ? (
            <Tag tone="spend">{fmtUsd(spentTotal, false)} spent</Tag>
          ) : (
            <Tag tone="gain">no spend</Tag>
          )}
        </>
      }
    >
      {entries.length === 0 ? (
        <div className="p-3">
          <Empty what="journal empty — nothing has run yet" />
        </div>
      ) : (
        <ol className="flex flex-col">
          {entries.map((e, i) => {
            const spend = (e.spentUsd ?? 0) > 0;
            return (
              <li
                key={`${e.ts}-${i}`}
                className={cn(
                  "grid grid-cols-[4.5rem_4.25rem_1fr_auto] items-baseline gap-x-2 px-3 py-1 text-[0.75rem]",
                  "border-b border-hairline last:border-b-0",
                  spend && "border-l-[3px] border-l-spend",
                )}
              >
                <Fig size="xs" className="text-[var(--muted-ink)]">
                  {e.ts ? fmtTime(e.ts) : "--:--:--"}
                </Fig>
                <Fig
                  size="xs"
                  className={cn("font-semibold tracking-[0.04em]", KIND_TONE[e.kind])}
                >
                  {e.kind}
                </Fig>
                <span className="mono min-w-0 break-words text-[0.75rem] leading-snug">
                  {e.message}
                  {e.txHash ? (
                    <span className="ml-1.5 text-[var(--muted-ink)]" title={e.txHash}>
                      {shortAddr(e.txHash, 8, 6)}
                    </span>
                  ) : null}
                </span>
                <span className="flex items-baseline gap-1.5 justify-self-end">
                  {spend ? (
                    <Fig size="xs" tone="spend" className="font-semibold">
                      −{fmtUsd(e.spentUsd ?? 0, false)}
                    </Fig>
                  ) : null}
                  <span
                    aria-label={e.ok ? "ok" : "failed"}
                    className={cn(
                      "inline-block h-2 w-2 border border-rule",
                      e.ok ? "bg-gain" : "bg-loss",
                    )}
                  />
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {/* Receipt foot. Dashed rule reads as a tear-off. */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t-2 border-dashed border-rule px-3 py-1.5">
        <Label>
          {moved} line{moved === 1 ? "" : "s"} moved value
        </Label>
        <Fig size="sm" tone={spentTotal > 0 ? "spend" : "neutral"}>
          total {fmtUsd(spentTotal, false)}
        </Fig>
      </div>
      {str(d.note) ? (
        <div className="px-3 pb-2 text-[0.625rem] text-[var(--muted-ink)]">{str(d.note)}</div>
      ) : null}
    </Panel>
  );
}
