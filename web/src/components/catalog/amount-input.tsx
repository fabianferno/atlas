"use client";

/**
 * amount_input — writes into the A2UI data model; its value feeds the context
 * of a sibling action.
 *
 * { label?, bind: "/amount", value?, token?, priceUsd?, balance?,
 *   min?, max?, step?, maxUsd? }
 *
 * IMPORTANT (Appendix A): the input is bounded by the policy caps AT RENDER
 * TIME, not only at signing. The effective ceiling is
 *   min(declared max, balance, policy.maxPerTxUsd / price, remaining lifetime cap)
 * so the user is never offered a number the signer will refuse. This is a UX
 * guarantee layered on top of enforcement, never a replacement for it.
 */

import { useEffect, useState } from "react";
import { Panel, BrutalInput, BrutalButton, Fig, Label, useRuntime, fmtUsd, fmtNum } from "@/components/brutal";
import { bindValue, clamp, dict, num, numOr, pick, pickStr, type CatProps } from "./_shared";

export function AmountInput({ data, label, onAction, index }: CatProps) {
  const d = dict(data);
  const { policy, spentUsd } = useRuntime();

  const bind = pickStr(d, ["bind", "path", "binding"]);
  const token = pickStr(d, ["token", "symbol", "asset", "unit"], "USDC");
  const price = numOr(pick(d, "priceUsd", "price"), 1);
  const balance = num(pick(d, "balance", "available"), NaN);
  const declaredMax = num(pick(d, "max", "maxAmount"), NaN);
  const min = numOr(pick(d, "min"), 0);
  const step = numOr(pick(d, "step"), 0.01);

  // Every ceiling that could apply, in token units.
  const ceilings: { why: string; v: number }[] = [];
  if (Number.isFinite(declaredMax)) ceilings.push({ why: "max", v: declaredMax });
  if (Number.isFinite(balance)) ceilings.push({ why: "balance", v: balance });
  if (policy) {
    ceilings.push({ why: "per-tx cap", v: policy.maxPerTxUsd / (price || 1) });
    ceilings.push({
      why: "lifetime cap",
      v: Math.max(0, policy.maxSpendUsd - spentUsd) / (price || 1),
    });
  }
  const capped = ceilings.length > 0 ? ceilings.reduce((a, b) => (b.v < a.v ? b : a)) : null;
  const max = capped ? Math.max(min, capped.v) : Number.POSITIVE_INFINITY;

  const initial = num(pick(d, "value", "amount"), NaN);
  const [text, setText] = useState(() => (Number.isFinite(initial) ? String(initial) : ""));

  const parsed = num(text, NaN);
  const valid = Number.isFinite(parsed) && parsed >= min && parsed <= max;
  const usd = Number.isFinite(parsed) ? parsed * price : NaN;

  // Push the clamped value into the data model so a sibling action_button's
  // `{"path": "/amount"}` context resolves to something the signer will accept.
  useEffect(() => {
    if (!valid) return;
    bindValue(onAction, bind, parsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, valid, bind]);

  const setClamped = (v: number) => setText(String(Number(clamp(v, min, max).toFixed(6))));

  return (
    <Panel index={index} title={label ?? pickStr(d, ["label", "title"], "Amount")}>
      <div className="flex flex-col gap-2">
        <div className="flex items-stretch gap-0">
          <BrutalInput
            inputMode="decimal"
            value={text}
            step={step}
            placeholder="0.00"
            aria-label={`amount in ${token}`}
            aria-invalid={text !== "" && !valid}
            onChange={(e) => setText(e.target.value)}
            className={!valid && text !== "" ? "border-loss" : undefined}
          />
          <span className="flex items-center border-y-2 border-r-2 border-rule bg-paper px-2.5 text-[0.8125rem] font-semibold uppercase">
            {token}
          </span>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Fig size="sm" className="text-[var(--muted-ink)]">
            ≈ {Number.isFinite(usd) ? fmtUsd(usd, false) : "—"}
          </Fig>
          <div className="flex gap-1">
            {[0.25, 0.5, 1].map((f) => (
              <BrutalButton
                key={f}
                size="sm"
                intent="quiet"
                disabled={!Number.isFinite(max)}
                onClick={() => setClamped(max * f)}
              >
                {f === 1 ? "max" : `${f * 100}%`}
              </BrutalButton>
            ))}
          </div>
        </div>

        {capped ? (
          <Label className={parsed >= max * 0.999 ? "text-[color:var(--risk)]" : undefined}>
            ceiling {fmtNum(max, 4)} {token} — {capped.why}
            {capped.why.includes("cap") ? " (policy)" : ""}
          </Label>
        ) : null}
        {text !== "" && !valid ? (
          <Label className="text-loss">
            enter a number between {fmtNum(min, 2)} and {Number.isFinite(max) ? fmtNum(max, 4) : "∞"}
          </Label>
        ) : null}
      </div>
    </Panel>
  );
}
