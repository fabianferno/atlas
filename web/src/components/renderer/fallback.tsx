"use client";

/**
 * What renders when the agent names something the client does not have.
 *
 * THIS IS A SECURITY SURFACE, not an error state. The alternative designs are
 * all worse:
 *   - `eval` / dynamic import on an agent-supplied name: arbitrary code
 *     execution in a page that holds a wallet. Never.
 *   - rendering nothing: the interface silently loses a component, which in an
 *     autonomous app could be the kill switch or the policy badge.
 * So: render a visible, inert placeholder that names what was asked for, and
 * keep going. The unknown name is printed as text — it is data, never markup,
 * and it is truncated so a 4KB "component name" cannot blow out the layout.
 */

import { Panel, Fig, Label } from "@/components/brutal";
import type { A2UIValidationIssue } from "./types";

export function UnknownComponent({
  id,
  name,
  index = 0,
}: {
  id: string;
  name: string;
  index?: number;
}) {
  return (
    <Panel index={index} title="Not in catalog">
      <div className="flex flex-col gap-1.5">
        <Fig size="sm" className="break-all text-loss">
          {String(name).slice(0, 96)}
        </Fig>
        <Label>
          the agent referenced a component this client does not hold — nothing was
          executed
        </Label>
        <Fig size="xs" className="text-[var(--muted-ink)]">
          id {String(id).slice(0, 64)}
        </Fig>
      </div>
    </Panel>
  );
}

/** The document itself did not fold into anything renderable. */
export function EmptySurface({
  reason,
  issues = [],
}: {
  reason: string;
  issues?: A2UIValidationIssue[];
}) {
  return (
    <div className="panel flex min-h-32 flex-col items-center justify-center gap-2 p-6">
      <Label>{reason}</Label>
      {issues.slice(0, 4).map((i, n) => (
        <Fig key={n} size="xs" className="text-[var(--muted-ink)]">
          {i.code} — {i.message}
        </Fig>
      ))}
    </div>
  );
}
