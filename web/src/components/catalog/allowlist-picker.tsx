"use client";

/**
 * allowlist_picker — chooses a target for a subsequent action. Writes into the
 * data model.
 *
 * Composer payload:
 *   { options: [{ address, label }], selected: string|null,
 *     empty: boolean, note }
 * The composer's action reads `/inputs/target`, so that is the default bind
 * pointer. `empty: true` means the policy allowlist is empty, which means the
 * app cannot act at all — say so rather than showing an empty list.
 *
 * SECURITY: this component renders the INTERSECTION of the composer's options
 * and `policy.allowlist`. An option the policy has not approved is dropped and
 * counted, never shown as a selectable-but-disabled row — an address a user
 * can see in a picker is an address they will assume is safe. Indexed onchain
 * labels are attacker-controlled (contracts/policy.ts), so the address is the
 * identity here and the label is only ever decoration next to it.
 */

import { useEffect, useState } from "react";
import { Panel, Label, Fig, Empty, Tag, useRuntime, shortAddr } from "@/components/brutal";
import { cn } from "@/lib/utils";
import { bindValue, dict, list, pickStr, type CatProps } from "./_shared";

export function AllowlistPicker({ data, label, onAction, index }: CatProps) {
  const d = dict(data);
  const { policy } = useRuntime();
  const bind = pickStr(d, ["bind", "path", "binding"], "/inputs/target");

  const proposed = list(d.options ?? d.targets ?? d.items).map((o) => {
    const t = dict(o);
    return {
      address: pickStr(t, ["address", "target", "id", "value"], ""),
      label: pickStr(t, ["label", "name", "protocol"], ""),
      network: pickStr(t, ["network", "chain"], ""),
    };
  }).filter((o) => o.address);

  const allow = policy?.allowlist ?? null;
  const permitted = allow
    ? proposed.filter((o) => allow.some((a) => a.toLowerCase() === o.address.toLowerCase()))
    : proposed;
  const dropped = proposed.length - permitted.length;

  const [selected, setSelected] = useState(() => {
    const v = pickStr(d, ["selected", "value"]);
    return permitted.some((o) => o.address === v) ? v : (permitted[0]?.address ?? "");
  });

  useEffect(() => {
    if (selected) bindValue(onAction, bind, selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, bind]);

  return (
    <Panel
      index={index}
      title={label ?? pickStr(d, ["label", "title"], "Target")}
      meta={
        <Fig size="xs" className="text-[var(--muted-ink)]">
          {permitted.length} allowed
        </Fig>
      }
      flush
    >
      {permitted.length === 0 ? (
        <div className="p-3">
          <Empty what="no allowlisted targets — the app cannot act" />
        </div>
      ) : (
        <ul role="radiogroup" aria-label="allowlisted targets" className="flex flex-col">
          {permitted.map((o) => {
            const on = o.address === selected;
            return (
              <li key={o.address} className="border-b border-hairline last:border-b-0">
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setSelected(o.address)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left",
                    on && "bg-ink/[0.05]",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "h-3 w-3 shrink-0 border-[1.5px] border-rule",
                      on && "bg-live",
                    )}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cn("truncate text-[0.8125rem]", on && "font-semibold")}>
                      {o.label || "unlabelled target"}
                    </span>
                    <Fig size="xs" className="text-[var(--muted-ink)]" title={o.address}>
                      {shortAddr(o.address, 10, 6)}
                    </Fig>
                  </span>
                  {o.network ? (
                    <Tag className="border-hairline text-[var(--muted-ink)]">{o.network}</Tag>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-hairline px-3 py-1.5">
        <Label>
          {allow
            ? `policy allowlist · ${allow.length} address${allow.length === 1 ? "" : "es"}`
            : "no policy bound — showing composer options"}
          {dropped > 0 ? (
            <span className="ml-1 text-loss">· {dropped} proposed target(s) rejected</span>
          ) : null}
        </Label>
      </div>
    </Panel>
  );
}
