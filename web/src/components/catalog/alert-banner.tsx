"use client";

/**
 * alert_banner — data shape: `triggered_condition`. A monitor-tier app's whole
 * reason to exist: something crossed a line and you need to know.
 *
 * Composer payload:
 *   { triggered: boolean, severity: "loss"|"risk", condition, operator?,
 *     value, threshold, message, title, reason }
 * A monitor/autonomous app always carries one of these even when nothing has
 * fired — `triggered: false` is the standing "watching" state, not an empty
 * panel. Also accepts { severity, title, message, at, source }.
 *
 * Severity maps straight onto the contract colours: `--live` for informational
 * (a subscription fired), `--risk` for approaching, `--loss` for breached,
 * `--gain` for resolved. No fifth "warning purple" — violet is spend only.
 */

import { Fig, Label, Stamp, Tag, useRuntime, tierPanelClass, fmtValue, toneVar, type Tone } from "@/components/brutal";
import { cn } from "@/lib/utils";
import { bool, dict, pickNum, pickStr, unitOf, type CatProps } from "./_shared";

const SEV: Record<string, Tone> = {
  info: "live",
  live: "live",
  warn: "risk",
  risk: "risk",
  warning: "risk",
  critical: "loss",
  error: "loss",
  loss: "loss",
  breach: "loss",
  ok: "gain",
  gain: "gain",
  resolved: "gain",
};

export function AlertBanner({ data, label, index }: CatProps) {
  const d = dict(data);
  const { tier } = useRuntime();
  const sev = pickStr(d, ["severity", "level", "kind", "status"], "info").toLowerCase();
  // `triggered: false` is the standing watch state; it should never read red.
  const fired = d.triggered === undefined ? true : bool(d.triggered);
  const tone: Tone = fired ? (SEV[sev] ?? "live") : "risk";
  const title =
    label ?? pickStr(d, ["title", "label", "headline", "condition"], "Condition triggered");
  const message = pickStr(d, ["message", "body", "detail", "description"]);
  const at = pickStr(d, ["at", "ts", "timestamp", "firedAt"]);
  const source = pickStr(d, ["source", "trigger", "protocol"]);
  const value = pickNum(d, ["value", "current"]);
  const threshold = pickNum(d, ["threshold", "limit", "target"]);
  const unit = unitOf(d);

  return (
    <section
      className={cn(tierPanelClass(tier), "snap-in flex min-w-0 items-stretch")}
      style={{ ["--i"]: index ?? 0 } as React.CSSProperties}
    >
      {/* A solid severity bar on the leading edge — reads before the text does. */}
      <div
        aria-hidden
        className="w-2.5 shrink-0 border-r-[1.5px] border-rule"
        style={{ background: toneVar[tone] }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Tag tone={tone}>{fired ? sev : "watching"}</Tag>
            <h3 className="display truncate text-[0.8125rem] leading-tight">{title}</h3>
          </div>
          {at ? <Stamp at={at} /> : null}
        </div>
        {message ? <p className="text-[0.8125rem] leading-snug">{message}</p> : null}
        {(Number.isFinite(value) || Number.isFinite(threshold) || source) && (
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            {Number.isFinite(value) ? (
              <Label>
                observed{" "}
                <Fig size="xs" tone={tone}>
                  {fmtValue(value, unit)}
                </Fig>
              </Label>
            ) : null}
            {Number.isFinite(threshold) ? (
              <Label>
                threshold <Fig size="xs">{fmtValue(threshold, unit)}</Fig>
              </Label>
            ) : null}
            {source ? <Label>via {source}</Label> : null}
          </div>
        )}
      </div>
    </section>
  );
}
