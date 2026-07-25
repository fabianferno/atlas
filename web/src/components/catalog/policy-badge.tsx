"use client";

/**
 * policy_badge — mandatory in every autonomous app. Answers "what is this
 * thing allowed to do?" without the user having to ask.
 *
 * Composer payload is `ComposePolicyView` (lib/kit/composer.ts) inlined:
 *   { tier, maxSpendUsd, maxPerTxUsd, allowlist: string[], expiresAt,
 *     requireConfirm, killSwitch, halted, spentUsd }
 * Note there is no `wallet` — the composer renders a policy, it never grants
 * one, so a wallet only exists once the publish step binds a smart account.
 *
 * Falls back to the client-held runtime policy when the composer omits one —
 * an agent must not be able to hide the policy by simply not emitting it.
 *
 * Everything here is a fact about enforcement, so everything is mono. The
 * lifetime-cap meter is violet because it measures money leaving (Rule 2).
 */

import { Panel, Fig, Label, Hair, Tag, useRuntime, useNow, fmtUsd, fmtUntil, shortAddr } from "@/components/brutal";
import { cn } from "@/lib/utils";
import { clamp, dict, list, numOr, pick, str, type CatProps } from "./_shared";
import type { Policy } from "@/lib/contracts/manifest";

function readPolicy(v: unknown, fallback: Policy | null): Policy | null {
  const o = dict(v);
  if (Object.keys(o).length === 0) return fallback;
  return {
    wallet: str(pick(o, "wallet", "address")) || fallback?.wallet || null,
    maxSpendUsd: numOr(pick(o, "maxSpendUsd", "lifetimeCapUsd"), fallback?.maxSpendUsd ?? 0),
    maxPerTxUsd: numOr(pick(o, "maxPerTxUsd", "perTxCapUsd"), fallback?.maxPerTxUsd ?? 0),
    allowlist: list(pick(o, "allowlist", "targets")).map((a) => str(a)).filter(Boolean),
    expiresAt: str(pick(o, "expiresAt", "expiry")) || fallback?.expiresAt || null,
    requireConfirm: pick(o, "requireConfirm") === undefined
      ? (fallback?.requireConfirm ?? true)
      : Boolean(pick(o, "requireConfirm")),
    killSwitch: pick(o, "killSwitch") === undefined
      ? (fallback?.killSwitch ?? true)
      : Boolean(pick(o, "killSwitch")),
    halted: pick(o, "halted") === undefined
      ? (fallback?.halted ?? false)
      : Boolean(pick(o, "halted")),
  };
}

export function PolicyBadge({ data, label, index }: CatProps) {
  const d = dict(data);
  const runtime = useRuntime();
  const now = useNow();
  const policy = readPolicy(pick(d, "policy") ?? d, runtime.policy);
  const spent = numOr(pick(d, "spentUsd", "spent"), runtime.spentUsd);

  if (!policy) {
    return (
      <Panel index={index} title={label ?? "Policy"}>
        <Label>read-only app — no wallet, no policy, cannot act</Label>
      </Panel>
    );
  }

  const expired = Boolean(
    now > 0 && policy.expiresAt && new Date(policy.expiresAt).getTime() <= now,
  );
  const frac = policy.maxSpendUsd > 0 ? clamp(spent / policy.maxSpendUsd, 0, 1) : 0;
  const dead = policy.halted || expired || policy.allowlist.length === 0;

  return (
    <Panel
      index={index}
      title={label ?? "Policy"}
      policyStrip={
        <>
          <span>policy enforced at signer</span>
          <span className="ml-auto">
            {dead ? "inactive" : `${fmtUsd(policy.maxPerTxUsd, false)} / tx`}
          </span>
        </>
      }
      meta={
        policy.halted ? (
          <Tag tone="loss" filled>
            halted
          </Tag>
        ) : expired ? (
          <Tag tone="loss">expired</Tag>
        ) : (
          <Tag tone="gain">active</Tag>
        )
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <Item k="per tx cap" v={fmtUsd(policy.maxPerTxUsd, false)} />
          <Item k="lifetime cap" v={fmtUsd(policy.maxSpendUsd, false)} />
          <Item
            k="allowlist"
            v={`${policy.allowlist.length} target${policy.allowlist.length === 1 ? "" : "s"}`}
            tone={policy.allowlist.length === 0 ? "loss" : "neutral"}
          />
          <Item
            k="expires"
            v={
              policy.expiresAt
                ? now > 0
                  ? fmtUntil(policy.expiresAt, new Date(now))
                  : "—"
                : "never"
            }
            tone={expired ? "loss" : "neutral"}
          />
        </div>

        <Hair />

        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <Label>spent against lifetime cap</Label>
            <Fig size="sm" tone={spent > 0 ? "spend" : "neutral"}>
              {fmtUsd(spent, false)} / {fmtUsd(policy.maxSpendUsd, false)}
            </Fig>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full border border-hairline">
            <div className="h-full bg-spend" style={{ width: `${frac * 100}%` }} />
          </div>
        </div>

        <Hair />

        <div className="flex flex-wrap items-center gap-1.5">
          <Tag tone={policy.requireConfirm ? "gain" : "risk"}>
            {policy.requireConfirm ? "confirm required" : "no confirm"}
          </Tag>
          <Tag tone={policy.killSwitch ? "gain" : "loss"}>
            {policy.killSwitch ? "kill switch" : "no kill switch"}
          </Tag>
          {policy.wallet ? (
            <Tag className="border-hairline text-[var(--muted-ink)]">
              {shortAddr(policy.wallet, 8, 6)}
            </Tag>
          ) : (
            <Tag className="border-hairline text-[var(--muted-ink)]">wallet at publish</Tag>
          )}
        </div>

        {policy.allowlist.length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {policy.allowlist.slice(0, 4).map((a) => (
              <li key={a}>
                <Fig size="xs" className="text-[var(--muted-ink)]" title={a}>
                  {shortAddr(a, 12, 8)}
                </Fig>
              </li>
            ))}
            {policy.allowlist.length > 4 ? (
              <li>
                <Label>+{policy.allowlist.length - 4} more</Label>
              </li>
            ) : null}
          </ul>
        ) : (
          <Label className="text-loss">empty allowlist — no actions permitted</Label>
        )}
      </div>
    </Panel>
  );
}

function Item({
  k,
  v,
  tone = "neutral",
}: {
  k: string;
  v: string;
  tone?: "neutral" | "loss" | "risk";
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <Label>{k}</Label>
      <Fig size="sm" tone={tone} className={cn(tone !== "neutral" && "font-semibold")}>
        {v}
      </Fig>
    </div>
  );
}
