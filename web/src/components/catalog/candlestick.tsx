"use client";

/**
 * candlestick — data shape: `ohlcv`.
 *
 * Composer payload: { points: [{ t, o, h, l, c, v }] }
 * Also accepts { candles | ohlcv | rows: [...] }.
 *
 * The one chart where two colours are legitimate: up and down are `--gain` and
 * `--loss`, which are semantic, not a categorical palette. Hollow bodies for
 * up candles keeps the field light — a wall of solid green reads as decoration.
 */

import {
  Panel,
  Empty,
  ScrollX,
  ChartSvg,
  YAxis,
  XLabels,
  Frame,
  box,
  plotH,
  plotW,
  scale,
  niceDomain,
  fmtCompact,
  fmtStamp,
  Fig,
  Tag,
} from "@/components/brutal";
import { dict, list, num, pickStr, str, type CatProps } from "./_shared";

function toTime(v: unknown): number {
  if (typeof v === "number") return v < 1e11 ? v * 1000 : v;
  const s = str(v);
  const n = Number(s);
  if (Number.isFinite(n) && s !== "") return n < 1e11 ? n * 1000 : n;
  const d = Date.parse(s);
  return Number.isFinite(d) ? d : NaN;
}

export function Candlestick({ data, label, index }: CatProps) {
  const d = dict(data);
  const title = label ?? pickStr(d, ["label", "title", "pair", "market"], "");
  const unit = pickStr(d, ["unit", "units"], "usd");

  const candles = list(
    d.points ?? d.candles ?? d.ohlcv ?? d.rows ?? (Array.isArray(data) ? data : []),
  )
    .map((c) => {
      const o = dict(c);
      return {
        t: toTime(o.t ?? o.time ?? o.timestamp ?? o.date),
        o: num(o.o ?? o.open, NaN),
        h: num(o.h ?? o.high, NaN),
        l: num(o.l ?? o.low, NaN),
        c: num(o.c ?? o.close, NaN),
        v: num(o.v ?? o.volume, NaN),
      };
    })
    .filter((c) => Number.isFinite(c.o) && Number.isFinite(c.c) && Number.isFinite(c.h))
    .sort((a, b) => a.t - b.t);

  if (candles.length === 0) {
    return (
      <Panel title={title || "candles"} index={index}>
        <Empty what="no ohlcv" />
      </Panel>
    );
  }

  const lows = candles.map((c) => (Number.isFinite(c.l) ? c.l : Math.min(c.o, c.c)));
  const highs = candles.map((c) => (Number.isFinite(c.h) ? c.h : Math.max(c.o, c.c)));
  const [lo, hi, ticks] = niceDomain(Math.min(...lows), Math.max(...highs), 4);

  const b = box(520, 200, { left: 50, top: 12, bottom: 22, right: 10 });
  const pw = plotW(b);
  const step = pw / candles.length;
  const bw = Math.max(2, Math.min(11, step * 0.62));
  const y = scale(lo, hi, b.top + plotH(b), b.top);
  const cx = (i: number) => b.left + step * (i + 0.5);

  const first = candles[0];
  const last = candles[candles.length - 1];
  const changePct = first.o ? ((last.c - first.o) / first.o) * 100 : 0;

  return (
    <Panel
      title={title}
      index={index}
      meta={
        <>
          <Fig size="sm">{fmtCompact(last.c)}</Fig>
          <Tag tone={changePct >= 0 ? "gain" : "loss"}>
            {changePct >= 0 ? "+" : ""}
            {changePct.toFixed(2)}%
          </Tag>
        </>
      }
    >
      <ScrollX minWidth={Math.max(420, candles.length * 9)}>
        <ChartSvg b={b} label={`${title} candles`}>
          <YAxis b={b} ticks={ticks} y={y} format={(v) => fmtCompact(v)} />
          <Frame b={b} />
          {candles.map((c, i) => {
            const up = c.c >= c.o;
            const stroke = up ? "var(--gain)" : "var(--loss)";
            const top = y(Math.max(c.o, c.c));
            const bot = y(Math.min(c.o, c.c));
            return (
              <g key={i}>
                <line
                  x1={cx(i)}
                  x2={cx(i)}
                  y1={y(highs[i])}
                  y2={y(lows[i])}
                  stroke={stroke}
                  strokeWidth={1}
                />
                <rect
                  x={cx(i) - bw / 2}
                  y={top}
                  width={bw}
                  height={Math.max(1, bot - top)}
                  fill={up ? "var(--card-b)" : "var(--loss)"}
                  stroke={stroke}
                  strokeWidth={1}
                />
              </g>
            );
          })}
          <XLabels
            b={b}
            items={[0, 0.5, 1].map((f) => {
              const i = Math.round(f * (candles.length - 1));
              return { x: cx(i), text: fmtStamp(candles[i].t) };
            })}
          />
        </ChartSvg>
      </ScrollX>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem] text-[var(--muted-ink)]">
        <span>
          O <Fig size="xs">{fmtCompact(last.o)}</Fig>
        </span>
        <span>
          H <Fig size="xs">{fmtCompact(highs[highs.length - 1])}</Fig>
        </span>
        <span>
          L <Fig size="xs">{fmtCompact(lows[lows.length - 1])}</Fig>
        </span>
        <span>
          C <Fig size="xs">{fmtCompact(last.c)}</Fig>
        </span>
        {Number.isFinite(last.v) ? (
          <span>
            VOL <Fig size="xs">{fmtCompact(last.v)}</Fig> {unit === "usd" ? "$" : unit}
          </span>
        ) : null}
      </div>
    </Panel>
  );
}
