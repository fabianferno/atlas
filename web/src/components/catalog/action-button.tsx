"use client";

/**
 * action_button — the core action primitive. Emits an A2UI Server Event, which
 * the agent turns into a proposed action, which the policy engine either
 * allows or rejects, and only then reaches the signer.
 *
 * Composer payload:
 *   { label, kind, actionKey, blocked: boolean, blockedReason: string }
 * plus, from the component definition (merged in by the renderer):
 *   hints.accent === "spend", `disabled` (bound to /status/halted), and the
 *   declared `action.event` whose name and context the renderer supplies.
 *
 * Also accepts { event, context, amountUsd, target, intent } for fixtures.
 *
 * The render-time guard below is DEFENCE IN DEPTH, not enforcement. Real
 * enforcement is `evaluatePolicy` at the signer (contracts/policy.ts) and the
 * onchain session key. A disabled button must never be the only thing standing
 * between an agent and a wallet — but a button that is obviously dead is much
 * better UX than a rejection after the click.
 */

import { useState } from "react";
import { Panel, BrutalButton, Fig, Label, Tag, useRuntime, useNow, fmtUsd } from "@/components/brutal";
import { dict, pickNum, pickStr, bool, pick, str, hintsOf, type CatProps } from "./_shared";

type Intent = "default" | "primary" | "spend" | "danger";

/**
 * Why a button is dead, in the user's words.
 *
 * `now` comes from `useNow()` — 0 means "clock not established yet" (server
 * render / pre-hydration), in which case the expiry check is skipped rather
 * than guessed. Expiry is enforced at the signer regardless.
 */
export function policyBlock(
  runtime: ReturnType<typeof useRuntime>,
  amountUsd: number,
  target: string,
  now: number,
): string | null {
  const { tier, policy, spentUsd } = runtime;
  if (tier === "readonly") return "read-only app — cannot act";
  if (!policy) return null;
  if (policy.halted) return "halted";
  // NO `if (!policy.wallet)` GATE — deliberately, and this is worth explaining
  // because it looks like a missing check.
  //
  // It used to be here, and it was right when a manifest carried a per-app wallet
  // address. It no longer is: those addresses were invented, nobody held the keys,
  // and the UI was inviting people to fund them — so `policy.wallet` is now `null`
  // until a publish binds a real one. The signer is a SERVER fact, read from
  // `POST /api/agency/register`, and a null here means "the manifest does not name
  // one", not "none exists".
  //
  // Leaving the gate in place turned a correct null into a false negative that
  // disabled every action in every autonomous app — the entire surface §7 exists
  // to argue for, dead behind "no wallet bound". Nothing is lost by dropping it:
  // this function is defence in depth (see the header), and `/api/act` reads the
  // policy from the server-side registry and refuses on its own. Verified: an
  // over-cap proposal comes back `allowed: false, reason: exceeds_per_tx_cap`
  // with no signature attempted.
  if (now > 0 && policy.expiresAt && new Date(policy.expiresAt).getTime() <= now) {
    return "policy expired";
  }
  if (policy.allowlist.length === 0) return "empty allowlist — no actions permitted";
  if (target && !policy.allowlist.some((a) => a.toLowerCase() === target.toLowerCase())) {
    return "target not allowlisted";
  }
  if (Number.isFinite(amountUsd) && amountUsd > policy.maxPerTxUsd) {
    return `over per-tx cap (${fmtUsd(policy.maxPerTxUsd)})`;
  }
  if (Number.isFinite(amountUsd) && spentUsd + amountUsd > policy.maxSpendUsd) {
    return `over lifetime cap (${fmtUsd(policy.maxSpendUsd)})`;
  }
  return null;
}

export function ActionButton({ data, label, onAction, index }: CatProps) {
  const d = dict(data);
  const runtime = useRuntime();
  const now = useNow();
  const [fired, setFired] = useState(false);

  const text = label ?? pickStr(d, ["label", "text", "title"], "Run");
  const event = pickStr(d, ["event", "eventName", "name"]);
  const context = dict(pick(d, "context", "args", "params"));
  const amountUsd = pickNum(d, ["amountUsd", "costUsd", "valueUsd"]);
  const target = pickStr(d, ["target", "to", "contract"]);
  const explicitIntent = pickStr(d, ["intent", "variant"]) as Intent | "";
  const hints = hintsOf(d);
  // Violet is earned two ways and only two: a declared USD amount, or the
  // composer marking the block with the `spend` accent (Rule 2).
  const spends = (Number.isFinite(amountUsd) && amountUsd > 0) || hints.accent === "spend";

  // Violet only when value leaves a wallet (Rule 2). The composer cannot opt
  // into it decoratively — declaring an amountUsd is what earns the colour.
  const intent: Intent =
    explicitIntent === "danger"
      ? "danger"
      : spends
        ? "spend"
        : explicitIntent === "primary"
          ? "primary"
          : "default";

  const blocked = policyBlock(runtime, amountUsd, target, now);
  // The composer pre-computes both: `blocked` (empty allowlist) and `disabled`
  // (bound to /status/halted). Either kills the button.
  const declaredDisabled = bool(pick(d, "disabled")) || bool(pick(d, "blocked"));
  const reason =
    blocked ??
    (declaredDisabled
      ? pickStr(d, ["blockedReason", "disabledReason"], "unavailable")
      : null);
  const disabled = Boolean(reason);

  return (
    <Panel
      index={index}
      title={pickStr(d, ["title"]) || undefined}
      meta={target ? <Tag className="border-hairline text-[var(--muted-ink)]">{str(target).slice(0, 18)}</Tag> : undefined}
    >
      <div className="flex flex-col gap-2">
        <BrutalButton
          intent={intent}
          full
          disabled={disabled}
          aria-describedby={reason ? "action-reason" : undefined}
          onClick={() => {
            if (disabled) return;
            setFired(true);
            onAction?.({ name: event, context });
          }}
        >
          {text}
          {spends ? (
            <Fig size="xs" className="text-inherit opacity-80">
              {fmtUsd(amountUsd)}
            </Fig>
          ) : null}
        </BrutalButton>

        <div className="flex items-baseline justify-between gap-2">
          {reason ? (
            <Label id="action-reason" className="text-loss">
              blocked · {reason}
            </Label>
          ) : spends ? (
            <Label className="text-spend">moves value</Label>
          ) : (
            <Label>server event{event ? ` · ${event}` : ""}</Label>
          )}
          {fired ? <Label className="text-live">dispatched</Label> : null}
        </div>
      </div>
    </Panel>
  );
}
