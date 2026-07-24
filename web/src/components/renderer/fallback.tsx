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
 * keep going. The unknown name is printed as text — it is data, never markup.
 */

import { Panel, Fig, Label } from "@/components/brutal";

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

/** A child ID that points at nothing. Usually a truncated stream. */
export function DanglingRef({ id, index = 0 }: { id: string; index?: number }) {
  return (
    <Panel index={index} title="Missing component">
      <Label>
        referenced id <span className="fig">{String(id).slice(0, 64)}</span> is not in
        this surface
      </Label>
    </Panel>
  );
}

/** The document itself did not parse into anything renderable. */
export function EmptySurface({ reason }: { reason: string }) {
  return (
    <div className="panel flex min-h-32 items-center justify-center p-6">
      <Label>{reason}</Label>
    </div>
  );
}
