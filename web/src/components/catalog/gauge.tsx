"use client";

/**
 * gauge — data shape: `bounded_ratio`. Health factors, utilisation, LTV.
 *
 * Composer payload: { value, min, max, target, label, unit }
 *   `target` is the threshold the question was about and maps to `riskAt`.
 * Also accepts explicit { riskAt, dangerAt, lowerIsBetter }.
 *
 * The colour here is the whole point: a health factor is the number that tells
 * you whether an autonomous app is about to get liquidated. Green / amber / red
 * are `--gain` / `--risk` / `--loss` with their contract meanings, not a
 * gradient.
 */

import { Panel, Empty, Fig, Label, toneVar, type Tone } from "@/components/brutal";
import { clamp, dict, numOr, pickNum, pickStr, bool, num, pick, unitOf, type CatProps } from "./_shared";

/** Polar → cartesian on a 180° arc, 180° = left, 0° = right. */
function pt(cx: number, cy: number, r: number, frac: number) {
  const a = Math.PI * (1 - clamp(frac, 0, 1));
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a = pt(cx, cy, r, from);
  const b = pt(cx, cy, r, to);
  const large = Math.abs(to - from) > 0.5 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

export function Gauge({ data, label, index }: CatProps) {
  const d = dict(data);
  const value = pickNum(d, ["value", "v", "ratio", "healthFactor", "utilization"]);
  const min = numOr(pick(d, "min", "floor"), 0);
  const max = numOr(pick(d, "max", "ceiling"), 1);
  const title = label ?? pickStr(d, ["label", "title", "name"], "");
  const unit = unitOf(d);
  const lowerIsBetter = bool(pick(d, "lowerIsBetter", "invert"));

  if (!Number.isFinite(value)) {
    return (
      <Panel title={title || "gauge"} index={index}>
        <Empty what="no ratio" />
      </Panel>
    );
  }

  const riskAt = num(
    pick(d, "riskAt", "warnAt", "target", "threshold"),
    lowerIsBetter ? min + (max - min) * 0.7 : min + (max - min) * 0.35,
  );
  const dangerAt = num(
    pick(d, "dangerAt", "critAt"),
    lowerIsBetter ? min + (max - min) * 0.9 : min + (max - min) * 0.15,
  );

  const breached = lowerIsBetter ? value >= dangerAt : value <= dangerAt;
  const nearing = lowerIsBetter ? value >= riskAt : value <= riskAt;
  const tone: Tone = breached ? "loss" : nearing ? "risk" : "gain";
  const state = breached ? "critical" : nearing ? "approaching threshold" : "healthy";

  const frac = clamp((value - min) / (max - min || 1), 0, 1);
  const W = 220;
  const H = 128;
  const cx = W / 2;
  const cy = 106;
  const r = 84;

  const threshFrac = clamp((riskAt - min) / (max - min || 1), 0, 1);

  return (
    <Panel title={title} index={index}>
      <div className="flex flex-col items-center">
        <svg
          role="img"
          aria-label={`${title}: ${value} of ${max}, ${state}`}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="xMidYMid meet"
          className="max-w-[260px]"
        >
          {/* Track */}
          <path d={arc(cx, cy, r, 0, 1)} fill="none" stroke="var(--hairline)" strokeWidth={16} />
          {/* Threshold notch — where the policy starts caring. */}
          <line
            x1={pt(cx, cy, r - 11, threshFrac).x}
            y1={pt(cx, cy, r - 11, threshFrac).y}
            x2={pt(cx, cy, r + 11, threshFrac).x}
            y2={pt(cx, cy, r + 11, threshFrac).y}
            stroke="var(--rule)"
            strokeWidth={1.5}
            strokeDasharray="3 2"
          />
          {/* Value */}
          <path
            d={arc(cx, cy, r, 0, Math.max(0.005, frac))}
            fill="none"
            stroke={toneVar[tone]}
            strokeWidth={16}
            strokeLinecap="butt"
          />
          <path d={arc(cx, cy, r, 0, 1)} fill="none" stroke="var(--rule)" strokeWidth={1.5} />
          <path
            d={arc(cx, cy, r - 8, 0, 1)}
            fill="none"
            stroke="var(--rule)"
            strokeWidth={1.5}
          />
          <path
            d={arc(cx, cy, r + 8, 0, 1)}
            fill="none"
            stroke="var(--rule)"
            strokeWidth={1.5}
          />
          <text
            x={cx}
            y={cy - 22}
            textAnchor="middle"
            className="fig"
            fontSize={30}
            fontWeight={500}
            fill={toneVar[tone]}
          >
            {unit === "%" ? `${value.toFixed(1)}%` : value.toFixed(2)}
          </text>
          <text x={b0(cx, r)} y={cy + 14} textAnchor="start" className="fig" fontSize={9} fill="var(--muted-ink)">
            {min}
          </text>
          <text x={b1(cx, r)} y={cy + 14} textAnchor="end" className="fig" fontSize={9} fill="var(--muted-ink)">
            {max}
          </text>
        </svg>
        <div className="mt-1 flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-2 w-2 border border-rule"
            style={{ background: toneVar[tone] }}
          />
          <Label>{state}</Label>
        </div>
        <Fig size="xs" className="mt-1 text-[var(--muted-ink)]">
          threshold {riskAt}
        </Fig>
      </div>
    </Panel>
  );
}

const b0 = (cx: number, r: number) => cx - r - 8;
const b1 = (cx: number, r: number) => cx + r + 8;
