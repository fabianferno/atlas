"use client";

/**
 * confirm_dialog — a Server Event gated on an explicit human confirmation.
 * Required whenever `policy.requireConfirm` is true.
 *
 * Composer payload: { title, body, actionKey, requireConfirm }
 * plus the component's declared `action.event` (name + context), which the
 * renderer supplies — so this component does not need to know the event name.
 * Fixtures may also pass { triggerLabel, confirmLabel, cancelLabel, amountUsd,
 * target, summary: [{k, v}] }.
 *
 * Deliberately NOT a component that can be opened by the agent. The dialog
 * opens only from a user gesture — an agent that could raise its own modal
 * could raise it over something else and farm a click.
 */

import { useEffect, useRef, useState } from "react";
import { Panel, BrutalButton, Fig, Label, Hair, useRuntime, useNow, fmtUsd } from "@/components/brutal";
import { cellText, dict, list, pick, pickNum, pickStr, type CatProps } from "./_shared";
import { policyBlock } from "./action-button";

export function ConfirmDialog({ data, label, onAction, index }: CatProps) {
  const d = dict(data);
  const runtime = useRuntime();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const title = pickStr(d, ["title", "heading"], label ?? "Confirm action");
  const body = pickStr(d, ["body", "message", "detail"]);
  const trigger = pickStr(d, ["triggerLabel", "label"], label ?? "Review and confirm");
  const confirmLabel = pickStr(d, ["confirmLabel"], "Confirm");
  const cancelLabel = pickStr(d, ["cancelLabel"], "Cancel");
  const event = pickStr(d, ["event", "eventName", "name"]);
  const context = dict(pick(d, "context", "args", "params"));
  const amountUsd = pickNum(d, ["amountUsd", "costUsd", "valueUsd"]);
  const target = pickStr(d, ["target", "to", "contract"]);
  const spends = Number.isFinite(amountUsd) && amountUsd > 0;

  const summary = list(pick(d, "summary", "details")).map((s) => {
    const o = dict(s);
    return { k: pickStr(o, ["k", "key", "label"], ""), v: cellText(pick(o, "v", "value")) };
  });

  const blocked = policyBlock(runtime, amountUsd, target, now);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <Panel index={index} title={title}>
      <div className="flex flex-col gap-2">
        {body ? <p className="text-[0.8125rem] leading-snug">{body}</p> : null}
        <BrutalButton
          intent={spends ? "spend" : "primary"}
          full
          disabled={Boolean(blocked) || done}
          onClick={() => setOpen(true)}
        >
          {done ? "confirmed" : trigger}
        </BrutalButton>
        {blocked ? <Label className="text-loss">blocked · {blocked}</Label> : null}
      </div>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-4 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="panel panel--autonomous raise w-full max-w-md">
            <div className="policy-strip">
              <span>confirmation required</span>
              {spends ? <span className="ml-auto">{fmtUsd(amountUsd)}</span> : null}
            </div>
            <div className="flex flex-col gap-3 p-4">
              <h3 className="display text-[1rem] leading-tight">{title}</h3>
              {body ? <p className="text-[0.8125rem] leading-snug">{body}</p> : null}

              {summary.length > 0 ? (
                <>
                  <Hair />
                  <dl className="flex flex-col gap-1">
                    {summary.map((s) => (
                      <div key={s.k} className="flex items-baseline justify-between gap-3">
                        <Label>{s.k}</Label>
                        <Fig size="sm">{s.v}</Fig>
                      </div>
                    ))}
                  </dl>
                </>
              ) : null}

              {spends ? (
                <div className="flex items-baseline justify-between gap-3 rounded-sm border border-spend px-2 py-1.5">
                  <Label className="text-spend">value leaving wallet</Label>
                  <Fig size="md" tone="spend">
                    {fmtUsd(amountUsd)}
                  </Fig>
                </div>
              ) : null}

              <div className="flex gap-2">
                <BrutalButton intent="quiet" full onClick={() => setOpen(false)}>
                  {cancelLabel}
                </BrutalButton>
                <BrutalButton
                  ref={confirmRef}
                  intent={spends ? "spend" : "primary"}
                  full
                  onClick={() => {
                    setOpen(false);
                    setDone(true);
                    onAction?.({ name: event, context: { ...context, confirmed: true } });
                  }}
                >
                  {confirmLabel}
                </BrutalButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
