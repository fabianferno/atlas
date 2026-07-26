"use client";

/**
 * position_card — data shape: `held_position`. Something the wallet actually
 * holds, so it is the display component most likely to sit next to an action.
 *
 * Composer payload:
 *   { label, size, sizeLabel, risk, riskLabel,
 *     entries: [{ label, value, unit }],
 *     positions: [{ label, size, risk }] }
 *
 * The composer does not know what "entry price" or "PnL" mean — it resolves
 * field ROLES (a size metric and a risk metric) and hands over the rest as
 * labelled entries. So the primary layout is size + risk + an entries grid.
 * The named DeFi fields (entry / mark / pnl / healthFactor / liquidationPrice)
 * are read when a hand-written payload supplies them, and upgrade the card.
 *
 * `risk` gets `--risk` when it is a health-factor-shaped number under 1.35 —
 * the one figure that decides whether an autonomous app needs to act.
 */

import {
  Panel,
  Fig,
  Label,
  Empty,
  Address,
  Tag,
  Hair,
  ScrollList,
  fmtUsd,
  fmtNum,
  fmtValue,
  fmtSignedPct,
} from "@/components/brutal";
import { cn } from "@/lib/utils";
import { dict, list, num, pickNum, pickStr, str, hintsOf, type CatProps, type Dict } from "./_shared";

const HF_LIKE = /(health|hf|ratio|factor)/i;

