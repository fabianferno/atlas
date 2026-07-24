"use client";

/**
 * metric_card — data shape: `scalar` / `scalar_with_delta`.
 *
 * Composer payload (lib/kit/composer.ts `buildPayload`):
 *   { shape, title, reason, confidence, rowCount,
 *     value: number|null, delta: number|null, label, unit }
 *
 * `delta` on a `scalar_with_delta` block is a FRACTION — `(last - first) /
 * |first|` — not a percentage and not an absolute. Rendering it as an absolute
 * would silently report 0.12 where the truth is +12%. Any other shape's
 * `delta` is a raw column value and is rendered as an absolute.
 *
 * `hints.accent === "spend"` is the only thing that turns this violet, and the
 * composer only sets it on a held position in an autonomous app (Rule 2).
 */

import { Panel, Label, Fig, Delta, Empty, fmtValue, Tag } from "@/components/brutal";
import { dict, pick, pickNum, pickStr, str, bool, num, hintsOf, unitOf, type CatProps } from "./_shared";

export function MetricCard({ id, data, label, index }: CatProps) {
  const d = dict(data);
  const hints = hintsOf(d);
  const rawValue = pick(d, "value", "amount", "total", "v");
  const title = label ?? pickStr(d, ["label", "title", "name"], "");
  const unit = unitOf(d);
  const shape = pickStr(d, ["shape"]);

  const deltaRaw = pickNum(d, ["deltaPct", "changePct", "pctChange"]);
  const deltaFraction = pickNum(d, ["delta", "change"]);
  const isFractionDelta = shape === "scalar_with_delta" || shape === "scalar";

  const sub = pickStr(d, ["sublabel", "caption", "context", "note"]);
  const invert = bool(pick(d, "invertDelta", "lowerIsBetter"));
  const spend = bool(pick(d, "spend", "isSpend")) || hints.accent === "spend";
  const source = pickStr(d, ["source", "protocol", "network"]);

  if (rawValue === undefined || rawValue === null) {
    return (
      <Panel title={title || "metric"} index={index}>
        <Empty what={`no value at ${id}`} />
      </Panel>
    );
  }

  const n = num(rawValue);
  const display = Number.isFinite(n) ? fmtValue(n, unit) : str(rawValue, "—");

  const pct = Number.isFinite(deltaRaw)
    ? deltaRaw
    : isFractionDelta && Number.isFinite(deltaFraction)
      ? deltaFraction * 100
      : NaN;

  return (
    <Panel index={index} title={title} meta={source ? <Tag>{source}</Tag> : undefined}>
      <div className="flex flex-col gap-1">
        <Fig size="xl" tone={spend ? "spend" : "neutral"}>
          {display}
        </Fig>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {Number.isFinite(pct) ? (
            <Delta pct={pct} invert={invert} />
          ) : Number.isFinite(deltaFraction) ? (
            <Delta pct={0} abs={fmtValue(deltaFraction, unit)} invert={invert} />
          ) : null}
          {sub ? <Label className="normal-case tracking-normal">{sub}</Label> : null}
        </div>
      </div>
    </Panel>
  );
}
