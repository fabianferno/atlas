"use client";

/**
 * progress_bar — data shape: `scalar_vs_target`.
 *
 * { value, target, label?, unit?, spend?: boolean, deadline? }
 *
 * Also the shape a policy spend cap takes ("$312 of $500 lifetime cap"), which
 * is why `spend: true` paints the fill violet. That is the only legal use of
 * violet here (Rule 2) and it is what makes a spend cap readable at a glance.
 */

import { Panel, Fig, Label, Empty, useNow, fmtValue, fmtUntil } from "@/components/brutal";
import { cn } from "@/lib/utils";
import { clamp, dict, pickNum, pickStr, bool, pick, str, unitOf, type CatProps } from "./_shared";

export function ProgressBar({ data, label, index }: CatProps) {
  const d = dict(data);
  const now = useNow();
  const value = pickNum(d, ["value", "current", "spent", "v"]);
  const target = pickNum(d, ["target", "cap", "goal", "max", "limit"]);
  const title = label ?? pickStr(d, ["label", "title", "name"], "");
  const unit = unitOf(d);
  const spend = bool(pick(d, "spend", "isSpend"));
  const deadline = str(pick(d, "deadline", "expiresAt"));

  if (!Number.isFinite(value) || !Number.isFinite(target) || target === 0) {
    return (
      <Panel title={title || "progress"} index={index}>
        <Empty what="no target" />
      </Panel>
    );
  }

  const frac = clamp(value / target, 0, 1);
  const over = value > target;
  const nearing = frac >= 0.85;

  return (
    <Panel title={title} index={index}>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <Fig size="lg" tone={spend ? "spend" : over ? "loss" : "neutral"}>
            {fmtValue(value, unit)}
          </Fig>
          <Fig size="sm" className="text-[var(--muted-ink)]">
            / {fmtValue(target, unit)}
          </Fig>
        </div>

        <div className="relative h-5 w-full border-[1.5px] border-rule bg-[var(--card-b)]">
          <div
            className={cn(
              "h-full",
              spend ? "bg-spend" : over ? "bg-loss" : nearing ? "bg-[var(--risk)]" : "bar",
            )}
            style={{ width: `${frac * 100}%` }}
          />
          {/* Ticks at quarters — reading a proportion needs reference marks. */}
          {[0.25, 0.5, 0.75].map((t) => (
            <span
              key={t}
              aria-hidden
              className="absolute top-0 h-full w-px bg-rule/25"
              style={{ left: `${t * 100}%` }}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Label>{(frac * 100).toFixed(1)}% of target</Label>
          {deadline && now > 0 ? (
            <Fig size="xs" className="text-[var(--muted-ink)]">
              resets {fmtUntil(deadline, new Date(now))}
            </Fig>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