export function PositionCard({ data, label, index }: CatProps) {
  const d = dict(data);
  const hints = hintsOf(d);

  const title = label ?? pickStr(d, ["label", "title", "asset", "symbol", "market", "pair"], "Position");
  const asset = pickStr(d, ["asset", "symbol", "token"]);
  const side = pickStr(d, ["side", "direction", "kind"]);
  const protocol = pickStr(d, ["protocol", "venue"]);
  const network = pickStr(d, ["network", "chain"]);
  const account = pickStr(d, ["account", "address", "wallet"]);

  const size = pickNum(d, ["size", "amount", "quantity", "qty"]);
  const sizeLabel = pickStr(d, ["sizeLabel"], "size");
  const risk = pickNum(d, ["risk", "healthFactor", "health", "hf"]);
  const riskLabel = pickStr(d, ["riskLabel"], "risk");

  // Optional richer fields — present only in hand-written payloads.
  const sizeUsd = pickNum(d, ["sizeUsd", "valueUsd", "notionalUsd", "notional"]);
  const entry = pickNum(d, ["entry", "entryPrice", "avgPrice"]);
  const mark = pickNum(d, ["mark", "markPrice", "price", "current"]);
  const pnlUsd = pickNum(d, ["pnlUsd", "pnl", "unrealizedPnl"]);
  const pnlPct = pickNum(d, ["pnlPct", "roi", "returnPct"]);
  const liq = pickNum(d, ["liquidationPrice", "liqPrice", "liquidation"]);

  const entries = list(d.entries).map((e) => {
    const o: Dict = dict(e);
    return {
      label: pickStr(o, ["label", "name"], "—"),
      value: o.value,
      unit: pickStr(o, ["unit", "units"]) === "none" ? "" : pickStr(o, ["unit", "units"]),
    };
  });

  const others = list(d.positions).slice(1).map((p) => {
    const o = dict(p);
    return {
      label: pickStr(o, ["label", "name"], "—"),
      size: num(o.size, NaN),
      risk: num(o.risk, NaN),
    };
  });

  if (!Number.isFinite(size) && entries.length === 0 && !asset) {
    return (
      <Panel title={title} index={index}>
        <Empty what="no position" />
      </Panel>
    );
  }

  const hasPnl = Number.isFinite(pnlUsd) || Number.isFinite(pnlPct);
  const up = Number.isFinite(pnlUsd) ? pnlUsd >= 0 : pnlPct >= 0;
  const pnlTone = hasPnl ? (up ? "gain" : "loss") : "neutral";

  const riskIsHf = HF_LIKE.test(riskLabel) || Number.isFinite(pickNum(d, ["healthFactor"]));
  const riskTone = !Number.isFinite(risk)
    ? "neutral"
    : riskIsHf
      ? risk < 1.1
        ? "loss"
        : risk < 1.35
          ? "risk"
          : "gain"
      : hints.accent === "loss"
        ? "loss"
        : "neutral";

  const liqDistPct =
    Number.isFinite(liq) && Number.isFinite(mark) && mark !== 0
      ? ((mark - liq) / mark) * 100
      : NaN;

  return (
    <Panel
      index={index}
      title={title}
      meta={
        <>
          {side ? (
            <Tag tone={side === "short" || side === "borrow" ? "loss" : "neutral"}>{side}</Tag>
          ) : null}
          {protocol ? <Tag>{protocol}</Tag> : null}
          {network ? (
            <Tag className="border-hairline text-[var(--muted-ink)]">{network}</Tag>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-col">
            <Label>{sizeLabel}</Label>
            <Fig size="lg">
              {Number.isFinite(size) ? fmtValue(size, hints.unit) : "—"}
              {asset ? (
                <span className="ml-1 text-[0.8125rem] text-[var(--muted-ink)]">{asset}</span>
              ) : null}
            </Fig>
            {Number.isFinite(sizeUsd) ? (
              <Fig size="xs" className="text-[var(--muted-ink)]">
                {fmtUsd(sizeUsd)}
              </Fig>
            ) : null}
          </div>

          {hasPnl ? (
            <div className="flex flex-col items-end">
              <Label>unrealised</Label>
              <Fig size="lg" tone={pnlTone}>
                {Number.isFinite(pnlUsd)
                  ? `${pnlUsd >= 0 ? "+" : "-"}${fmtUsd(Math.abs(pnlUsd))}`
                  : "—"}
              </Fig>
              {Number.isFinite(pnlPct) ? (
                <Fig size="xs" tone={pnlTone}>
                  {fmtSignedPct(pnlPct, 2)}
                </Fig>
              ) : null}
            </div>
          ) : Number.isFinite(risk) ? (
            <div className="flex flex-col items-end">
              <Label>{riskLabel}</Label>
              <Fig size="lg" tone={riskTone}>
                {fmtNum(risk, 2)}
              </Fig>
            </div>
          ) : null}
        </div>

        {entries.length > 0 || Number.isFinite(entry) ? <Hair /> : null}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {Number.isFinite(entry) ? <Cell k="entry" v={fmtUsd(entry, false)} /> : null}
          {Number.isFinite(mark) ? <Cell k="mark" v={fmtUsd(mark, false)} /> : null}
          {Number.isFinite(liq) ? (
            <Cell
              k="liq. price"
              v={fmtUsd(liq, false)}
              tone={Number.isFinite(liqDistPct) && Math.abs(liqDistPct) < 15 ? "risk" : "neutral"}
              note={Number.isFinite(liqDistPct) ? `${liqDistPct.toFixed(1)}% away` : undefined}
            />
          ) : null}
          {hasPnl && Number.isFinite(risk) ? (
            <Cell k={riskLabel} v={fmtNum(risk, 2)} tone={riskTone} />
          ) : null}
          {entries.map((e, i) => (
            <Cell
              key={`${e.label}-${i}`}
              k={e.label}
              v={
                typeof e.value === "number"
                  ? fmtValue(e.value, e.unit)
                  : str(e.value, "—") || "—"
              }
            />
          ))}
        </dl>

        {others.length > 0 ? (
          <>
            <Hair />
            {/* The other positions are a list of unknown length under a card of
                fixed height; bound it or the card stops being a card. */}
            <ScrollList count={others.length} est={20}>
              <ul className="flex flex-col gap-1">
                {others.map((p, i) => (
                  <li
                    key={`${p.label}-${i}`}
                    data-row
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="truncate text-[0.75rem]">{p.label}</span>
                    <Fig size="xs" className="text-[var(--muted-ink)]">
                      {Number.isFinite(p.size) ? fmtValue(p.size, hints.unit) : "—"}
                    </Fig>
                  </li>
                ))}
              </ul>
            </ScrollList>
          </>
        ) : null}

        {account ? (
          <>
            <Hair />
            <Address value={account} label="account" size="xs" />
          </>
        ) : null}
      </div>
    </Panel>
  );
}

function Cell({
  k,
  v,
  tone = "neutral",
  note,
}: {
  k: string;
  v: string;
  tone?: "neutral" | "gain" | "loss" | "risk";
  note?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <Label>{k}</Label>
      <Fig size="sm" tone={tone} className={cn(tone !== "neutral" && "font-semibold")}>
        {v}
      </Fig>
      {note ? (
        <span className="truncate text-[0.625rem] text-[var(--muted-ink)]">{note}</span>
      ) : null}
    </div>
  );
}
